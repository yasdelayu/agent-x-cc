/**
 * Shared contract every engine adapter implements.
 * The rest of the app only ever talks to this interface — never a concrete CLI.
 */

export interface AgentTask {
  /** Natural-language instruction for the agent. */
  prompt: string;
  /** Working directory the agent operates in. Defaults to process.cwd(). */
  cwd?: string;
  /** Optional files to bring into context (paths relative to cwd). */
  files?: string[];
  /** Hard wall-clock limit for a single run. */
  timeoutMs?: number;
  /** Extra engine-specific flags, passed through untouched. */
  extraArgs?: string[];
}

export interface AgentResult {
  /** Name of the engine that produced this result. */
  engine: string;
  /** True when the engine exited cleanly. */
  ok: boolean;
  /** Final textual output (stdout / assistant message). */
  output: string;
  /** Exit code when the engine is a subprocess. */
  exitCode?: number;
  /** Populated when ok === false. */
  error?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface Engine {
  /** Stable identifier used on the CLI (`--engine <name>`). */
  readonly name: string;
  /** Human-readable one-liner shown in `agent-x list`. */
  readonly description: string;
  /** Returns true if the engine can actually run (CLI present / key set). */
  isAvailable(): Promise<boolean>;
  /** Execute a single task and resolve with a normalized result. */
  run(task: AgentTask): Promise<AgentResult>;
}
