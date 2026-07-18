import type { Job, JobResult, SkillCategory } from "../orchestrator/types.js";
import { LedgerImpl } from "../ledger/index.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { ExchangeImpl } from "../exchange/index.js";
import { ReputationImpl } from "../reputation/index.js";
import { Supervisor } from "../orchestrator/supervisor.js";

/** A backlog template the daemon instantiates into concrete posted jobs. */
interface JobTemplate {
  title: string;
  description: string;
  category: SkillCategory;
  rewardX402: number;
  requiredSkills: string[];
}

/**
 * A deterministic backlog that mimics the AgentX jobs exchange. The daemon
 * cycles through these, so a run of N ticks posts N real jobs with escrow,
 * hires, judges, settles, and updates reputation — no wall-clock, no RNG, fully
 * reproducible. In production this feed is the live X402 exchange instead.
 */
const BACKLOG: JobTemplate[] = [
  {
    title: "Resilient web scraper for product prices",
    description: "Scrape a paginated catalogue, dedupe by SKU, retry on 429, output CSV.",
    category: "coding",
    rewardX402: 3000,
    requiredSkills: ["coding-python-omega", "logic-decompose"],
  },
  {
    title: "Sentiment pass over 10k support tickets",
    description: "Classify tickets by sentiment and urgency, emit a triage report.",
    category: "nlp",
    rewardX402: 900,
    requiredSkills: ["nlp-sentiment-v4"],
  },
  {
    title: "Optimize a momentum trading strategy",
    description: "Backtest, tune parameters, cut max drawdown while keeping Sharpe.",
    category: "finance",
    rewardX402: 6000,
    requiredSkills: ["finance-arbitrage-x", "logic-decompose"],
  },
  {
    title: "Refactor a legacy module for readability",
    description: "Reduce cyclomatic complexity, add tests, keep behaviour identical.",
    category: "coding",
    rewardX402: 1500,
    requiredSkills: ["coding-python-omega"],
  },
];

export interface DaemonConfig {
  /** Worker engines that compete for every job. */
  workerEngines: string[];
  /** Agent id that funds and posts jobs. */
  poster: string;
  /** Starting X402 balances (poster needs enough to fund escrow each tick). */
  seedBalances: Record<string, number>;
}

/** What one autonomous tick did — a line in the daemon's activity log. */
export interface TickReport {
  tick: number;
  job: Job;
  result: JobResult;
  posterBalance: number;
  /** True when the poster couldn't fund the reward and the tick was skipped. */
  skipped?: boolean;
}

/**
 * The autonomous engine — Phase 5. It closes the loop the earlier phases only
 * opened: instead of a human invoking one job, the daemon runs unattended,
 * posting jobs from the backlog, hiring workers through the Supervisor, settling
 * in X402, and compounding reputation every tick. This is "agents, 24/7, without
 * you in the chain" made concrete and reproducible.
 */
export class Daemon {
  readonly ledger: LedgerImpl;
  readonly marketplace: MarketplaceImpl;
  readonly exchange: ExchangeImpl;
  readonly reputation: ReputationImpl;
  private readonly supervisor: Supervisor;

  constructor(private readonly config: DaemonConfig) {
    this.ledger = new LedgerImpl();
    this.marketplace = new MarketplaceImpl(this.ledger);
    this.exchange = new ExchangeImpl(this.ledger);
    this.reputation = new ReputationImpl();
    this.supervisor = new Supervisor({
      marketplace: this.marketplace,
      exchange: this.exchange,
      workerEngines: config.workerEngines,
      reputation: this.reputation,
    });

    for (const [agent, amount] of Object.entries(config.seedBalances)) {
      this.ledger.mint(agent, amount);
    }
  }

  /** Run one tick: post the next backlog job, hire, judge, settle, record. */
  async tick(n: number): Promise<TickReport> {
    const template = BACKLOG[n % BACKLOG.length];
    const job: Job = {
      id: `job-${String(n).padStart(4, "0")}`,
      poster: this.config.poster,
      status: "open",
      ...template,
    };

    // The daemon self-throttles: if the treasury can't fund escrow, skip.
    const posterBalance = await this.ledger.balance(this.config.poster);
    if (posterBalance < job.rewardX402) {
      return { tick: n, job, result: emptyResult(job), posterBalance, skipped: true };
    }

    await this.exchange.post(job);
    const result = await this.supervisor.run(job, n);
    return { tick: n, job, result, posterBalance: await this.ledger.balance(this.config.poster) };
  }

  /** Run `ticks` autonomous cycles, reporting each one as it completes. */
  async run(ticks: number, onTick?: (r: TickReport) => void): Promise<TickReport[]> {
    const reports: TickReport[] = [];
    for (let n = 0; n < ticks; n++) {
      const report = await this.tick(n);
      reports.push(report);
      onTick?.(report);
    }
    return reports;
  }
}

function emptyResult(job: Job): JobResult {
  return {
    jobId: job.id,
    workerId: "-",
    agentResult: { ok: false, engine: "-", output: "", durationMs: 0, error: "skipped" },
    accepted: false,
    settledX402: 0,
  };
}
