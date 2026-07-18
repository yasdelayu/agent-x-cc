import { getEngine, DEFAULT_ENGINE } from "./engines/index.js";
import type { AgentTask, AgentResult } from "./engines/types.js";

export interface RunOptions extends AgentTask {
  /** Which engine to use. Falls back to AGENT_X_ENGINE / claude-code. */
  engine?: string;
}

/**
 * The single entry point the whole system uses. Pick an engine by name,
 * verify it can run, then hand off the task. Engine internals stay hidden.
 */
export async function runAgent(opts: RunOptions): Promise<AgentResult> {
  const engineName = opts.engine || DEFAULT_ENGINE;
  const engine = getEngine(engineName);

  const available = await engine.isAvailable();
  if (!available) {
    return {
      engine: engineName,
      ok: false,
      output: "",
      error: `Engine "${engineName}" is not available (missing CLI or API key).`,
      durationMs: 0,
    };
  }

  return engine.run(opts);
}
