import "server-only";
import type { NormalizedTransaction, RawBalance } from "@/modules/blockchain/blockchain.types";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { getAddressHistory } from "@/modules/portfolio/history.service";
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";
import { candidateFromActivity } from "./anomaly.engine";
import { buildBaseline } from "./baseline.service";
import { assessCandidate } from "./risk.engine";
import { RULE_CONFIG, RULES_VERSION } from "./rules.config";
import type { AssessedTransaction, SecurityReport, SecurityStatus, Severity } from "./security.types";

/**
 * Reconstructs, for each transaction, the watched address's coin balances
 * immediately before it, walking back from current balances through a
 * contiguous newest-first history. Returns null for a transaction when the
 * walk becomes inconsistent (negative balance), since later values would be
 * unreliable too.
 */
export function reconstructBalancesBefore(
  address: string,
  current: RawBalance[],
  newestFirst: NormalizedTransaction[],
): Map<string, Map<string, bigint> | null> {
  const running = new Map(current.map((b) => [b.coinType, BigInt(b.balance)]));
  const result = new Map<string, Map<string, bigint> | null>();
  let consistent = true;
  for (const tx of newestFirst) {
    if (!consistent) {
      result.set(tx.digest, null);
      continue;
    }
    for (const c of tx.balanceChanges) {
      if (c.address !== address) continue;
      const before = (running.get(c.coinType) ?? 0n) - BigInt(c.amount);
      if (before < 0n) consistent = false;
      running.set(c.coinType, before);
    }
    result.set(tx.digest, consistent ? new Map(running) : null);
  }
  return result;
}

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "none"];

export function summarize(
  assessed: AssessedTransaction[],
  outgoingCount: number,
): { status: SecurityStatus; summary: string } {
  const counts = countSeverities(assessed);
  const critical = assessed.some((a) => a.assessment.signals.some((s) => s.critical));
  if (critical || counts.high > 0) {
    return {
      status: "attention_required",
      summary: `${counts.high} transaction${counts.high === 1 ? "" : "s"} deviate strongly from this wallet's history${critical ? ", including a critical signal" : ""}. Deviations are not proof of malicious activity; review the evidence.`,
    };
  }
  if (counts.medium > 0) {
    return {
      status: "review_recommended",
      summary: `${counts.medium} transaction${counts.medium === 1 ? "" : "s"} show moderate deviations from this wallet's history.`,
    };
  }
  if (outgoingCount < RULE_CONFIG.confidence.low) {
    return {
      status: "insufficient_history",
      summary:
        assessed.length === 0
          ? "No transactions sent by this address in the analysed history, so there is no behavior to compare against."
          : `${assessed.length} sent transactions were analysed, but only ${outgoingCount} moved value out of the wallet — too few to establish a transfer baseline. Amount and recipient checks could not be applied.`,
    };
  }
  return {
    status: "no_anomalies",
    summary: "No medium or high deviations from this wallet's history were found in the analysed window. This is not a guarantee that the wallet is safe.",
  };
}

export function countSeverities(assessed: AssessedTransaction[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, none: 0 };
  for (const a of assessed) counts[a.assessment.severity]++;
  return counts;
}

/** Assesses every successful transaction the address sent, each against only its own prior history. */
export function assessHistory(
  activity: ActivityItem[],
  balancesBefore: Map<string, Map<string, bigint> | null>,
): AssessedTransaction[] {
  const assessed: AssessedTransaction[] = [];
  for (const a of activity) {
    const candidate = candidateFromActivity(a);
    if (!candidate) continue;
    const assessment = assessCandidate(candidate, activity, balancesBefore.get(a.digest) ?? null);
    assessed.push({
      digest: a.digest,
      timestampMs: a.timestampMs,
      direction: a.direction,
      outflows: candidate.outflows.map((o) => ({
        coinType: o.coinType,
        symbol: o.symbol,
        rawAmount: o.rawAmount.toString(),
        amount: a.transfers.find((t) => t.coinType === o.coinType)?.amount?.replace(/^-/, "") ?? null,
      })),
      recipients: a.recipients,
      moveCalls: a.moveCalls,
      assessment,
    });
  }
  return assessed.sort(
    (x, y) =>
      y.assessment.score - x.assessment.score ||
      SEVERITY_ORDER.indexOf(x.assessment.severity) - SEVERITY_ORDER.indexOf(y.assessment.severity) ||
      (y.timestampMs ?? 0) - (x.timestampMs ?? 0),
  );
}

export async function getSecurityReport(
  provider: SuiTatumProvider,
  address: string,
  opts: { fresh?: boolean } = {},
): Promise<SecurityReport> {
  const history = await getAddressHistory(provider, address, { fresh: opts.fresh });
  const balancesBefore = reconstructBalancesBefore(address, history.balances, history.transactions);
  const assessed = assessHistory(history.activity, balancesBefore);
  const baseline = buildBaseline(history.activity);
  const { status, summary } = summarize(assessed, baseline.outgoingTransferCount);

  const notes = [
    "Analysis is historical and refreshed manually. Guardian does not monitor in real time and cannot block transactions made in external wallets.",
    "Each transaction is scored only against transactions that happened before it.",
  ];
  if (!history.complete) {
    notes.push(
      `Analysis covers the ${history.transactions.length} most recent transactions; older history was not loaded.`,
    );
  }
  if (history.chain.lowestAvailableCheckpoint && history.chain.lowestAvailableCheckpoint !== "0") {
    notes.push(`The node serves history from checkpoint ${history.chain.lowestAvailableCheckpoint}; earlier activity is pruned and not considered.`);
  }

  return {
    address,
    network: history.source.network,
    status,
    statusSummary: summary,
    severityCounts: countSeverities(assessed),
    assessed,
    baseline,
    analysedTransactionCount: history.transactions.length,
    historyComplete: history.complete,
    monitoring: "historical_manual_refresh",
    rulesVersion: RULES_VERSION,
    source: history.source,
    notes,
  };
}
