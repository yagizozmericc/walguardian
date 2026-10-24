import type { AgentContext, CopilotPoint } from "./ai.types";

/**
 * Deterministic answer used when the model is unavailable, disabled or rate
 * limited. It restates engine results verbatim, with citations; no inference.
 */
export function deterministicSummary(ctx: AgentContext, reason: string): { answer: string; points: CopilotPoint[]; limitations: string[] } {
  const pick = (pred: (text: string) => boolean, kind: "calculation" | "preference" | "onchain" = "calculation", max = 2) =>
    ctx.items.filter((i) => i.kind === kind && pred(i.text)).slice(0, max);
  let chosen = [
    ...pick((t) => t.startsWith("Security status")),
    ...pick((t) => t.startsWith("Transaction ") && t.includes("scored"), "calculation", 2),
    ...pick((t) => t.startsWith("Goal "), "calculation", 3),
    ...pick((t) => t.startsWith("Allocation") || t.includes("outside your band") || t.startsWith("Illustrative"), "calculation", 2),
  ];
  // Other contexts (e.g. a transfer simulation): restate the first calculated and preference items.
  if (chosen.length === 0) chosen = ctx.items.filter((i) => i.kind === "calculation" || i.kind === "preference").slice(0, 6);
  const points: CopilotPoint[] = chosen.map((i) => ({
    text: i.text,
    basis: i.kind === "preference" ? "preference" : "calculation",
    citations: [{ id: i.id, kind: i.kind, source: i.source, asOf: i.asOf, text: i.text }],
  }));
  return {
    answer: points.length
      ? `The AI model is unavailable (${reason}). Here is a deterministic summary of your current data instead; it does not answer your question directly.`
      : `The AI model is unavailable (${reason}), and there is no calculated data to summarize yet.`,
    points,
    limitations: ctx.sections.filter((s) => s.status === "unavailable").map((s) => `${s.name} data unavailable: ${s.detail}`),
  };
}
