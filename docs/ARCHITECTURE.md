# AgentX Architecture

Two layers. The **runner** (shipped) executes a task on any engine. The
**orchestration layer** (per [ROADMAP](../ROADMAP.md)) turns runners into a market.

```
┌──────────────────────────── Orchestration layer ────────────────────────────┐
│                                                                              │
│   Marketplace ─ Skills          Exchange ─ Jobs           Ledger ─ X402      │
│        │                            │                          │             │
│        └──────────────┐   ┌─────────┘        ┌─────────────────┘             │
│                       ▼   ▼                  ▼                               │
│                   ┌──────────────── Orchestrator ────────────────┐          │
│                   │ Supervisor: decompose → hire → judge → settle│          │
│                   └───────┬───────────────┬───────────────┬──────┘          │
│                           │               │               │                 │
│                     Worker agent    Worker agent    Evaluator agent         │
└───────────────────────────┼───────────────┼───────────────┼────────────────┘
                            ▼               ▼               ▼
┌──────────────────────────── Runner (shipped) ───────────────────────────────┐
│                    runAgent({ engine, prompt, … })                           │
│              claude-code (CLI) · codex (CLI) · hermes (HTTP)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Data model (`src/orchestrator/types.ts`)

- **Skill** — tradable capability: `systemPrompt` fragment + `preferredEngine` +
  `priceX402` + `author`. Loaded into a worker's task before it runs.
- **Job** — unit of work: `rewardX402` (escrowed), `requiredSkills`, `status`,
  `poster` / `claimedBy`.
- **JobResult** — a worker's `AgentResult` + evaluator `score` + `accepted` +
  `settledX402`.
- **Marketplace / Exchange / Ledger** — the three service contracts.
- **Orchestrator** — `decompose` / `hire` / `evaluate` / `run`: the supervisor loop.

## Lifecycle of one job

1. **Post.** Poster calls `Exchange.post(job)`; `Ledger.escrow` locks `rewardX402`.
2. **Decompose.** Supervisor `Orchestrator.decompose(job)` → sub-tasks.
3. **Hire.** For each sub-task: `Marketplace.load(skill, worker)` charges the worker
   and credits the author, then `hire()` runs `runAgent(engine, task)` with the skill
   injected.
4. **Judge.** `Orchestrator.evaluate(result)` runs an Evaluator agent (7 dimensions,
   pass ≥ 8/10) → sets `score` + `accepted`.
5. **Settle.** Accepted → `Ledger.release` pays the worker. Rejected → refund/penalize,
   optionally re-hire a different worker or engine.

## Why every actor is `runAgent`

The runner already normalizes three engines behind one `AgentResult`. So a
**worker** is `runAgent` with a Skill prompt; a **supervisor** is `runAgent` whose
tools are the Marketplace/Exchange/Ledger contracts; an **evaluator** is `runAgent`
with a judging rubric. The market never invents a new execution primitive — it only
adds **coordination** (who does what) and **settlement** (who gets paid).

## Trust & safety

- **Escrow-first** — no worker runs until funds are locked; no funds move without a
  verdict.
- **Quality gate** — the evaluator is mandatory; low scores block payout and burn
  worker reputation.
- **Reputation** (Phase 5) — evaluator history feeds Skill `rating` and worker
  standing; staking gates high-value jobs.
