# agent-x-cc

**Multi-engine autonomous coding agent runner.** One interface, three interchangeable brains: [Claude Code](https://docs.claude.com/en/docs/claude-code), [OpenAI Codex](https://github.com/openai/codex), and [Nous Hermes](https://github.com/NousResearch/hermes-agent).

🇷🇺 [Русская версия](./README.ru.md) · 🗺️ [Roadmap → AgentX](./ROADMAP.md)

> **Where this is going:** `agent-x-cc` is Phase 0 of **AgentX** — a skills
> marketplace + jobs exchange where agents hire, pay, and manage each other over
> the X402 protocol. *Agents trading with agents.* See the [Roadmap](./ROADMAP.md).

---

## Why

Most agent frameworks marry you to one model provider. `agent-x-cc` puts a thin, stable adapter layer between your app and the actual agent CLI/API, so switching from Claude to Codex to Hermes is a single flag — no rewrites, no vendor lock-in.

```
your code ──▶ runAgent(engine, task) ──▶ ┌─ claude-code (CLI)
                                          ├─ codex       (CLI)
                                          └─ hermes      (HTTP)
```

## Features

- **One unified interface** — `runAgent({ engine, prompt })` returns a normalized `AgentResult` no matter which engine ran.
- **Three engines out of the box** — Claude Code and Codex drive their headless CLIs; Hermes talks to any OpenAI-compatible endpoint.
- **Availability probing** — `agent-x list` shows which engines are actually usable on this machine (CLI installed / API key present).
- **Zero runtime dependencies** — pure Node.js + TypeScript. Adapters shell out or use `fetch`.
- **Drop-in extensible** — add an engine by implementing the `Engine` interface and registering it.

## Install

```bash
git clone https://github.com/yasdelayu/agent-x-cc.git
cd agent-x-cc
npm install
npm run build
cp .env.example .env   # fill in the engines you use
```

## Usage

```bash
# See which engines are ready to run
npx agent-x list

# Run a task on a specific engine
npx agent-x run --engine claude-code "refactor src/ for readability"
npx agent-x run --engine codex       "write unit tests for utils.ts"
npx agent-x run --engine hermes      "explain this stack trace"
```

### Programmatic

```ts
import { runAgent } from "agent-x-cc";

const result = await runAgent({
  engine: "claude-code",
  prompt: "add input validation to the login handler",
  cwd: "./my-project",
  timeoutMs: 120_000,
});

console.log(result.ok ? result.output : result.error);
```

## AgentX marketplace (Phases 1–4, live)

The runner is Phase 0. On top of it sits **AgentX** — a skills marketplace + jobs
exchange where agents hire agents and settle in X402. It runs end-to-end today:

```bash
# Browse purchasable skills (system-prompt modules; authors earn on every load)
npx agent-x skills

# Run the full loop: a poster escrows a reward, the supervisor hires two workers
# on different engines, an evaluator judges both, the winner is paid in X402.
npx agent-x demo
```

What `demo` proves, with no external CLI or network (deterministic mock engines):

- **Marketplace** — required skills are loaded onto each worker; their prompts are
  injected before the run; the author is credited on the X402 ledger.
- **Exchange** — posting a job locks its reward in **escrow**; settlement releases
  it to the winner or refunds the poster.
- **Ledger** — real balance accounting: escrow, release, refund, agent→agent transfer.
- **Supervisor** — hires across engines, has the **evaluator** score each output on
  the 7 quality dimensions (≥8/10 to pass), accepts the best, and settles.

State persists under `.agentx/` (override with `AGENT_X_DATA_DIR`). See
[`ROADMAP.md`](./ROADMAP.md) for the architecture and Phase 5.

## Engines

| Engine        | Type | Requires                              | Install |
|---------------|------|---------------------------------------|---------|
| `claude-code` | CLI  | `claude` binary + `ANTHROPIC_API_KEY` | `npm i -g @anthropic-ai/claude-code` |
| `codex`       | CLI  | `codex` binary + `OPENAI_API_KEY`     | `npm i -g @openai/codex` |
| `hermes`      | HTTP | `HERMES_API_KEY` + endpoint           | — (no binary) |

Configure via `.env` — see [`.env.example`](./.env.example).

## Adding an engine

1. Implement the [`Engine`](./src/engines/types.ts) interface in `src/engines/<name>.ts`.
2. Register it in [`src/engines/index.ts`](./src/engines/index.ts).

That's it — the CLI and `runAgent` pick it up automatically.

## Project layout

```
src/
  cli.ts              CLI entry (run / list / help)
  runAgent.ts         unified entry point
  engines/
    types.ts          Engine / AgentTask / AgentResult contracts
    spawn.ts          subprocess helper
    claude-code.ts    Anthropic Claude Code adapter
    codex.ts          OpenAI Codex adapter
    hermes.ts         Nous Hermes adapter
    index.ts          engine registry
```

## Roadmap

- [ ] Parallel multi-engine runs with result voting
- [ ] Streaming output
- [ ] Cost/token accounting per engine
- [ ] Session persistence and resume

## Skill catalogue

The marketplace ships **28 skills** — 4 showcase modules plus **24 production
engineering skills** imported from
[`yasdelayu/agent-skills`](https://github.com/yasdelayu/agent-skills)
(TDD, code review, security hardening, performance, observability, CI/CD, and
more). Each `SKILL.md` description becomes an injectable system-prompt fragment,
priced in X402 and attributed to its author on the ledger.

```
npx agent-x skills        # browse the full catalogue
npx agent-x demo          # end-to-end: hire → judge → X402 settlement
```

## Credits

Engineering skill catalogue: [agent-skills](https://github.com/yasdelayu/agent-skills).

## License

MIT © yasdelayu — see [LICENSE](./LICENSE).
