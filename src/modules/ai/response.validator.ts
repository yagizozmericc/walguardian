import type { AgentContext, CopilotPoint, ModelAnswer } from "./ai.types";

/**
 * Post-validation of model output against the context it was given:
 * citations must exist; factual points need at least one valid citation; and
 * figures stated must appear in the supplied data. Failures are surfaced as
 * warnings and "unverified" points, never silently passed through.
 */

const NUMBER = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?%?/g;

function normalizeNumber(raw: string): string {
  let n = raw.replace(/[,%]/g, "");
  if (n.includes(".")) n = n.replace(/0+$/, "").replace(/\.$/, "");
  return n;
}

/** Numbers worth checking: anything with a decimal point or at least 2 digits (small counts like "3 goals" are skipped). */
export function significantNumbers(text: string): string[] {
  return [...new Set((text.match(NUMBER) ?? []).map(normalizeNumber).filter((n) => n.includes(".") || n.replace("-", "").length >= 2))];
}

export function contextNumbers(ctx: AgentContext): Set<string> {
  const set = new Set<string>();
  for (const i of ctx.items) for (const n of (i.text.match(NUMBER) ?? []).map(normalizeNumber)) set.add(n);
  set.add(normalizeNumber(String(new Date().getFullYear())));
  return set;
}

export interface ValidatedAnswer {
  answer: string;
  points: CopilotPoint[];
  followUps: string[];
  limitations: string[];
  warnings: string[];
}

export function validateAnswer(raw: ModelAnswer, ctx: AgentContext): ValidatedAnswer {
  const byId = new Map(ctx.items.map((i) => [i.id, i]));
  const known = contextNumbers(ctx);
  const warnings: string[] = [];

  const ungrounded = (text: string) => significantNumbers(text).filter((n) => !known.has(n));

  const points: CopilotPoint[] = raw.points.map((p) => {
    const valid = p.citations.filter((c) => byId.has(c));
    const invalid = p.citations.filter((c) => !byId.has(c));
    if (invalid.length) warnings.push(`Removed citations that do not exist in the data: ${invalid.join(", ")}.`);
    let basis: CopilotPoint["basis"] = p.basis;
    if (p.basis !== "suggestion" && valid.length === 0) {
      basis = "unverified";
      warnings.push(`A point had no valid source and is marked unverified: "${p.text.slice(0, 80)}".`);
    }
    const missing = ungrounded(p.text);
    if (missing.length) {
      basis = "unverified";
      warnings.push(`Figure(s) ${missing.join(", ")} in a point were not found in the provided data.`);
    }
    return {
      text: p.text,
      basis,
      citations: valid.map((id) => {
        const i = byId.get(id)!;
        return { id: i.id, kind: i.kind, source: i.source, asOf: i.asOf, text: i.text };
      }),
    };
  });

  const answerMissing = ungrounded(raw.answer);
  if (answerMissing.length) warnings.push(`Figure(s) ${answerMissing.join(", ")} in the answer were not found in the provided data; treat them with caution.`);

  return {
    answer: raw.answer,
    points,
    followUps: raw.followUps.slice(0, 3),
    limitations: raw.limitations,
    warnings: [...new Set(warnings)],
  };
}
