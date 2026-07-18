#!/usr/bin/env node
import { runAgent } from "./runAgent.js";
import { engines, DEFAULT_ENGINE } from "./engines/index.js";
import { LedgerImpl } from "./ledger/index.js";
import { MarketplaceImpl } from "./marketplace/index.js";
import { ExchangeImpl } from "./exchange/index.js";
import { runDemo } from "./orchestrator/demo.js";

const HELP = `agent-x — multi-engine autonomous coding agent runner + AgentX marketplace

Usage:
  agent-x run   --engine <name> "<prompt>"   Run a task on one engine
  agent-x list                                Show engines and availability
  agent-x skills [category]                   List marketplace skills
  agent-x jobs                                List open jobs on the exchange
  agent-x demo                                Run the full agents-hire-agents loop
  agent-x help                                Show this help

Engines: ${Object.keys(engines).join(", ")}  (default: ${DEFAULT_ENGINE})

Examples:
  agent-x run --engine claude-code "refactor src/ for readability"
  agent-x demo                                # supervisor + 2 workers + judge + X402
`;

function parseArgs(argv: string[]) {
  const args: { engine?: string; prompt?: string } = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--engine") {
      args.engine = argv[++i];
    } else {
      rest.push(argv[i]);
    }
  }
  args.prompt = rest.join(" ").trim();
  return args;
}

async function listEngines() {
  console.log("Engine          Available  Description");
  console.log("--------------  ---------  -----------");
  for (const [name, engine] of Object.entries(engines)) {
    const ok = await engine.isAvailable();
    console.log(
      `${name.padEnd(14)}  ${(ok ? "yes" : "no").padEnd(9)}  ${engine.description}`
    );
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "list":
      await listEngines();
      return;

    case "skills": {
      const marketplace = new MarketplaceImpl(new LedgerImpl());
      const skills = await marketplace.list(rest[0] as never);
      console.log("Skill                         Category  Price(X402)  Rating  Author");
      console.log("----------------------------  --------  -----------  ------  ------");
      for (const s of skills) {
        console.log(
          `${s.name.padEnd(28)}  ${s.category.padEnd(8)}  ${String(s.priceX402).padEnd(11)}  ${String(s.rating ?? "-").padEnd(6)}  ${s.author}`
        );
      }
      return;
    }

    case "jobs": {
      const open = await new ExchangeImpl(new LedgerImpl()).open();
      if (!open.length) {
        console.log("No open jobs. Post one via the exchange, or run `agent-x demo`.");
        return;
      }
      for (const j of open) {
        console.log(`[${j.id}] ${j.title} — ${j.rewardX402} X402 (${j.category})`);
      }
      return;
    }

    case "demo": {
      const { job, result, balances } = await runDemo();
      console.log("");
      console.log("── Settlement ─────────────────────────────");
      console.log(`Job:          ${job.title}`);
      console.log(`Winner:       ${result.workerId}`);
      console.log(`Score:        ${result.score} (accepted: ${result.accepted})`);
      console.log(`Net to worker:${result.settledX402} X402 (reward − skill costs)`);
      console.log(`Poster left:  ${balances.poster} X402`);
      console.log(`Winner total: ${balances.winner} X402`);
      return;
    }

    case "run": {
      const { engine, prompt } = parseArgs(rest);
      if (!prompt) {
        console.error("Error: no prompt provided.\n");
        console.log(HELP);
        process.exit(1);
      }
      const result = await runAgent({ engine, prompt });
      if (result.ok) {
        console.log(result.output);
        console.error(
          `\n[${result.engine}] ok in ${result.durationMs}ms`
        );
      } else {
        console.error(`[${result.engine}] failed: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    case "help":
    case undefined:
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
