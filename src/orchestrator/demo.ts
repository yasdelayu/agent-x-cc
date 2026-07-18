import type { Job } from "./types.js";
import { LedgerImpl } from "../ledger/index.js";
import { MarketplaceImpl } from "../marketplace/index.js";
import { ExchangeImpl } from "../exchange/index.js";
import { Supervisor } from "./supervisor.js";

/**
 * Wire the full AgentX stack together (ledger → marketplace → exchange →
 * supervisor) over a fresh, isolated data dir and run one end-to-end job:
 * a poster funds a reward into escrow, the supervisor hires two workers on
 * different engines, the evaluator judges both, the winner is paid in X402.
 *
 * Everything runs in-process against the deterministic mock engines, so it is a
 * real, reproducible pass through the whole "agents hire agents" loop with no
 * external CLI or network.
 */
export async function runDemo(log: (msg: string) => void = console.log) {
  const ledger = new LedgerImpl();
  const marketplace = new MarketplaceImpl(ledger);
  const exchange = new ExchangeImpl(ledger);

  const supervisor = new Supervisor({
    marketplace,
    exchange,
    workerEngines: ["mock-fast", "mock-smart"],
  });

  // Bootstrap balances (in production these come from the real X402 chain).
  const POSTER = "agent:acme-corp";
  ledger.mint(POSTER, 4000);
  ledger.mint("worker:mock-fast", 2000);
  ledger.mint("worker:mock-smart", 2000);

  const job: Job = {
    id: "job-001",
    title: "Build a resilient web scraper for product prices",
    description:
      "Scrape a paginated catalogue, dedupe by SKU, retry on 429, output CSV.",
    category: "coding",
    rewardX402: 3000,
    requiredSkills: ["coding-python-omega", "logic-decompose"],
    status: "open",
    poster: POSTER,
  };

  log(`Posting job "${job.title}" — reward ${job.rewardX402} X402`);
  await exchange.post(job);
  log(`Escrow locked. Poster balance: ${await ledger.balance(POSTER)} X402`);

  log(`Supervisor hiring workers on: ${["mock-fast", "mock-smart"].join(", ")}`);
  const result = await supervisor.run(job);

  const balances = {
    poster: await ledger.balance(POSTER),
    winner: await ledger.balance(result.workerId),
  };

  return { job, result, balances, ledger };
}
