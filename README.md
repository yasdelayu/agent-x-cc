# agent-x-cc

**Multi-engine autonomous coding agent runner.** One interface, three interchangeable brains: [Claude Code](https://docs.claude.com/en/docs/claude-code), [OpenAI Codex](https://github.com/openai/codex), and [Nous Hermes](https://github.com/NousResearch/hermes-agent).

🇷🇺 [Русская версия](./README.ru.md)

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

## License

MIT © yasdelayu — see [LICENSE](./LICENSE).
