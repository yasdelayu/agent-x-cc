import type { AgentTask, AgentResult, Engine } from "./types.js";

/**
 * Nous Hermes engine — talks to any OpenAI-compatible endpoint serving a
 * Hermes model (Nous Research). Unlike the CLI engines this one is a pure
 * HTTP client, so it needs no local binary.
 *
 * Reference agent: https://github.com/NousResearch/hermes-agent
 *
 * Config via env:
 *   HERMES_BASE_URL   default https://inference-api.nousresearch.com/v1
 *   HERMES_API_KEY    bearer token for the endpoint
 *   HERMES_MODEL      default Hermes-4-405B
 */
export class HermesEngine implements Engine {
  readonly name = "hermes";
  readonly description = "Nous Hermes via OpenAI-compatible chat completions";

  private readonly baseUrl =
    process.env.HERMES_BASE_URL || "https://inference-api.nousresearch.com/v1";
  private readonly model = process.env.HERMES_MODEL || "Hermes-4-405B";
  private readonly apiKey = process.env.HERMES_API_KEY;

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const started = Date.now();
    if (!this.apiKey) {
      return {
        engine: this.name,
        ok: false,
        output: "",
        error: "HERMES_API_KEY is not set",
        durationMs: Date.now() - started,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      task.timeoutMs ?? 300_000
    );

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are a senior autonomous software engineer. Produce concrete, runnable output.",
            },
            { role: "user", content: task.prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return {
          engine: this.name,
          ok: false,
          output: "",
          error: `HTTP ${res.status}: ${await res.text()}`,
          durationMs: Date.now() - started,
        };
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const output = data.choices?.[0]?.message?.content?.trim() ?? "";
      return {
        engine: this.name,
        ok: true,
        output,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      return {
        engine: this.name,
        ok: false,
        output: "",
        error: aborted ? "timed out" : (err as Error).message,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
