"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { todayUtc } from "@/lib/dates";
import { formatAmount, shortCoinType } from "@/lib/format";
import { cn } from "@/lib/utils";
import { validateGoalAmounts } from "@/modules/savings/savings.engine";
import { SavingsGoalSchema, type SavingsGoal } from "@/modules/savings/savings.types";

export interface GoalAsset {
  coinType: string;
  symbol: string | null;
  decimals: number;
  /** Wallet balance (decimal string) if held. */
  balance: string | null;
}

interface Draft {
  kind: SavingsGoal["kind"];
  name: string;
  coinType: string;
  targetAmount: string;
  targetDate: string;
  monthlyContribution: string;
  initialEarmark: string;
  startDate: string;
  notes: string;
}

function draftFrom(goal: SavingsGoal | null, assets: GoalAsset[]): Draft {
  if (goal) {
    return {
      kind: goal.kind,
      name: goal.name,
      coinType: goal.coinType,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate ?? "",
      monthlyContribution: goal.monthlyContribution ?? "",
      initialEarmark: "",
      startDate: goal.startDate,
      notes: goal.notes ?? "",
    };
  }
  return {
    kind: "target",
    name: "",
    coinType: assets[0]?.coinType ?? "",
    targetAmount: "",
    targetDate: "",
    monthlyContribution: "",
    initialEarmark: "",
    startDate: todayUtc(),
    notes: "",
  };
}

function buildGoal(d: Draft, existing: SavingsGoal | null, asset: GoalAsset | undefined): { goal?: SavingsGoal; errors: string[] } {
  if (!asset) return { errors: ["Choose an asset."] };
  const now = new Date().toISOString();
  const startDate = existing?.startDate ?? d.startDate;
  if (!existing && startDate > todayUtc()) return { errors: ["The start date cannot be in the future."] };
  const allocations =
    existing?.allocations ??
    (d.initialEarmark.trim() && d.initialEarmark.trim() !== "0"
      ? [{ id: crypto.randomUUID(), date: startDate, delta: d.initialEarmark.trim(), note: "Initial earmark" }]
      : []);
  const candidate = {
    id: existing?.id ?? crypto.randomUUID(),
    kind: d.kind,
    name: d.name,
    coinType: asset.coinType,
    symbol: asset.symbol,
    decimals: asset.decimals,
    targetAmount: d.targetAmount.trim(),
    targetDate: d.targetDate || null,
    monthlyContribution: d.monthlyContribution.trim() || null,
    notes: d.notes.trim() || null,
    startDate,
    allocations,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const parsed = SavingsGoalSchema.safeParse(candidate);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const problems = validateGoalAmounts(parsed.data);
  return problems.length ? { errors: problems } : { goal: parsed.data, errors: [] };
}

export function GoalFormSheet({
  open,
  onOpenChange,
  assets,
  existing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: GoalAsset[];
  existing: SavingsGoal | null;
  onSave: (goal: SavingsGoal) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(existing, assets));
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const asset = assets.find((a) => a.coinType === draft.coinType) ?? (existing ? {
    coinType: existing.coinType, symbol: existing.symbol, decimals: existing.decimals, balance: null,
  } : undefined);
  const unit = asset?.symbol ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existing ? "Edit goal" : "New savings goal"}</SheetTitle>
          <SheetDescription>
            Amounts are in the goal&apos;s asset. Only funds you earmark count toward a goal.
          </SheetDescription>
        </SheetHeader>

        <form
          className="space-y-5 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = buildGoal(draft, existing, asset);
            setErrors(r.errors);
            if (r.goal) {
              onSave(r.goal);
              onOpenChange(false);
            }
          }}
        >
          <fieldset className="space-y-2" disabled={Boolean(existing)}>
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["target", "Savings target", "Reach an amount by a date"],
                  ["reserve", "Reserve", "Keep a minimum set aside"],
                ] as const
              ).map(([k, title, sub]) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={draft.kind === k}
                  onClick={() => set("kind", k)}
                  className={cn(
                    "rounded-md border border-border px-3 py-2 text-left disabled:opacity-60",
                    draft.kind === k ? "border-ring bg-muted/50" : "hover:bg-muted/30",
                  )}
                >
                  <div className="text-[13px] font-medium">{title}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Emergency reserve" maxLength={80} />
          </div>

          <div className="space-y-2">
            <Label>Asset</Label>
            <Select value={draft.coinType} onValueChange={(v) => set("coinType", v)} disabled={Boolean(existing)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an asset" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.coinType} value={a.coinType}>
                    {a.symbol ?? shortCoinType(a.coinType)}
                    <span className="text-xs text-muted-foreground">
                      {a.balance !== null ? `wallet ${formatAmount(a.balance)}` : "not held"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-target">{draft.kind === "reserve" ? "Minimum" : "Target"} ({unit})</Label>
              <Input id="goal-target" inputMode="decimal" className="num" value={draft.targetAmount} onChange={(e) => set("targetAmount", e.target.value)} placeholder="1000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date{draft.kind === "reserve" && " (optional)"}</Label>
              <Input id="goal-date" type="date" className="num" value={draft.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-monthly">Planned per month (optional)</Label>
              <Input id="goal-monthly" inputMode="decimal" className="num" value={draft.monthlyContribution} onChange={(e) => set("monthlyContribution", e.target.value)} placeholder="250" />
            </div>
            {!existing && (
              <div className="space-y-2">
                <Label htmlFor="goal-initial">Earmark now (optional)</Label>
                <Input id="goal-initial" inputMode="decimal" className="num" value={draft.initialEarmark} onChange={(e) => set("initialEarmark", e.target.value)} placeholder="0" />
              </div>
            )}
          </div>
          {!existing && (
            <div className="space-y-2">
              <Label htmlFor="goal-start">Started saving on</Label>
              <Input id="goal-start" type="date" className="num" value={draft.startDate} max={todayUtc()} onChange={(e) => set("startDate", e.target.value)} />
              <p className="text-xs text-subtle">Use an earlier date to record savings you began before today. The initial earmark is dated here.</p>
            </div>
          )}
          {!existing && asset?.balance !== undefined && (
            <p className="-mt-2 text-xs text-subtle">
              {asset.balance !== null ? `The wallet holds ${formatAmount(asset.balance)} ${unit}. ` : `The wallet holds no ${unit}. `}
              Earmarks are checked against the live balance.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="goal-notes">Notes (optional)</Label>
            <Textarea id="goal-notes" value={draft.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} rows={3} />
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-md border border-critical/30 bg-critical-muted px-3 py-2 text-xs text-critical" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <SheetFooter className="px-0">
            <Button type="submit">{existing ? "Save changes" : "Create goal"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
