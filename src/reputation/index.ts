import type { JobResult } from "../orchestrator/types.js";
import { JsonStore, storePath } from "../store/jsonStore.js";

/** One recorded outcome for an agent — the atom reputation is built from. */
export interface ReputationEvent {
  agentId: string;
  jobId: string;
  /** Evaluator score for the attempt, 0..1. */
  score: number;
  accepted: boolean;
  /** Net X402 the attempt moved for this agent (reward − skill costs, or −costs). */
  earnedX402: number;
  /** Monotonic tick counter — deterministic ordering without wall-clock. */
  tick: number;
}

/** Aggregated standing for one agent, derived from its event history. */
export interface Reputation {
  agentId: string;
  jobs: number;
  wins: number;
  /** wins / jobs, 0..1. */
  winRate: number;
  /** Mean evaluator score across all attempts, 0..1. */
  avgScore: number;
  netX402: number;
  /**
   * Composite standing 0..100 that hiring decisions can rank on. Blends quality
   * (avg score), reliability (win rate), and proven volume (a saturating bonus
   * so a 50-job veteran outranks a lucky 1-job newcomer at equal quality).
   */
  score: number;
}

interface ReputationState {
  events: ReputationEvent[];
}

/**
 * The reputation ledger — the memory that turns a one-shot bake-off into a
 * durable market. Every judged attempt is recorded; standings are derived on
 * read so the formula can evolve without migrating history. This is what lets
 * the autonomous daemon prefer proven workers and lets good authors compound.
 */
export class ReputationImpl {
  private readonly store: JsonStore<ReputationState>;

  constructor(path = storePath("reputation")) {
    this.store = new JsonStore<ReputationState>(path, { events: [] });
  }

  /** Append one judged outcome to an agent's permanent record. */
  record(event: ReputationEvent): void {
    this.store.write((s) => {
      s.events.push(event);
    });
  }

  /** All events for one agent, oldest first. */
  history(agentId: string): ReputationEvent[] {
    return this.store.read().events.filter((e) => e.agentId === agentId);
  }

  /** Current standing for one agent (a zeroed record if it has no history). */
  standing(agentId: string): Reputation {
    return aggregate(agentId, this.history(agentId));
  }

  /** Every agent's standing, ranked best-first — the market leaderboard. */
  leaderboard(): Reputation[] {
    const byAgent = new Map<string, ReputationEvent[]>();
    for (const e of this.store.read().events) {
      const list = byAgent.get(e.agentId) ?? [];
      list.push(e);
      byAgent.set(e.agentId, list);
    }
    return [...byAgent.entries()]
      .map(([id, events]) => aggregate(id, events))
      .sort((a, b) => b.score - a.score);
  }
}

/** Derive an agent's standing from its raw event list. */
function aggregate(agentId: string, events: ReputationEvent[]): Reputation {
  const jobs = events.length;
  if (jobs === 0) {
    return { agentId, jobs: 0, wins: 0, winRate: 0, avgScore: 0, netX402: 0, score: 0 };
  }
  const wins = events.filter((e) => e.accepted).length;
  const winRate = wins / jobs;
  const avgScore = events.reduce((sum, e) => sum + e.score, 0) / jobs;
  const netX402 = events.reduce((sum, e) => sum + e.earnedX402, 0);

  // Quality 60% + reliability 25% + volume 15% (saturating at ~20 jobs), 0..100.
  const volume = 1 - Math.exp(-jobs / 20);
  const score = round2(100 * (0.6 * avgScore + 0.25 * winRate + 0.15 * volume));

  return { agentId, jobs, wins, winRate: round2(winRate), avgScore: round2(avgScore), netX402, score };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
