import type { DataSource } from "@/modules/blockchain/blockchain.types";

export type Severity = "none" | "low" | "medium" | "high";
export type Confidence = "insufficient" | "low" | "medium" | "high";

export type RuleId =
  | "UNUSUAL_AMOUNT"
  | "NEW_RECIPIENT"
  | "FREQUENCY_SPIKE"
  | "NEW_PACKAGE"
  | "LARGE_OUTFLOW"
  | "NEW_ASSET"
  | "USER_FLAGGED_RECIPIENT";

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

/** A prior user review, persisted in memory, used to personalize later assessments. */
export interface FeedbackKnowledge {
  digest: string;
  verdict: "expected" | "suspicious" | "unsure";
  note: string | null;
  recipients: string[];
  packages: string[];
  transactionTimeMs: number | null;
  memoryId: string;
  createdAt: string;
}

export interface TransactionReview {
  verdict: FeedbackKnowledge["verdict"];
  note: string | null;
  memoryId: string;
  createdAt: string;
  /** True when the transaction carries a critical signal, which feedback never clears. */
  remainsFlagged: boolean;
}

export interface AssessedTransaction {
  digest: string;
  timestampMs: number | null;
  direction: "out" | "in" | "swap" | "none";
  outflows: { coinType: string; symbol: string | null; amount: string | null; rawAmount: string }[];
  recipients: string[];
  moveCalls: { package: string; module: string; function: string }[];
  assessment: SecurityAssessment;
  review: TransactionReview | null;
}

export type SecurityStatus = "insufficient_history" | "no_anomalies" | "review_recommended" | "attention_required";

export interface SecurityReport {
  address: string;
  network: DataSource["network"];
  status: SecurityStatus;
  statusSummary: string;
  /** Counts of assessed transactions by severity. */
  severityCounts: Record<Severity, number>;
  /** Counts excluding transactions you reviewed as expected (critical ones always stay). */
  openCounts: Record<Severity, number>;
  memory: {
    status: "applied" | "not_configured" | "unavailable" | "no_session";
    provider: "walrus" | "mock" | null;
    feedbackCount: number;
    detail: string;
  };
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
