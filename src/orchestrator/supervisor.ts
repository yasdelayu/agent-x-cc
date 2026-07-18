import type { Job, JobResult, Orchestrator, Skill } from "./types.js";
import { runAgent } from "../runAgent.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { ExchangeImpl } from "../exchange/index.js";
import { ReputationImpl } from "../reputation/index.js";
import { ACCEPT_THRESHOLD, judge } from "./evaluator.js";

export interface SupervisorDeps {
  marketplace: MarketplaceImpl;
  exchange: ExchangeImpl;
  /** Worker engines that compete for each job. Best-scoring result wins. */
  workerEngines: string[];
  /** Optional reputation ledger — records every judged attempt when present. */
  reputation?: ReputationImpl;
}

/**
 * The Supervisor IS "agents managing agents": for one job it hires a worker on
 * every configured engine (a bake-off), has the evaluator score each output,
 * accepts the best if it clears the bar, and settles the reward in X402 —
 * releasing escrow to the winner or refunding the poster. Every actor is the
 * same runAgent(engine, task) primitive; only coordination + money are added.
 */
export class Supervisor implements Orchestrator {
  constructor(private readonly deps: SupervisorDeps) {}

  /** Split a goal into independently-hireable sub-tasks (1:1 for now). */
  async decompose(job: Job): Promise<Job[]> {
    return [job];
  }

  /** Load the job's required skills onto a worker, then run it on one engine. */
  async hire(job: Job, workerId: string, engine?: string): Promise<JobResult> {
    const skills: Skill[] = [];
    let skillCost = 0;
    for (const id of job.requiredSkills) {
      const skill = await this.deps.marketplace.load(id, workerId);
      skills.push(skill);
      skillCost += skill.priceX402;
    }

    const chosen = engine || skills[0]?.preferredEngine;
    const agentResult = await runAgent({
      engine: chosen,
      prompt: composePrompt(job, skills),
    });

    return {
      jobId: job.id,
      workerId,
      agentResult,
      accepted: false,
      // Skills already cost the worker; reward (if won) is added at settle time.
      settledX402: -skillCost,
    };
  }

  /** Score a worker result on the 7 quality dimensions (≥8/10 to pass). */
  async evaluate(result: JobResult): Promise<JobResult> {
    const score = judge(result);
    return { ...result, score, accepted: score >= ACCEPT_THRESHOLD };
  }

  /**
   * decompose → hire across engines → judge → accept best → settle in X402,
   * then record every attempt to the reputation ledger. Ties break toward the
   * worker with the stronger standing, so proven agents win close calls — the
   * flywheel that lets the autonomous daemon build a real hiring market.
   */
  async run(job: Job, tick = 0): Promise<JobResult> {
    // A worker that can't fund the job's required skills simply doesn't bid —
    // capital is a real constraint, so an undercapitalised worker exits the
    // market instead of crashing the loop. Only actual bids compete.
    const bids = await Promise.all(
      this.deps.workerEngines.map((engine) =>
        this.hire(job, `worker:${engine}`, engine)
          .then((r) => this.evaluate(r))
          .catch(() => null)
      )
    );
    const candidates = bids.filter((c): c is JobResult => c !== null);

    // Nobody could afford to bid — refund the poster and mark the job failed.
    if (candidates.length === 0) {
      return this.deps.exchange.settle({
        jobId: job.id,
        workerId: "-",
        agentResult: { ok: false, engine: "-", output: "", durationMs: 0, error: "no bidders" },
        accepted: false,
        settledX402: 0,
      });
    }

    const rep = this.deps.reputation;
    const best = candidates.reduce((a, b) => {
      const da = a.score ?? 0;
      const db = b.score ?? 0;
      if (db !== da) return db > da ? b : a;
      // Equal quality → the higher-reputation worker earns the job.
      const ra = rep?.standing(a.workerId).score ?? 0;
      const rb = rep?.standing(b.workerId).score ?? 0;
      return rb > ra ? b : a;
    });

    const settled = await this.deps.exchange.settle(best);

    if (rep) {
      for (const c of candidates) {
        const isWinner = c.workerId === settled.workerId;
        rep.record({
          agentId: c.workerId,
          jobId: job.id,
          score: c.score ?? 0,
          accepted: isWinner && settled.accepted,
          earnedX402: isWinner ? settled.settledX402 : c.settledX402,
          tick,
        });
      }
    }

    return settled;
  }
}

/** Merge every purchased skill's system prompt into the worker's instruction. */
export function composePrompt(job: Job, skills: Skill[]): string {
  const preamble = skills.map((s) => `# Skill: ${s.name}\n${s.systemPrompt}`);
  return [
    ...preamble,
    `# Job: ${job.title}`,
    job.description,
  ].join("\n\n");
}
