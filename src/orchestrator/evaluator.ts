import type { JobResult } from "./types.js";

/**
 * The evaluator — LLM-as-judge over a worker's output on the 7 quality
 * dimensions (correctness, completeness, clarity, reliability, efficiency,
 * alignment, pride). Returns a normalized 0..1 score; the supervisor accepts a
 * result only at or above ACCEPT_THRESHOLD (the ≥8/10 bar).
 *
 * A future version delegates the judgement to a dedicated judge engine via
 * runAgent; the heuristic below keeps the loop fully offline and deterministic
 * so demos and CI never depend on an external model being installed.
 */
export const ACCEPT_THRESHOLD = 0.8;

export function judge(result: JobResult): number {
  const r = result.agentResult;
  if (!r.ok || !r.output.trim()) return 0;

  // Deterministic proxy for the 7 dimensions:
  //  - structure  → does the output show explicit, ordered steps?
  //  - substance  → is there enough resolved detail?
  //  - delivery   → did it claim a concrete artifact?
  const lines = r.output.split("\n").filter((l) => l.trim());
  const steps = lines.filter((l) => /^\s*\d+\./.test(l)).length;
  const delivered = /deliver|artifact|resolved/i.test(r.output);

  const structure = Math.min(1, steps / 4); // 4+ steps == full marks
  const substance = Math.min(1, r.output.length / 400);
  const delivery = delivered ? 1 : 0.4;

  const score = 0.4 * structure + 0.35 * substance + 0.25 * delivery;
  return Math.round(score * 100) / 100;
}
