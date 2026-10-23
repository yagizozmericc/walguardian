import type { DataSource } from "@/modules/blockchain/blockchain.types";

export type Severity = "none" | "low" | "medium" | "high";
export type Confidence = "insufficient" | "low" | "medium" | "high";

export type RuleId =
  | "UNUSUAL_AMOUNT"
  | "NEW_RECIPIENT"
  | "FREQUENCY_SPIKE"
  | "NEW_PACKAGE"
  | "LARGE_OUTFLOW"
  | "NEW_ASSET";

/** A value cited as evidence. `digests` link the claim to specific onchain transactions. */
export interface Evidence {
  label: string;
  value: string;
  digests?: string[];
}

export interface RiskSignal {
  rule: RuleId;
  title: string;
  /** Points contributed to the 0–100 score. */
  points: number;
  /** Critical signals can never be suppressed by user feedback. */
  critical: boolean;
  /** Deterministic, template-generated explanation (not LLM output). */
  explanation: string;
  evidence: Evidence[];
}

/** A rule that could not be evaluated, with the reason. Never silently dropped. */
export interface Limitation {
  rule: RuleId;
  reason: string;
}

/** What is being assessed: a historical outgoing transaction or (later) a hypothetical transfer. */
export interface Candidate {
  /** Present for historical transactions. */
  digest?: string;
  timestampMs: number;
  outflows: { coinType: string; symbol: string | null; decimals: number | null; rawAmount: bigint }[];
  recipients: string[];
  packages: string[];
}

export interface SecurityAssessment {
  transactionId?: string;
  score: number;
  severity: Severity;
  confidence: Confidence;
  signals: RiskSignal[];
  limitations: Limitation[];
  /** Rules that were evaluated but intentionally contributed no points, with why. */
  notes: string[];
  /** Number of prior transactions the baseline was built from. */
  baselineSize: number;
}

export interface CoinAmountStats {
  coinType: string;
  symbol: string | null;
  decimals: number | null;
  count: number;
  /** Raw integer amounts (smallest unit) as strings. */
  median: string;
  p75: string;
  p90: string;
  p95: string;
  max: string;
}

export interface CounterpartyStat {
  address: string;
  count: number;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
}

export interface PackageStat {
  packageId: string;
  modules: string[];
  /** Number of sent transactions that called the package. */
  count: number;
  firstSeenMs: number | null;
}

export interface BehavioralBaseline {
  /** Successful transactions sent by the address within the window. */
  sentCount: number;
  /** Sent transactions that moved value out of the address. */
  outgoingTransferCount: number;
  windowStartMs: number | null;
  windowEndMs: number | null;
  amountStats: CoinAmountStats[];
  recipients: CounterpartyStat[];
  /** Share (0–1) of past outgoing transfers that went to a then-unseen recipient. */
  recipientNoveltyRate: number | null;
  packages: PackageStat[];
  /** Sent transactions per day over the window (null when the window is too short). */
  dailySentMean: number | null;
  dailySentStdDev: number | null;
  confidence: Confidence;
}

export interface AssessedTransaction {
  digest: string;
  timestampMs: number | null;
  direction: "out" | "in" | "swap" | "none";
  outflows: { coinType: string; symbol: string | null; amount: string | null; rawAmount: string }[];
  recipients: string[];
  moveCalls: { package: string; module: string; function: string }[];
  assessment: SecurityAssessment;
}

export type SecurityStatus = "insufficient_history" | "no_anomalies" | "review_recommended" | "attention_required";

export interface SecurityReport {
  address: string;
  network: DataSource["network"];
  status: SecurityStatus;
  statusSummary: string;
  /** Counts of assessed transactions by severity. */
  severityCounts: Record<Severity, number>;
  /** Highest-score first; only transactions sent by the address are assessed. */
  assessed: AssessedTransaction[];
  baseline: BehavioralBaseline;
  analysedTransactionCount: number;
  historyComplete: boolean;
  monitoring: "historical_manual_refresh";
  rulesVersion: string;
  source: DataSource;
  notes: string[];
}
