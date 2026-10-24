import { z } from "zod";
import type { Evidence, RiskSignal } from "@/modules/security/security.types";

/**
 * Pre-transaction intelligence contracts. Everything here describes a
 * SIMULATION: nothing is built, signed, dry-run or broadcast.
 */

export const TransferRequestSchema = z.object({
  address: z.string(),
  recipient: z.string().trim().min(3).max(80),
  coinType: z.string().min(5).max(300),
  amount: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a positive decimal amount."),
});
export type TransferRequest = z.infer<typeof TransferRequestSchema>;

export const SpendableRequestSchema = z.object({ address: z.string(), coinType: z.string().min(5).max(300) });

export const DecisionRequestSchema = TransferRequestSchema.extend({
  decision: z.enum(["would_proceed", "would_not_proceed"]),
  note: z.string().trim().max(500).nullable(),
});

export type FindingCategory = "fact" | "pattern" | "preference" | "unknown";
export type FindingLevel = "info" | "caution" | "warning" | "critical";
export type Pillar = "protect" | "save" | "invest" | "memory" | "general";

export interface Finding {
  id: string;
  pillar: Pillar;
  category: FindingCategory;
  level: FindingLevel;
  title: string;
  detail: string;
  evidence?: Evidence[];
}

export type RecipientLookup =
  | { status: "active"; recentTransactions: number; atLeast: boolean; lastActivityMs: number | null }
  | { status: "no_activity" }
  | { status: "unavailable"; reason: string };

export interface GasEstimate {
  /** Median net gas fee of this wallet's past successful transactions, in MIST; null when unknown. */
  estimateMist: string | null;
  samples: number;
  /** Always an estimate from history, never a quote for this transfer. */
  basis: "historical_median";
}

export interface SpendableBreakdown {
  coinType: string;
  symbol: string | null;
  decimals: number;
  totalBalance: string;
  earmarked: string;
  gasBuffer: string;
  gasReserve: string;
  stablecoinReserve: string | null;
  /** Conservative estimate; never negative. */
  estimatedAvailable: string;
  notes: string[];
}

export type Verdict =
  | "insufficient_balance"
  | "insufficient_gas"
  | "review_carefully"
  | "proceed_with_caution"
  | "no_issues_found";

export interface ProtectView {
  score: number;
  severity: "none" | "low" | "medium" | "high";
  confidence: string;
  /** Onchain evidence only; user feedback is reported separately as memory findings. */
  signals: RiskSignal[];
  notApplicable: string[];
  recipient: {
    address: string;
    timesPaidByWallet: number;
    lastPaidMs: number | null;
    hasSentToWallet: boolean;
    lookup: RecipientLookup;
  };
}

export interface GoalImpact {
  goalId: string;
  name: string;
  kind: "target" | "reserve";
  fundedBefore: string;
  fundedAfter: string;
  progressBefore: string;
  progressAfter: string;
  reserveBreached: boolean;
}

export interface SaveView {
  status: "computed" | "not_computed";
  reason: string | null;
  balanceBefore: string;
  balanceAfter: string | null;
  suiBefore: string;
  suiAfterEstimated: string | null;
  unallocatedBefore: string;
  unallocatedAfter: string | null;
  earmarkedUsed: string;
  goals: GoalImpact[];
}

export interface InvestView {
  status: "computed" | "not_computed" | "unavailable";
  reason: string | null;
  transferValueUsd: string | null;
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  targets: Record<string, string> | null;
}

export interface MemoryView {
  status: "applied" | "not_configured" | "no_session" | "unavailable";
  detail: string;
  items: { kind: "review" | "transfer_check" | "investment_decision" | "note"; summary: string; createdAt: string; source: string }[];
}

export interface TransferAssessment {
  simulationOnly: true;
  wallet: string;
  recipient: string;
  asset: { coinType: string; symbol: string | null; decimals: number };
  amount: string;
  verdict: Verdict;
  verdictTitle: string;
  verdictSummary: string;
  disclaimer: string;
  findings: Finding[];
  protect: ProtectView;
  save: SaveView;
  invest: InvestView;
  memory: MemoryView;
  gas: GasEstimate;
  spendable: SpendableBreakdown;
  generatedAt: string;
  source: { provider: "tatum"; network: string; fetchedAt: string };
}
