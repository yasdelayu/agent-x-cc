import type { AgentTask, AgentResult, Engine } from "./types.js";
import { runProcess, commandExists } from "./spawn.js";

/**
 * OpenAI Codex engine — drives the `codex` CLI in non-interactive `exec` mode.
 *
 * Install: npm i -g @openai/codex
 * Auth:    OPENAI_API_KEY, or `codex login`.
 * Docs:    https://github.com/openai/codex
 */
export class CodexEngine implements Engine {
  readonly name = "codex";
  readonly description = "OpenAI Codex CLI (non-interactive exec mode)";

  private readonly bin = process.env.CODEX_BIN || "codex";

  async isAvailable(): Promise<boolean> {
    return commandExists(this.bin);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const started = Date.now();
    // `codex exec` runs a single prompt to completion and prints the result.
    const args = ["exec", task.prompt, ...(task.extraArgs ?? [])];

    try {
      const { code, stdout, stderr, timedOut } = await runProcess(
        this.bin,
        args,
        { cwd: task.cwd, timeoutMs: task.timeoutMs ?? 300_000 }
      );
      return {
        engine: this.name,
        ok: code === 0 && !timedOut,
        output: stdout.trim(),
        exitCode: code ?? undefined,
        error: timedOut ? "timed out" : code === 0 ? undefined : stderr.trim(),
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return {
        engine: this.name,
        ok: false,
        output: "",
        error: (err as Error).message,
        durationMs: Date.now() - started,
      };
    }
  }
}
