import type { Job, JobResult, Orchestrator, Skill } from "./types.js";
import { runAgent } from "../runAgent.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { ExchangeImpl } from "../exchange/index.js";
import { ACCEPT_THRESHOLD, judge } from "./evaluator.js";

export interface SupervisorDeps {
  marketplace: MarketplaceImpl;
  exchange: ExchangeImpl;
  /** Worker engines that compete for each job. Best-scoring result wins. */
  workerEngines: string[];
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

  /** decompose → hire across engines → judge → accept best → settle in X402. */
  async run(job: Job): Promise<JobResult> {
    const candidates = await Promise.all(
      this.deps.workerEngines.map((engine) =>
        this.hire(job, `worker:${engine}`, engine).then((r) =>
          this.evaluate(r)
        )
      )
    );

    const best = candidates.reduce((a, b) =>
      (b.score ?? 0) > (a.score ?? 0) ? b : a
    );

    return this.deps.exchange.settle(best);
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
