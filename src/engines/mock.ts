import type { AgentTask, AgentResult, Engine } from "./types.js";

/**
 * Deterministic in-process engine used for demos and CI, where no external
 * agent CLI (claude / codex / hermes) is installed. It never touches the
 * network, is always available, and produces reproducible output whose depth
 * scales with its `quality` — so an orchestrator competition between two mock
 * engines has a stable, explainable winner.
 */
export class MockEngine implements Engine {
  constructor(
    readonly name: string,
    readonly description: string,
    private readonly quality: number
  ) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const started = Date.now();
    const headline = firstLine(task.prompt);
    const depth = Math.max(1, Math.round(this.quality * 5));

    const steps = Array.from(
      { length: depth },
      (_, i) => `  ${i + 1}. resolved sub-step ${i + 1} for: ${headline}`
    ).join("\n");

    const output =
      `[${this.name}] plan (${depth} steps, quality=${this.quality}):\n` +
      `${steps}\n` +
      `[${this.name}] delivered artifact for "${headline}".`;

    return {
      engine: this.name,
      ok: true,
      output,
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  }
}

function firstLine(prompt: string): string {
  const line = prompt.split("\n").find((l) => l.trim().length > 0) ?? prompt;
  return line.trim().slice(0, 80);
}
