import type { Engine } from "./types.js";
import { ClaudeCodeEngine } from "./claude-code.js";
import { CodexEngine } from "./codex.js";
import { HermesEngine } from "./hermes.js";
import { MockEngine } from "./mock.js";

export * from "./types.js";

/** Every engine known to the runner, keyed by its CLI name. */
export const engines: Record<string, Engine> = {
  "claude-code": new ClaudeCodeEngine(),
  codex: new CodexEngine(),
  hermes: new HermesEngine(),
  // Always-available in-process engines for demos / CI / orchestrator bake-offs.
  "mock-fast": new MockEngine(
    "mock-fast",
    "Deterministic in-process engine — quick, shallow (demo/CI)",
    0.6
  ),
  "mock-smart": new MockEngine(
    "mock-smart",
    "Deterministic in-process engine — thorough, deeper (demo/CI)",
    0.95
  ),
};

export const DEFAULT_ENGINE =
  process.env.AGENT_X_ENGINE || "claude-code";

export function getEngine(name: string): Engine {
  const engine = engines[name];
  if (!engine) {
    const known = Object.keys(engines).join(", ");
    throw new Error(`Unknown engine "${name}". Available: ${known}`);
  }
  return engine;
}
