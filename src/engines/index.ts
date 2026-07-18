import type { Engine } from "./types.js";
import { ClaudeCodeEngine } from "./claude-code.js";
import { CodexEngine } from "./codex.js";
import { HermesEngine } from "./hermes.js";

export * from "./types.js";

/** Every engine known to the runner, keyed by its CLI name. */
export const engines: Record<string, Engine> = {
  "claude-code": new ClaudeCodeEngine(),
  codex: new CodexEngine(),
  hermes: new HermesEngine(),
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
