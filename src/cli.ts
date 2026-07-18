#!/usr/bin/env node
import { runAgent } from "./runAgent.js";
import { engines, DEFAULT_ENGINE } from "./engines/index.js";

const HELP = `agent-x — multi-engine autonomous coding agent runner

Usage:
  agent-x run   --engine <name> "<prompt>"   Run a task on one engine
  agent-x list                                Show engines and availability
  agent-x help                                Show this help

Engines: ${Object.keys(engines).join(", ")}  (default: ${DEFAULT_ENGINE})

Examples:
  agent-x run --engine claude-code "refactor src/ for readability"
  agent-x run --engine codex "write unit tests for utils.ts"
  agent-x run --engine hermes "explain this stack trace"
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
