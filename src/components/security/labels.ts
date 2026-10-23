import type { Confidence, RuleId, SecurityStatus, Severity } from "@/modules/security/security.types";

export const RULE_LABEL: Record<RuleId, string> = {
  UNUSUAL_AMOUNT: "Amount",
  NEW_RECIPIENT: "New recipient",
  FREQUENCY_SPIKE: "Frequency",
  NEW_PACKAGE: "New package",
  LARGE_OUTFLOW: "Outflow",
  NEW_ASSET: "New asset",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  high: "text-critical",
  medium: "text-warning",
  low: "text-muted-foreground",
  none: "text-subtle",
};

export const SEVERITY_BAR: Record<Severity, string> = {
  high: "bg-critical",
  medium: "bg-warning",
  low: "bg-muted-foreground/60",
  none: "bg-border",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: "Insufficient history",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const STATUS_LABEL: Record<SecurityStatus, string> = {
  attention_required: "Attention required",
  review_recommended: "Review recommended",
  no_anomalies: "No significant deviations",
  insufficient_history: "Insufficient history",
};

export const STATUS_DOT: Record<SecurityStatus, string> = {
  attention_required: "bg-critical",
  review_recommended: "bg-warning",
  no_anomalies: "bg-positive",
  insufficient_history: "bg-subtle",
};
