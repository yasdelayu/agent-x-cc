/**
 * AgentX orchestration layer — the contracts that turn a multi-engine runner
 * into a marketplace of skills + a jobs exchange where agents hire agents.
 *
 * Everything here sits ON TOP of runAgent(engine, task): a "worker" is just a
 * runAgent call with a Skill-injected prompt; a "supervisor" is an agent whose
 * job is to decompose work and hire other agents. No new execution primitive —
 * only coordination and settlement.
 */

import type { AgentResult } from "../engines/types.js";

/** Marketplace taxonomy. */
export type SkillCategory =
  | "coding"
  | "finance"
  | "nlp"
  | "vision"
  | "audio"
  | "logic";

/**
 * A Skill is a purchasable capability module: a system-prompt fragment plus
 * optional tool bindings that get injected into a worker's task before it runs.
 * Skills are the tradable unit on the marketplace.
 */
export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  version: string;
  /** Prompt fragment merged into the worker's instruction. */
  systemPrompt: string;
  /** Engine this skill is tuned for; falls back to the caller's default. */
  preferredEngine?: string;
  /** Price to load this skill for one job, in X402. */
  priceX402: number;
  /** Author agent/owner id — receives royalties on each load. */
  author: string;
  /** 0..1 quality signal from evaluator history. */
  rating?: number;
}

/** A job posted to the exchange for any qualified agent to claim. */
export interface Job {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  /** Escrowed reward released to the worker on accepted delivery. */
  rewardX402: number;
  /** Skills required to be eligible to claim. */
  requiredSkills: string[];
  status: "open" | "claimed" | "in_progress" | "review" | "done" | "failed";
  poster: string;
  claimedBy?: string;
  deadlineMs?: number;
}

/** Result of one worker attempt, plus the evaluator's verdict. */
export interface JobResult {
  jobId: string;
  workerId: string;
  agentResult: AgentResult;
  /** Evaluator score, 0..1 across the 7 quality dimensions. */
  score?: number;
  accepted: boolean;
  /** X402 actually paid out (reward minus skill costs / plus penalties). */
  settledX402: number;
}

/**
 * The skills marketplace. Agents buy/load skills; authors earn on every load.
 */
export interface Marketplace {
  list(category?: SkillCategory): Promise<Skill[]>;
  publish(skill: Skill): Promise<Skill>;
  /** Charge the buyer, credit the author, return the loadable skill. */
  load(skillId: string, buyer: string): Promise<Skill>;
}

/** The jobs exchange — post, discover, claim, and settle work. */
export interface Exchange {
  post(job: Job): Promise<Job>;
  open(category?: SkillCategory): Promise<Job[]>;
  claim(jobId: string, workerId: string): Promise<Job>;
  settle(result: JobResult): Promise<JobResult>;
}

/** X402 settlement — the agent-to-agent value rail with escrow. */
export interface Ledger {
  balance(agentId: string): Promise<number>;
  escrow(from: string, amount: number, jobId: string): Promise<void>;
  release(jobId: string, to: string): Promise<void>;
  refund(jobId: string, to: string): Promise<void>;
  transfer(from: string, to: string, amount: number): Promise<void>;
}

/**
 * The Orchestrator IS "agents managing agents": a supervisor decomposes a job,
 * hires skill-loaded workers off the marketplace, runs them via runAgent, has an
 * evaluator agent judge the output, then accepts / re-hires / settles in X402.
 */
export interface Orchestrator {
  /** Break a job into independently-hireable sub-tasks. */
  decompose(job: Job): Promise<Job[]>;
  /** Pick + load skills, then run a worker for one sub-task. */
  hire(job: Job, workerId: string): Promise<JobResult>;
  /** LLM-as-judge pass over a worker result (7 quality dimensions). */
  evaluate(result: JobResult): Promise<JobResult>;
  /** Full autonomous loop: decompose → hire → evaluate → settle → repeat. */
  run(job: Job): Promise<JobResult>;
}
