"use client";

import { useState } from "react";
import { Panel } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { useMemoryWrites } from "@/components/memory/use-memory-writes";
import { Input } from "@/components/ui/input";
import { formatAmount, formatTimestamp } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { cn } from "@/lib/utils";
import type { Finding, FindingCategory, TransferAssessment, Verdict } from "@/modules/assessment/transfer.types";

const VERDICT_TONE: Record<Verdict, { dot: string; border: string }> = {
  insufficient_balance: { dot: "bg-critical", border: "border-critical/40" },
  insufficient_gas: { dot: "bg-critical", border: "border-critical/40" },
  review_carefully: { dot: "bg-critical", border: "border-critical/30" },
  proceed_with_caution: { dot: "bg-warning", border: "border-warning/30" },
  no_issues_found: { dot: "bg-subtle", border: "border-border" },
};

const CATEGORY: { key: FindingCategory; title: string; hint: string }[] = [
  { key: "fact", title: "Confirmed facts", hint: "Deterministic from balances and your saved goals" },
  { key: "pattern", title: "Historical patterns", hint: "Deviations from this wallet's onchain history" },
  { key: "preference", title: "Your preferences and decisions", hint: "From your settings and memory; not verified evidence" },
  { key: "unknown", title: "Unknowns", hint: "What could not be checked" },
];

const LEVEL_DOT: Record<Finding["level"], string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  caution: "bg-muted-foreground/60",
  info: "bg-border",
};

const PILLAR: Record<Finding["pillar"], string> = { protect: "Protect", save: "Save", invest: "Invest", memory: "Memory", general: "General" };

export function VerdictBand({ a }: { a: TransferAssessment }) {
  const tone = VERDICT_TONE[a.verdict];
  return (
    <section className={cn("rounded-lg border bg-surface px-5 py-4", tone.border)}>
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", tone.dot)} />
        <span className="text-[15px] font-medium">{a.verdictTitle}</span>
      </div>
      <p className="num mt-1.5 text-[13px] text-muted-foreground">
        Simulated: {formatAmount(a.amount, 6)} {a.asset.symbol ?? ""} to <span className="font-mono">{shortAddress(a.recipient, 6)}</span>. {a.verdictSummary}
      </p>
      <p className="mt-2 text-xs text-subtle">{a.disclaimer}</p>
    </section>
  );
}

export function FindingsByCategory({ a }: { a: TransferAssessment }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {CATEGORY.map((c) => {
        const list = a.findings.filter((f) => f.category === c.key);
        return (
          <Panel key={c.key} title={c.title} meta={c.hint}>
            {list.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-subtle">None.</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((f) => (
                  <li key={f.id} className="flex gap-2.5 px-4 py-2.5">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", LEVEL_DOT[f.level])} aria-label={f.level} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {f.title} <span className="ml-1 text-[10px] font-normal tracking-wide text-subtle uppercase">{PILLAR[f.pillar]}</span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{f.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function Row({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  return (
    <div className="num flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-all">
        {before ?? "—"} <span className="text-subtle">→</span>{" "}
        <span className={cn(after === null ? "text-subtle" : "font-medium")}>{after ?? "not calculated"}</span>
      </span>
    </div>
  );
}

export function PillarPanels({ a }: { a: TransferAssessment }) {
  const unit = a.asset.symbol ?? "";
  const p = a.protect;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Protect" meta="Pre-execution signals · onchain evidence only">
        <div className="space-y-2 px-4 py-3 text-[13px]">
          <div className="num flex items-baseline justify-between">
            <span className="text-muted-foreground">Score</span>
            <span>
              <span className="text-[18px] font-medium">{p.score}</span>/100 · {p.severity} · confidence {p.confidence}
            </span>
          </div>
          <div className="text-muted-foreground">
            Paid this recipient {p.recipient.timesPaidByWallet}×{p.recipient.lastPaidMs ? `, last ${formatTimestamp(p.recipient.lastPaidMs)}` : ""}
            {p.recipient.hasSentToWallet ? " · it has sent funds to this wallet" : ""}
          </div>
          <div className="text-muted-foreground">
            Recipient lookup:{" "}
            {p.recipient.lookup.status === "active"
              ? `${p.recipient.lookup.atLeast ? "at least " : ""}${p.recipient.lookup.recentTransactions} recent transactions`
              : p.recipient.lookup.status === "no_activity"
                ? "no activity found (unknown, not safe)"
                : `unavailable (${p.recipient.lookup.reason})`}
          </div>
          <p className="text-xs text-subtle">Not applicable before execution: {p.notApplicable.join(" ")}</p>
        </div>
      </Panel>

      <Panel title="Save" meta={a.save.status === "computed" ? "Before → after (estimated)" : "Not calculated"}>
        <div className="px-4 py-3">
          <Row label={`${unit} balance`} before={formatAmount(a.save.balanceBefore, 6)} after={a.save.balanceAfter && formatAmount(a.save.balanceAfter, 6)} />
          <Row label={`Unallocated ${unit}`} before={formatAmount(a.save.unallocatedBefore, 6)} after={a.save.unallocatedAfter && formatAmount(a.save.unallocatedAfter, 6)} />
          <Row label="SUI incl. estimated gas" before={formatAmount(a.save.suiBefore, 6)} after={a.save.suiAfterEstimated && formatAmount(a.save.suiAfterEstimated, 6)} />
          {a.save.goals.map((g) => (
            <Row key={g.goalId} label={`${g.name}${g.reserveBreached ? " (below minimum)" : ""}`} before={`${g.progressBefore}%`} after={`${g.progressAfter}%`} />
          ))}
          {a.save.reason && <p className="mt-1 text-xs text-subtle">{a.save.reason}</p>}
        </div>
      </Panel>

      <Panel title="Invest" meta={a.invest.status === "computed" ? "Allocation at your reference prices (assumptions)" : "Not available"}>
        <div className="px-4 py-3">
          <div className="num flex justify-between py-1 text-[13px]">
            <span className="text-muted-foreground">Transfer value</span>
            <span>{a.invest.transferValueUsd !== null ? `$${formatAmount(a.invest.transferValueUsd, 2)}` : "unknown (no reference price)"}</span>
          </div>
          {a.invest.before && a.invest.after ? (
            (["native", "stablecoin", "other"] as const).map((k) => (
              <Row key={k} label={`${k === "native" ? "SUI" : k === "stablecoin" ? "Stablecoins" : "Other"}${a.invest.targets ? ` (target ${a.invest.targets[k]}%)` : ""}`} before={`${a.invest.before![k]}%`} after={`${a.invest.after![k]}%`} />
            ))
          ) : (
            <p className="text-xs text-subtle">{a.invest.reason}</p>
          )}
        </div>
      </Panel>

      <Panel title="Memory" meta={a.memory.status === "applied" ? "Your past reviews, checks and decisions" : "Not consulted"}>
        {a.memory.items.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-subtle">{a.memory.status === "applied" ? "Nothing relevant remembered for this recipient." : a.memory.detail}</p>
        ) : (
          <ul className="divide-y divide-border">
            {a.memory.items.map((m, i) => (
              <li key={i} className="px-4 py-2 text-[13px]">
                <span className="text-muted-foreground">{m.summary}</span>{" "}
                <span className="text-xs text-subtle">
                  {m.source} · {m.createdAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function DecisionForm({ onSave, saving, saved }: { onSave: (decision: "would_proceed" | "would_not_proceed", note: string) => void; saving: boolean; saved: boolean }) {
  const [note, setNote] = useState("");
  const writes = useMemoryWrites();
  if (!writes.enabled) return <p className="px-4 py-3 text-xs text-subtle">{writes.detail}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      {writes.allowNotes && (
        <Input aria-label="Note (optional)" placeholder="Note (optional, no personal data)" className="h-8 max-w-sm flex-1 text-[13px]" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      <Button size="sm" variant="outline" disabled={saving} onClick={() => onSave("would_proceed", note.trim())}>
        I would proceed
      </Button>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => onSave("would_not_proceed", note.trim())}>
        I would not proceed
      </Button>
      {saved && <span className="text-xs text-subtle">Saved to memory; it will be recalled next time you check this recipient.</span>}
    </div>
  );
}
