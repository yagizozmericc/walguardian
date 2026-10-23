import type { ActivityItem } from "@/modules/portfolio/portfolio.types";
import { evaluateRules } from "./anomaly.engine";
import { buildBaseline } from "./baseline.service";
import { RULE_CONFIG } from "./rules.config";
import type { Candidate, SecurityAssessment, Severity } from "./security.types";

export function severityFor(score: number, hasCritical: boolean): Severity {
  if (hasCritical || score >= RULE_CONFIG.severity.high) return "high";
  if (score >= RULE_CONFIG.severity.medium) return "medium";
  if (score > 0) return "low";
  return "none";
}

/**
 * Scores a candidate against history strictly before it. The score is the
 * capped sum of rule points, so every point traces to a named rule.
 */
export function assessCandidate(
  candidate: Candidate,
  history: ActivityItem[],
  balanceBefore: Map<string, bigint> | null,
): SecurityAssessment {
  const prior = history.filter(
    (a) => a.digest !== candidate.digest && a.timestampMs !== null && a.timestampMs < candidate.timestampMs,
  );
  const baseline = buildBaseline(prior);
  const { signals, limitations, notes } = evaluateRules(candidate, { baseline, prior, balanceBefore });
  const score = Math.min(100, signals.reduce((s, x) => s + x.points, 0));
  return {
    transactionId: candidate.digest,
    score,
    severity: severityFor(score, signals.some((s) => s.critical)),
    confidence: baseline.confidence,
    signals: signals.sort((a, b) => b.points - a.points),
    limitations,
    notes,
    baselineSize: baseline.sentCount,
  };
}
