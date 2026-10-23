import { formatAmount, shortCoinType } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { formatUnits } from "@/lib/units";
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";
import { buildBaseline, dailyCounts, nonFrameworkPackages, outflowsOf, sentTransactions } from "./baseline.service";
import { RULE_CONFIG } from "./rules.config";
import type { BehavioralBaseline, Candidate, Limitation, RiskSignal } from "./security.types";

/**
 * Deterministic anomaly rules. Each rule compares a candidate against a
 * baseline built only from transactions strictly before it, and returns
 * either a signal with evidence, a limitation (could not evaluate), or a
 * note (evaluated, intentionally not scored). Nothing here calls an LLM.
 */

export interface RuleContext {
  /** Baseline from prior history only. */
  baseline: BehavioralBaseline;
  /** Prior history (strictly before the candidate). */
  prior: ActivityItem[];
  /** Coin balances immediately before the candidate, if reliably known. */
  balanceBefore: Map<string, bigint> | null;
}

export interface RuleOutput {
  signals: RiskSignal[];
  limitations: Limitation[];
  notes: string[];
}

function display(raw: bigint | string, decimals: number | null, symbol: string | null, coinType: string): string {
  const unit = symbol ?? shortCoinType(coinType);
  return decimals === null ? `${raw} raw units of ${unit}` : `${formatAmount(formatUnits(raw, decimals))} ${unit}`;
}

function ratioPct(amount: bigint, reference: bigint): bigint {
  return (amount * 100n) / reference;
}

function unusualAmount(c: Candidate, ctx: RuleContext, out: RuleOutput) {
  let best: { signal: RiskSignal; ratio: bigint } | null = null;
  for (const o of c.outflows) {
    const stats = ctx.baseline.amountStats.find((s) => s.coinType === o.coinType);
    if (!stats || stats.count < RULE_CONFIG.minAmountSamples) {
      out.limitations.push({
        rule: "UNUSUAL_AMOUNT",
        reason: `Only ${stats?.count ?? 0} prior outgoing ${o.symbol ?? shortCoinType(o.coinType)} transfers; at least ${RULE_CONFIG.minAmountSamples} are needed to compare amounts.`,
      });
      continue;
    }
    const p95 = BigInt(stats.p95);
    if (p95 === 0n) continue;
    const ratio = ratioPct(o.rawAmount, p95);
    const tier = RULE_CONFIG.unusualAmount.tiers.find((t) => ratio > BigInt(t.abovePct));
    if (!tier) continue;
    const amount = display(o.rawAmount, o.decimals, o.symbol, o.coinType);
    const signal: RiskSignal = {
      rule: "UNUSUAL_AMOUNT",
      title: "Amount above historical range",
      points: tier.points,
      critical: false,
      explanation: `${amount} is ${(Number(ratio) / 100).toFixed(1)}× this wallet's 95th-percentile outgoing ${o.symbol ?? "transfer"} amount, based on ${stats.count} prior transfers.`,
      evidence: [
        { label: "Amount", value: amount },
        { label: "Median (p50)", value: display(stats.median, o.decimals, o.symbol, o.coinType) },
        { label: "p90", value: display(stats.p90, o.decimals, o.symbol, o.coinType) },
        { label: "p95", value: display(stats.p95, o.decimals, o.symbol, o.coinType) },
        { label: "Largest prior", value: display(stats.max, o.decimals, o.symbol, o.coinType) },
        { label: "Sample size", value: `${stats.count} prior transfers` },
      ],
    };
    if (!best || ratio > best.ratio) best = { signal, ratio };
  }
  if (best) out.signals.push(best.signal);
  return best?.ratio ?? null;
}

function newRecipient(c: Candidate, ctx: RuleContext, out: RuleOutput): boolean {
  if (c.recipients.length === 0) return false;
  const known = new Set(ctx.baseline.recipients.map((r) => r.address));
  const unseen = c.recipients.filter((r) => !known.has(r));
  if (unseen.length === 0) return false;

  const novelty = ctx.baseline.recipientNoveltyRate;
  if (novelty === null) {
    out.limitations.push({
      rule: "NEW_RECIPIENT",
      reason: `Fewer than ${RULE_CONFIG.minOutgoingForNovelty} prior outgoing transfers with identifiable recipients; recipient familiarity cannot be judged.`,
    });
    return false;
  }
  const points = Math.round(RULE_CONFIG.newRecipient.maxPoints * (1 - novelty));
  const pct = Math.round(novelty * 100);
  if (points === 0) {
    out.notes.push(
      `Recipient ${shortAddress(unseen[0])} is new, but ${pct}% of this wallet's prior transfers also went to new recipients, so novelty is normal for it and was not scored.`,
    );
    return true;
  }
  out.signals.push({
    rule: "NEW_RECIPIENT",
    title: "Recipient not seen before",
    points,
    critical: false,
    explanation: `No prior outgoing transfer from this wallet went to ${unseen.map((r) => shortAddress(r)).join(", ")} in the analysed history. Points are scaled by how often this wallet pays new recipients (${pct}% of prior transfers).`,
    evidence: [
      { label: "New recipient", value: unseen.join(", ") },
      { label: "Known recipients", value: `${known.size}` },
      { label: "Novelty rate", value: `${pct}% of ${ctx.baseline.outgoingTransferCount} prior transfers` },
    ],
  });
  return true;
}

function frequencySpike(c: Candidate, ctx: RuleContext, out: RuleOutput) {
  const { windowMs, minCount, tiers } = RULE_CONFIG.frequency;
  const prior = sentTransactions(ctx.prior).filter((a) => a.timestampMs !== null);
  const inWindow = prior.filter((a) => (a.timestampMs as number) > c.timestampMs - windowMs);
  const before = prior.filter((a) => (a.timestampMs as number) <= c.timestampMs - windowMs).map((a) => a.timestampMs as number);
  const daily = dailyCounts(before);
  if (!daily) {
    out.limitations.push({
      rule: "FREQUENCY_SPIKE",
      reason: `Prior sent history spans less than ${RULE_CONFIG.minFrequencySpanDays} days; transaction frequency cannot be compared.`,
    });
    return;
  }
  const count = inWindow.length + 1;
  if (count < minCount) return;
  const z = (count - daily.mean) / Math.max(daily.stdDev, 1);
  const tier = tiers.find((t) => z >= t.z);
  if (!tier) return;
  out.signals.push({
    rule: "FREQUENCY_SPIKE",
    title: "Unusual transaction frequency",
    points: tier.points,
    critical: false,
    explanation: `${count} transactions were sent in the 24 hours up to this one, versus a typical ${daily.mean.toFixed(1)} per day (σ ${daily.stdDev.toFixed(1)}) over the prior ${daily.days} days.`,
    evidence: [
      { label: "Sent in 24h", value: `${count}`, digests: [...inWindow.map((a) => a.digest), ...(c.digest ? [c.digest] : [])] },
      { label: "Daily mean", value: daily.mean.toFixed(2) },
      { label: "Daily σ", value: daily.stdDev.toFixed(2) },
      { label: "z-score", value: z.toFixed(2) },
    ],
  });
}

function newPackage(c: Candidate, ctx: RuleContext, out: RuleOutput) {
  if (c.packages.length === 0) return;
  if (ctx.baseline.sentCount < RULE_CONFIG.minSentForPackages) {
    out.limitations.push({
      rule: "NEW_PACKAGE",
      reason: `Only ${ctx.baseline.sentCount} prior sent transactions; first-time contract use cannot be judged.`,
    });
    return;
  }
  const known = new Set(ctx.baseline.packages.map((p) => p.packageId));
  const unseen = c.packages.filter((p) => !known.has(p));
  if (unseen.length === 0) return;
  out.signals.push({
    rule: "NEW_PACKAGE",
    title: "First interaction with a Move package",
    points: RULE_CONFIG.newPackage.points,
    critical: false,
    explanation: `This wallet had not called ${unseen.length === 1 ? "this package" : "these packages"} in ${ctx.baseline.sentCount} prior sent transactions. A first interaction is not evidence that the package is unsafe.`,
    evidence: [
      { label: "New packages", value: unseen.join(", ") },
      { label: "Previously used packages", value: `${known.size}` },
    ],
  });
}

function largeOutflow(c: Candidate, ctx: RuleContext, out: RuleOutput) {
  if (c.outflows.length === 0) return;
  if (!ctx.balanceBefore) {
    out.limitations.push({ rule: "LARGE_OUTFLOW", reason: "The balance before this transaction could not be reliably reconstructed." });
    return;
  }
  let best: { share: bigint; signal: RiskSignal } | null = null;
  for (const o of c.outflows) {
    const before = ctx.balanceBefore.get(o.coinType);
    if (before === undefined || before <= 0n || before < o.rawAmount) {
      out.limitations.push({
        rule: "LARGE_OUTFLOW",
        reason: `Balance of ${o.symbol ?? shortCoinType(o.coinType)} before this transaction is unknown or inconsistent with the outflow.`,
      });
      continue;
    }
    const share = ratioPct(o.rawAmount, before);
    const tier = RULE_CONFIG.largeOutflow.tiers.find((t) => share >= BigInt(t.atLeastPct));
    if (!tier) continue;
    const signal: RiskSignal = {
      rule: "LARGE_OUTFLOW",
      title: tier.critical ? "Most of the balance moved out" : "Large share of balance moved out",
      points: tier.points,
      critical: tier.critical,
      explanation: `This transfer moved ${share}% of the ${o.symbol ?? "coin"} balance the wallet held immediately before it.`,
      evidence: [
        { label: "Outflow", value: display(o.rawAmount, o.decimals, o.symbol, o.coinType) },
        { label: "Balance before", value: display(before, o.decimals, o.symbol, o.coinType) },
        { label: "Share", value: `${share}%` },
      ],
    };
    if (!best || share > best.share) best = { share, signal };
  }
  if (best) out.signals.push(best.signal);
}

function newAsset(c: Candidate, ctx: RuleContext, out: RuleOutput) {
  if (ctx.baseline.outgoingTransferCount < RULE_CONFIG.minOutgoingForNovelty) return;
  const knownCoins = new Set(ctx.baseline.amountStats.map((s) => s.coinType));
  const unseen = c.outflows.filter((o) => !knownCoins.has(o.coinType));
  if (unseen.length === 0) return;
  out.signals.push({
    rule: "NEW_ASSET",
    title: "First outgoing transfer of this asset",
    points: RULE_CONFIG.newAsset.points,
    critical: false,
    explanation: `None of the ${ctx.baseline.outgoingTransferCount} prior outgoing transfers moved ${unseen.map((o) => o.symbol ?? shortCoinType(o.coinType)).join(", ")}.`,
    evidence: unseen.map((o) => ({ label: "Asset", value: o.coinType })),
  });
}

export function evaluateRules(c: Candidate, ctx: RuleContext): RuleOutput {
  const out: RuleOutput = { signals: [], limitations: [], notes: [] };
  const amountRatio = unusualAmount(c, ctx, out);
  const recipientIsNew = newRecipient(c, ctx, out);
  frequencySpike(c, ctx, out);
  newPackage(c, ctx, out);
  largeOutflow(c, ctx, out);
  newAsset(c, ctx, out);

  // A very large amount to a never-seen recipient is critical regardless of novelty weighting.
  if (amountRatio !== null && recipientIsNew && amountRatio > BigInt(RULE_CONFIG.criticalAmountToNewRecipientPct)) {
    const s = out.signals.find((x) => x.rule === "UNUSUAL_AMOUNT");
    if (s) {
      s.critical = true;
      s.explanation += " The recipient has not been paid before, so this combination is marked critical.";
    }
  }
  return out;
}

/** Builds the candidate for a historical transaction sent by the wallet. */
export function candidateFromActivity(a: ActivityItem): Candidate | null {
  if (!a.isSender || a.success === false || a.timestampMs === null) return null;
  return {
    digest: a.digest,
    timestampMs: a.timestampMs,
    outflows: outflowsOf(a),
    recipients: a.recipients,
    packages: nonFrameworkPackages(a),
  };
}

export { buildBaseline };
