import { absBigInt } from "@/lib/units";
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";
import { FRAMEWORK_PACKAGES, RULE_CONFIG } from "./rules.config";
import type { BehavioralBaseline, CoinAmountStats, Confidence, CounterpartyStat, PackageStat } from "./security.types";

/**
 * Behavioral baseline from a wallet's own history. Pure and deterministic:
 * the same history always yields the same baseline. Only successful
 * transactions sent by the wallet contribute.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Outflow {
  coinType: string;
  symbol: string | null;
  decimals: number | null;
  rawAmount: bigint;
}

/** Value that left the wallet in a transaction it sent (gas excluded). */
export function outflowsOf(a: ActivityItem): Outflow[] {
  if (!a.isSender || a.success === false) return [];
  return a.transfers
    .filter((t) => BigInt(t.rawAmount) < 0n)
    .map((t) => ({ coinType: t.coinType, symbol: t.symbol, decimals: t.decimals, rawAmount: absBigInt(BigInt(t.rawAmount)) }));
}

export function nonFrameworkPackages(a: Pick<ActivityItem, "moveCalls">): string[] {
  return [...new Set(a.moveCalls.map((m) => m.package).filter((p) => !FRAMEWORK_PACKAGES.has(p)))];
}

/** Nearest-rank percentile over a sorted ascending list. */
export function percentile(sorted: bigint[], p: number): bigint {
  if (sorted.length === 0) throw new RangeError("percentile of empty list");
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function confidenceFor(outgoingCount: number): Confidence {
  const c = RULE_CONFIG.confidence;
  if (outgoingCount < c.low) return "insufficient";
  if (outgoingCount < c.medium) return "low";
  if (outgoingCount < c.high) return "medium";
  return "high";
}

const byTimeAsc = (a: ActivityItem, b: ActivityItem) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0);

export function sentTransactions(history: ActivityItem[]): ActivityItem[] {
  return history.filter((a) => a.isSender && a.success !== false).sort(byTimeAsc);
}

export function buildBaseline(history: ActivityItem[]): BehavioralBaseline {
  const sent = sentTransactions(history);
  const outgoing = sent.filter((a) => outflowsOf(a).length > 0);

  // Amount distributions per coin.
  const amounts = new Map<string, { meta: Outflow; values: bigint[] }>();
  for (const a of outgoing) {
    for (const o of outflowsOf(a)) {
      const entry = amounts.get(o.coinType) ?? { meta: o, values: [] };
      entry.values.push(o.rawAmount);
      amounts.set(o.coinType, entry);
    }
  }
  const amountStats: CoinAmountStats[] = [...amounts.values()]
    .map(({ meta, values }) => {
      const sorted = [...values].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      return {
        coinType: meta.coinType,
        symbol: meta.symbol,
        decimals: meta.decimals,
        count: sorted.length,
        median: percentile(sorted, 50).toString(),
        p75: percentile(sorted, 75).toString(),
        p90: percentile(sorted, 90).toString(),
        p95: percentile(sorted, 95).toString(),
        max: sorted[sorted.length - 1].toString(),
      };
    })
    .sort((x, y) => y.count - x.count);

  // Recipients, and how often this wallet pays someone it has not paid before.
  const recipientMap = new Map<string, CounterpartyStat>();
  let withRecipients = 0;
  let novel = 0;
  for (const a of outgoing) {
    if (a.recipients.length === 0) continue;
    withRecipients++;
    if (a.recipients.some((r) => !recipientMap.has(r))) novel++;
    for (const r of a.recipients) {
      const s = recipientMap.get(r) ?? { address: r, count: 0, firstSeenMs: a.timestampMs, lastSeenMs: a.timestampMs };
      s.count++;
      s.lastSeenMs = a.timestampMs;
      recipientMap.set(r, s);
    }
  }

  // Move packages the wallet has called.
  const packageMap = new Map<string, PackageStat>();
  for (const a of sent) {
    for (const m of a.moveCalls) {
      if (FRAMEWORK_PACKAGES.has(m.package)) continue;
      const s = packageMap.get(m.package) ?? { packageId: m.package, modules: [], count: 0, firstSeenMs: a.timestampMs };
      if (!s.modules.includes(m.module)) s.modules.push(m.module);
      s.count++;
      packageMap.set(m.package, s);
    }
  }

  const times = sent.map((a) => a.timestampMs).filter((t): t is number => t !== null);
  const windowStartMs = times.length ? times[0] : null;
  const windowEndMs = times.length ? times[times.length - 1] : null;
  const daily = dailyCounts(times);

  return {
    sentCount: sent.length,
    outgoingTransferCount: outgoing.length,
    windowStartMs,
    windowEndMs,
    amountStats,
    recipients: [...recipientMap.values()].sort((x, y) => y.count - x.count),
    recipientNoveltyRate: withRecipients >= RULE_CONFIG.minOutgoingForNovelty ? novel / withRecipients : null,
    packages: [...packageMap.values()].sort((x, y) => y.count - x.count),
    dailySentMean: daily ? daily.mean : null,
    dailySentStdDev: daily ? daily.stdDev : null,
    confidence: confidenceFor(outgoing.length),
  };
}

/** Mean and standard deviation of sends per day, including zero days; null if the span is too short. */
export function dailyCounts(sortedTimes: number[]): { mean: number; stdDev: number; days: number } | null {
  if (sortedTimes.length === 0) return null;
  const start = sortedTimes[0];
  const end = sortedTimes[sortedTimes.length - 1];
  const days = Math.floor((end - start) / DAY_MS) + 1;
  if ((end - start) / DAY_MS < RULE_CONFIG.minFrequencySpanDays) return null;
  const buckets = new Array<number>(days).fill(0);
  for (const t of sortedTimes) buckets[Math.min(days - 1, Math.floor((t - start) / DAY_MS))]++;
  const mean = buckets.reduce((s, v) => s + v, 0) / days;
  const variance = buckets.reduce((s, v) => s + (v - mean) ** 2, 0) / days;
  return { mean, stdDev: Math.sqrt(variance), days };
}
