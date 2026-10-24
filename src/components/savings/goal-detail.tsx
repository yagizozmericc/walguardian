"use client";

import { useState } from "react";
import { AlertTriangle, Info, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayUtc } from "@/lib/dates";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { validateGoalAmounts } from "@/modules/savings/savings.engine";
import type { GoalEvaluation, SavingsGoal } from "@/modules/savings/savings.types";
import { GoalChart } from "./goal-chart";
import { SCHEDULE_LABEL, SCHEDULE_TEXT } from "./labels";

function Figure({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd className="num mt-1 truncate text-[15px] font-medium">{value}</dd>
      {sub && <dd className="mt-0.5 truncate text-xs text-subtle">{sub}</dd>}
    </div>
  );
}

function AllocationForm({ goal, onSave }: { goal: SavingsGoal; onSave: (g: SavingsGoal) => void }) {
  const [mode, setMode] = useState<"add" | "release">("add");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayUtc());
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = amount.trim();
        if (!/^\d+(\.\d+)?$/.test(value) || /^0+(\.0+)?$/.test(value)) {
          setError("Enter a positive amount.");
          return;
        }
        if (date < goal.startDate) {
          setError(`The date cannot be before the goal started (${goal.startDate}).`);
          return;
        }
        const next: SavingsGoal = {
          ...goal,
          allocations: [
            ...goal.allocations,
            { id: crypto.randomUUID(), date, delta: mode === "add" ? value : `-${value}` },
          ],
          updatedAt: new Date().toISOString(),
        };
        const problems = validateGoalAmounts(next);
        if (problems.length) {
          setError(problems[0]);
          return;
        }
        setError(null);
        setAmount("");
        onSave(next);
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(["add", "release"] as const).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded px-2 py-1 text-muted-foreground", mode === m && "bg-muted font-medium text-foreground")}
            >
              {m === "add" ? "Earmark" : "Release"}
            </button>
          ))}
        </div>
        <div className="w-28">
          <Label htmlFor={`amt-${goal.id}`} className="sr-only">Amount</Label>
          <Input id={`amt-${goal.id}`} inputMode="decimal" className="num h-8" placeholder={`0 ${goal.symbol ?? ""}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="w-36">
          <Label htmlFor={`date-${goal.id}`} className="sr-only">Date</Label>
          <Input id={`date-${goal.id}`} type="date" className="num h-8" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="secondary">Record</Button>
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
    </form>
  );
}

export function GoalDetail({
  goal,
  evaluation,
  onSave,
  onEdit,
  onDelete,
}: {
  goal: SavingsGoal;
  evaluation: GoalEvaluation | null;
  onSave: (g: SavingsGoal) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const unit = goal.symbol ?? "";
  const amt = (v: string | null) => (v === null ? "—" : `${formatAmount(v)} ${unit}`);
  const e = evaluation;

  return (
    <div className="divide-y divide-border">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{goal.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {goal.kind === "reserve" ? "Reserve" : "Savings target"} · {unit} · started {goal.startDate}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Edit goal" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete goal"
            onClick={() => {
              if (window.confirm(`Delete "${goal.name}"? A deletion record is saved to memory. Earlier records cannot be erased and remain until they expire.`)) onDelete();
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {!e ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">Evaluating against the wallet balance…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3">
            <Figure
              label="Funded"
              value={amt(e.funded)}
              sub={
                e.fundingStatus === "partially_backed"
                  ? `of ${amt(e.earmarked)} earmarked`
                  : e.fundingStatus === "verified"
                    ? "backed by wallet balance"
                    : "not checked against wallet"
              }
            />
            <Figure label={goal.kind === "reserve" ? "Minimum" : "Target"} value={amt(e.target)} sub={`${e.progressPct}% funded`} />
            <Figure label="Remaining" value={amt(e.remaining)} />
            {goal.kind === "target" || goal.targetDate ? (
              <>
                <Figure
                  label="Needed per month"
                  value={amt(e.requiredMonthly)}
                  sub={e.daysRemaining === null ? undefined : e.daysRemaining >= 0 ? `${e.daysRemaining} days left` : `${-e.daysRemaining} days overdue`}
                />
                <Figure
                  label="Planned per month"
                  value={amt(e.plannedMonthly)}
                  sub={e.monthlyShortfall ? <span className="text-warning">{formatAmount(e.monthlyShortfall)} {unit} short</span> : undefined}
                />
                <Figure
                  label="Est. completion"
                  value={e.completed ? "Reached" : (e.projection.estimatedCompletionDate ?? "—")}
                  sub={
                    e.projection.meetsTargetDate === null
                      ? e.completed
                        ? undefined
                        : "no monthly plan"
                      : e.projection.meetsTargetDate
                        ? `by ${goal.targetDate ?? "—"}`
                        : `after ${goal.targetDate}`
                  }
                />
              </>
            ) : null}
          </dl>

          {goal.kind === "target" && (
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-subtle">Schedule</span>
              <span className={SCHEDULE_TEXT[e.schedule.status]}>
                {SCHEDULE_LABEL[e.schedule.status]}
                {e.schedule.expectedByNow !== null && e.schedule.status !== "completed" && (
                  <span className="num text-subtle"> · plan expects {formatAmount(e.schedule.expectedByNow)} {unit} today</span>
                )}
              </span>
            </div>
          )}

          <div className="pb-2">
            <GoalChart goal={goal} evaluation={e} />
          </div>

          {e.insights.length > 0 && (
            <section className="space-y-3 px-4 py-4">
              <h3 className="label-caps">Recommendations</h3>
              <ul className="space-y-3">
                {e.insights.map((i) => (
                  <li key={i.id} className="flex gap-2.5">
                    {i.level === "warning" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} aria-label="Warning" />
                    ) : (
                      <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" strokeWidth={1.75} aria-label="Info" />
                    )}
                    <div>
                      <div className="text-[13px] font-medium">{i.title}</div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{i.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="space-y-3 px-4 py-4">
        <h3 className="label-caps">Earmarked funds</h3>
        <AllocationForm goal={goal} onSave={onSave} />
        {goal.allocations.length === 0 ? (
          <p className="text-xs text-subtle">No funds earmarked yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-subtle">
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 text-right font-normal">Change</th>
                <th className="py-1 pl-3 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {[...goal.allocations]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="num py-1.5 text-muted-foreground">{a.date}</td>
                    <td className={cn("num py-1.5 text-right", a.delta.startsWith("-") ? "text-muted-foreground" : "text-foreground")}>
                      {a.delta.startsWith("-") ? `−${formatAmount(a.delta.slice(1))}` : `+${formatAmount(a.delta)}`} {unit}
                    </td>
                    <td className="py-1.5 pl-3 text-subtle">{a.note ?? ""}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {goal.notes && (
        <section className="px-4 py-4">
          <h3 className="label-caps">Notes</h3>
          <p className="mt-1.5 text-[13px] whitespace-pre-wrap text-muted-foreground">{goal.notes}</p>
        </section>
      )}

      {e && (
        <section className="px-4 py-4">
          <h3 className="label-caps">How this is calculated</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-subtle">
            {e.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
