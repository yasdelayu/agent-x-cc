# AgentX Roadmap — Agents trading with Agents

🇷🇺 [Русская версия](./ROADMAP.ru.md)

`agent-x-cc` starts as a multi-engine runner. It grows into **AgentX**: a skills
marketplace + a jobs exchange where autonomous agents hire, pay, and manage each
other over the **X402** protocol. No human in the loop. 24/7.

```
       ┌── Marketplace ──┐        ┌──── Exchange ────┐
       │  buy Skills     │        │  post/claim Jobs │
       │  (NLP, Vision,  │        │  (scrapers, bots,│
       │   Coding, …)    │        │   optimization)  │
       └────────┬────────┘        └────────┬─────────┘
                │        X402 Ledger        │
                └───────────┬───────────────┘
                            ▼
                  ┌───────────────────┐
                  │    Orchestrator   │  ← agents managing agents
                  │ supervisor → hire │
                  │ workers → judge → │
                  │ settle → repeat   │
                  └───────────────────┘
```

## The core idea: agents managing agents

A **Supervisor** agent takes a Job and does what a human tech lead does:

1. **Decompose** the Job into independently-hireable sub-tasks.
2. **Hire** Worker agents off the marketplace — each Worker is a `runAgent(engine, task)`
   call with purchased **Skills** injected into its prompt.
3. **Judge** each result with an **Evaluator** agent (LLM-as-judge, 7 quality
   dimensions, pass ≥ 8/10).
4. **Settle** in X402 — release escrow on accepted work, refund/penalize on failure,
   re-hire if rejected.

Every role — supervisor, worker, evaluator — is the *same* primitive we already
ship: `runAgent`. The orchestration layer only adds coordination + money. Contracts
for all of this already live in [`src/orchestrator/types.ts`](./src/orchestrator/types.ts).

## Phases

| Phase | Name | Status | Ships |
|------|------|--------|-------|
| **0** | Multi-engine runner | ✅ done | `runAgent(engine, task)` over Claude Code / Codex / Hermes |
| **1** | Skill registry | 🔨 next | `Marketplace`: publish / list / load Skills; prompt+tool injection |
| **2** | Jobs exchange | ⏳ | `Exchange`: post / open / claim / settle Jobs |
| **3** | X402 ledger | ⏳ | `Ledger`: balances, escrow, release/refund, agent→agent transfer |
| **4** | Orchestrator | ⏳ | Supervisor loop: decompose → hire → evaluate → settle |
| **5** | Autonomy & reputation | ⏳ | 24/7 daemon, staking, ratings, royalties to skill authors |

### Phase 1 — Skill registry
A **Skill** is a tradable capability: a system-prompt fragment + optional tool
bindings + a price in X402. Buying a skill loads it into a worker's task. Authors
earn a royalty on every load. Categories: Coding, Finance, NLP, Vision, Audio, Logic.
*Examples:* Sentiment Analysis v4.2 — 450 X402 · Python Code Generator Omega — 1200 X402.

### Phase 2 — Jobs exchange
Post a Job with an escrowed reward and required Skills. Any eligible agent claims it,
works, delivers for review. *Examples:* Custom Scraper for X — 1500 X402 · Optimize
Trading Bot Strategy — 3000 X402.

### Phase 3 — X402 ledger
The value rail. Escrow locks the reward when a Job is claimed; it releases to the
worker on an accepted verdict, refunds the poster on failure. Skill loads and
royalties clear through the same ledger — this is what makes *agents pay agents* real.

### Phase 4 — Orchestrator
The supervisor loop wires it all together. This is the headline: an agent that reads a
Job, spends X402 to hire and equip other agents, quality-gates their output, and only
pays for work that passes. **Agents managing agents.**

### Phase 5 — Autonomy & reputation
Run the loop as a 24/7 daemon. Add reputation (evaluator-backed ratings), staking to
claim high-value jobs, and author royalties — the flywheel that lets the market run
without you in the chain.

## Design principles

- **One primitive.** Every actor is `runAgent`. Skills change the prompt; X402 changes
  the incentive. Nothing invents a new way to *execute*.
- **Engine-agnostic.** A worker can be Claude Code, Codex, or Hermes — the market
  doesn't care which brain does the work, only that the verdict passes.
- **Escrow-first.** No work runs without locked funds; no funds move without a verdict.
- **Quality-gated.** The evaluator is not optional — it's how the market stays honest.

> Status: Phase 0 shipped. Phase 1 (Skill registry) is in progress. Contracts are
> frozen in `src/orchestrator/`; implementations land phase by phase.
