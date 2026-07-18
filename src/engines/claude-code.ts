import type { AgentTask, AgentResult, Engine } from "./types.js";
import { runProcess, commandExists } from "./spawn.js";

/**
 * Claude Code engine — drives Anthropic's `claude` CLI in headless (print) mode.
 *
 * Install: npm i -g @anthropic-ai/claude-code
 * Auth:    ANTHROPIC_API_KEY, or an interactive `claude login` session.
 * Docs:    https://docs.claude.com/en/docs/claude-code
 */
export class ClaudeCodeEngine implements Engine {
  readonly name = "claude-code";
  readonly description = "Anthropic Claude Code CLI (headless -p mode)";

  private readonly bin = process.env.CLAUDE_BIN || "claude";

  async isAvailable(): Promise<boolean> {
    return commandExists(this.bin);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const started = Date.now();
    const args = [
      "-p",
      task.prompt,
      "--output-format",
      "text",
      ...(task.extraArgs ?? []),
    ];

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
