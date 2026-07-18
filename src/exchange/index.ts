import type { Exchange, Job, JobResult, SkillCategory } from "../orchestrator/types.js";
import type { LedgerImpl } from "../ledger/index.js";
import { JsonStore, storePath } from "../store/jsonStore.js";

interface ExchangeState {
  jobs: Job[];
}

/**
 * The jobs exchange — post, discover, claim, settle. Posting a job locks its
 * reward in X402 escrow; settling either releases that escrow to the accepted
 * worker or refunds the poster. Escrow is what makes agent-to-agent work
 * trustless: the reward is provably funded before anyone lifts a finger.
 */
export class ExchangeImpl implements Exchange {
  private readonly store: JsonStore<ExchangeState>;

  constructor(
    private readonly ledger: LedgerImpl,
    path = storePath("jobs")
  ) {
    this.store = new JsonStore<ExchangeState>(path, { jobs: [] });
  }

  async post(job: Job): Promise<Job> {
    await this.ledger.escrow(job.poster, job.rewardX402, job.id);
    const posted: Job = { ...job, status: "open" };
    this.store.write((s) => {
      const idx = s.jobs.findIndex((j) => j.id === job.id);
      if (idx >= 0) s.jobs[idx] = posted;
      else s.jobs.push(posted);
    });
    return posted;
  }

  async open(category?: SkillCategory): Promise<Job[]> {
    return this.store
      .read()
      .jobs.filter(
        (j) => j.status === "open" && (!category || j.category === category)
      );
  }

  async get(jobId: string): Promise<Job | undefined> {
    return this.store.read().jobs.find((j) => j.id === jobId);
  }

  async claim(jobId: string, workerId: string): Promise<Job> {
    const job = await this.get(jobId);
    if (!job) throw new Error(`unknown job "${jobId}"`);
    if (job.status !== "open") {
      throw new Error(`job ${jobId} is not open (status: ${job.status})`);
    }
    return this.update(jobId, { status: "claimed", claimedBy: workerId });
  }

  /** Release escrow to the worker on accept, or refund the poster on reject. */
  async settle(result: JobResult): Promise<JobResult> {
    const job = await this.get(result.jobId);
    if (!job) throw new Error(`unknown job "${result.jobId}"`);

    if (result.accepted) {
      await this.ledger.release(job.id, result.workerId);
      await this.update(job.id, { status: "done" });
      return { ...result, settledX402: result.settledX402 + job.rewardX402 };
    }

    await this.ledger.refund(job.id, job.poster);
    await this.update(job.id, { status: "failed" });
    return result;
  }

  private async update(jobId: string, patch: Partial<Job>): Promise<Job> {
    let updated!: Job;
    this.store.write((s) => {
      const idx = s.jobs.findIndex((j) => j.id === jobId);
      if (idx < 0) throw new Error(`unknown job "${jobId}"`);
      s.jobs[idx] = { ...s.jobs[idx], ...patch };
      updated = s.jobs[idx];
    });
    return updated;
  }
}
