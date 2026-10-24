import { formatAmount, formatTimestamp, shortCoinType } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import type { MemoryRecord } from "@/modules/memory/memory.types";
import type { PortfolioSnapshot } from "@/modules/portfolio/portfolio.types";
import type { GoalEvaluation, SavingsEvaluation, SavingsGoal } from "@/modules/savings/savings.types";
import type { SecurityReport } from "@/modules/security/security.types";
import type { StrategyEvaluation, StrategySettings } from "@/modules/strategy/strategy.types";
import type { AgentContext, ContextItem, ContextKind, ContextSection } from "./ai.types";

/**
 * Builds the bounded, provenance-tagged context the model may use. Pure: all
 * numbers come from Tatum or the deterministic engines; nothing is computed
 * by the model. Each source is optional; a missing one becomes an explicit gap.
 */

export interface ContextInputs {
  address: string;
  network: string;
  portfolio: { ok: true; value: PortfolioSnapshot } | { ok: false; error: string } | null;
  security: { ok: true; value: SecurityReport } | { ok: false; error: string } | null;
  savings: { ok: true; goals: SavingsGoal[]; value: SavingsEvaluation | null } | { ok: false; error: string } | null;
  strategy: { ok: true; settings: StrategySettings | null; value: StrategyEvaluation } | { ok: false; error: string } | null;
  memories: { ok: true; records: MemoryRecord[]; provider: string } | { ok: false; error: string } | null;
}

const MAX_ITEM_CHARS = 420;
export const MAX_CONTEXT_CHARS = 14_000;

class Builder {
  items: ContextItem[] = [];
  private counters: Record<ContextKind, number> = { onchain: 0, calculation: 0, preference: 0, memory: 0 };
  private prefix: Record<ContextKind, string> = { onchain: "O", calculation: "C", preference: "P", memory: "M" };
  private chars = 0;

  add(kind: ContextKind, source: string, asOf: string | null, text: string, untrusted = false): string | null {
    const clipped = text.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_CHARS);
    if (this.chars + clipped.length > MAX_CONTEXT_CHARS) return null;
    this.chars += clipped.length;
    const id = `${this.prefix[kind]}${++this.counters[kind]}`;
    this.items.push({ id, kind, source, asOf, text: clipped, ...(untrusted ? { untrusted } : {}) });
    return id;
  }
}

const amt = (v: string | null, unit: string | null) => (v === null ? "unknown amount" : `${formatAmount(v, 6)} ${unit ?? ""}`.trim());

function goalLine(g: SavingsGoal, e: GoalEvaluation | undefined): string {
  const unit = g.symbol ?? "units";
  if (!e) return `Goal "${g.name}" (${g.kind}): target ${amt(g.targetAmount, unit)}${g.targetDate ? ` by ${g.targetDate}` : ""}; not evaluated.`;
  const parts = [
    `Goal "${g.name}" (${g.kind === "reserve" ? "reserve minimum" : "savings target"}): ${amt(e.funded, unit)} funded of ${amt(e.target, unit)} (${e.progressPct}%), remaining ${amt(e.remaining, unit)}`,
    e.fundingStatus === "partially_backed" ? `only ${amt(e.verified, unit)} of ${amt(e.earmarked, unit)} earmarked is backed by the wallet balance` : null,
    g.targetDate ? `target date ${g.targetDate} (${e.daysRemaining} days)` : null,
    e.requiredMonthly && g.kind === "target" ? `needs ${amt(e.requiredMonthly, unit)}/month` : null,
    e.plannedMonthly ? `planned ${amt(e.plannedMonthly, unit)}/month` : null,
    e.monthlyShortfall ? `plan short by ${amt(e.monthlyShortfall, unit)}/month` : null,
    e.schedule.status !== "not_applicable" ? `schedule: ${e.schedule.status.replace("_", " ")}` : null,
    e.projection.estimatedCompletionDate ? `estimated completion ${e.projection.estimatedCompletionDate}` : null,
  ];
  return parts.filter(Boolean).join("; ") + ".";
}

export function buildContext(input: ContextInputs): AgentContext {
  const b = new Builder();
  const sections: ContextSection[] = [];

  // --- Onchain facts (Tatum) ---------------------------------------------------
  if (input.portfolio?.ok) {
    const p = input.portfolio.value;
    const src = `Tatum Sui ${p.network} (checkpoint ${p.chain.checkpointHeight})`;
    b.add("onchain", src, p.source.fetchedAt, `Watched wallet ${shortAddress(p.address, 6)} on Sui ${p.network}. Analysis is watch-only and does not prove ownership.`);
    for (const h of p.holdings.slice(0, 8)) {
      b.add("onchain", src, p.source.fetchedAt, `Holds ${amt(h.amount, h.symbol ?? shortCoinType(h.coinType))} (${h.assetClass === "other" ? "unclassified" : h.assetClass}).`);
    }
    b.add("onchain", src, p.source.fetchedAt, `Fiat valuation: unavailable (${p.valuation.reason}).`);
    for (const a of p.activity.slice(0, 6)) {
      const moves = a.transfers.map((t) => amt(t.amount, t.symbol)).join(", ") || "no value moved";
      b.add("onchain", src, p.source.fetchedAt, `Transaction ${a.digest.slice(0, 10)}… at ${formatTimestamp(a.timestampMs)}: ${a.direction}, ${moves}${a.counterparties[0] ? `, counterparty ${shortAddress(a.counterparties[0])}` : ""}.`);
    }
    sections.push({ name: "portfolio", status: "ok", detail: `${p.holdings.length} holdings, ${p.activity.length} recent transactions` });
  } else {
    sections.push({ name: "portfolio", status: "unavailable", detail: input.portfolio && !input.portfolio.ok ? input.portfolio.error : "Not requested." });
  }

  // --- Protect (deterministic engine) -----------------------------------------
  if (input.security?.ok) {
    const r = input.security.value;
    const src = `Protect engine (${r.rulesVersion})`;
    b.add("calculation", src, r.source.fetchedAt, `Security status: ${r.status.replace(/_/g, " ")}. ${r.statusSummary} Open findings: ${r.openCounts.high} high, ${r.openCounts.medium} medium, ${r.openCounts.low} low across ${r.assessed.length} sent transactions (${r.analysedTransactionCount} analysed). Anomalies are deviations from this wallet's history, not proof of malicious activity.`);
    b.add("calculation", src, r.source.fetchedAt, `Behavioral baseline: ${r.baseline.outgoingTransferCount} value transfers, ${r.baseline.recipients.length} known recipients, new-recipient rate ${r.baseline.recipientNoveltyRate === null ? "unknown" : `${Math.round(r.baseline.recipientNoveltyRate * 100)}%`}, confidence ${r.baseline.confidence}.`);
    for (const a of r.assessed.filter((x) => x.assessment.score > 0).slice(0, 5)) {
      const sig = a.assessment.signals.map((s) => `${s.title} (+${s.points}${s.critical ? ", critical" : ""}): ${s.explanation}`).join(" ");
      const review = a.review ? ` User review: ${a.review.verdict}${a.review.remainsFlagged ? " (still flagged: critical)" : ""}.` : "";
      b.add("calculation", src, r.source.fetchedAt, `Transaction ${a.digest.slice(0, 10)}… scored ${a.assessment.score}/100 (${a.assessment.severity}, confidence ${a.assessment.confidence}). ${sig}${review}`);
    }
    b.add("calculation", src, null, `Memory for Protect: ${r.memory.detail}`);
    sections.push({ name: "security", status: "ok", detail: `${r.status.replace(/_/g, " ")}; ${r.assessed.length} assessed` });
  } else {
    sections.push({ name: "security", status: "unavailable", detail: input.security && !input.security.ok ? input.security.error : "Not requested." });
  }

  // --- Save --------------------------------------------------------------------
  if (input.savings?.ok) {
    const { goals, value } = input.savings;
    if (goals.length === 0) {
      sections.push({ name: "savings", status: "empty", detail: "No savings goals saved." });
    } else {
      for (const g of goals.slice(0, 6)) {
        b.add("preference", "Savings goal you defined", g.updatedAt, `You defined ${g.kind === "reserve" ? "a reserve" : "a savings goal"} "${g.name}": ${g.kind === "reserve" ? "keep at least" : "reach"} ${amt(g.targetAmount, g.symbol)}${g.targetDate ? ` by ${g.targetDate}` : ""}${g.monthlyContribution ? `, planning ${amt(g.monthlyContribution, g.symbol)}/month` : ""}${g.notes ? `. Your note: ${g.notes}` : ""}.`, Boolean(g.notes));
        const e = value?.goals.find((x) => x.goalId === g.id);
        b.add("calculation", "Savings engine (live balance via Tatum)", value?.source.fetchedAt ?? null, goalLine(g, e));
        for (const i of e?.insights ?? []) b.add("calculation", "Savings engine", value?.source.fetchedAt ?? null, `${g.name}: ${i.title}. ${i.detail}`);
      }
      sections.push({ name: "savings", status: value ? "ok" : "unavailable", detail: value ? `${goals.length} goal(s) evaluated` : "Goals loaded but not evaluated." });
    }
  } else {
    sections.push({ name: "savings", status: "unavailable", detail: input.savings && !input.savings.ok ? input.savings.error : "Not requested." });
  }

  // --- Invest ------------------------------------------------------------------
  if (input.strategy?.ok) {
    const { settings, value } = input.strategy;
    if (settings?.targets) {
      b.add("preference", "Investment preferences you set", settings.updatedAt, `Your targets: SUI ${settings.targets.native}%, stablecoins ${settings.targets.stablecoin}%, other ${settings.targets.other}%; drift band ±${settings.driftBandPct} points; risk tolerance ${settings.riskTolerance ?? "not set"}; horizon ${settings.horizon ?? "not set"}${settings.gasReserveSui ? `; keep ${settings.gasReserveSui} SUI for gas` : ""}${settings.minStablecoinReserveUsd ? `; minimum stablecoin reserve $${settings.minStablecoinReserveUsd}` : ""}.`);
    }
    if (value.status !== "complete") {
      b.add("calculation", "Allocation engine", value.source.fetchedAt, `Allocation percentages are unavailable: ${value.unavailableReason}`);
    } else {
      b.add("calculation", "Allocation engine (user reference prices — assumptions, not market prices)", value.source.fetchedAt, `Allocation at your reference prices (total $${formatAmount(value.totalUsd ?? "0", 2)}): ${value.classes!.map((c) => `${c.assetClass} ${c.currentPct}%${c.targetPct ? ` vs target ${c.targetPct}% (drift ${c.driftPct})` : ""}`).join("; ")}.`);
      if (value.scenario) {
        const trades = value.scenario.trades.map((t) => `${t.side === "sell" ? "reduce" : "increase"} ${t.symbol ?? t.assetClass} ${t.amount ? formatAmount(t.amount) : ""} ($${formatAmount(t.valueUsd, 2)})`).join("; ");
        b.add("calculation", "Allocation engine (illustrative, not executed)", value.source.fetchedAt, `Illustrative rebalancing: ${trades || "no change needed"}. Result: ${Object.entries(value.scenario.resultingPct).map(([k, v]) => `${k} ${v}%`).join(", ")}. ${value.scenario.constraintsApplied.join(" ")}`);
      }
    }
    for (const w of value.warnings.slice(0, 4)) b.add("calculation", "Allocation engine", value.source.fetchedAt, `${w.title}: ${w.detail}`);
    sections.push({ name: "strategy", status: "ok", detail: `allocation ${value.status}` });
  } else {
    sections.push({ name: "strategy", status: "unavailable", detail: input.strategy && !input.strategy.ok ? input.strategy.error : "Not requested." });
  }

  // --- Memory (untrusted text) ----------------------------------------------------
  if (input.memories?.ok) {
    const recs = input.memories.records.slice(0, 8);
    for (const r of recs) {
      b.add("memory", `${input.memories.provider} · ${r.category.replace("_", " ")} · source: ${r.source}`, r.createdAt, r.summary, true);
    }
    sections.push({ name: "memory", status: recs.length ? "ok" : "empty", detail: recs.length ? `${recs.length} relevant memories (${input.memories.provider})` : "No relevant memories." });
  } else {
    sections.push({ name: "memory", status: "unavailable", detail: input.memories && !input.memories.ok ? input.memories.error : "Not requested." });
  }

  return { address: input.address, network: input.network, items: b.items, sections };
}
