import { cn } from "@/lib/utils";
import { Dot, MiniPanel, ProductFrame } from "../primitives";
import { SCENARIO as S } from "../scenario";

/* ---- Protect: Security Center -------------------------------------------- */

const ASSESSMENTS = [
  { time: "Oct 16, 10:12", amount: "60.00 SUI", score: 46, sev: "Medium", bar: "bg-warning", text: "text-warning", signals: ["Amount", "New recipient"], active: true },
  { time: "Oct 12, 18:20", amount: "12.50 SUI", score: 8, sev: "Low", bar: "bg-muted-foreground/60", text: "text-muted-foreground", signals: ["Frequency"] },
  { time: "Sep 28, 11:05", amount: "8.00 SUI", score: 0, sev: "None", bar: "bg-border", text: "text-subtle", signals: [] },
];

export function SecurityPreview() {
  return (
    <ProductFrame title="Security Center" bodyClassName="space-y-3 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] font-medium">
          <Dot className="size-2 bg-warning" />
          Review recommended
        </span>
        <span className="num text-[10.5px] text-subtle">24 transactions analysed · confidence medium</span>
      </div>

      <MiniPanel title="Assessments" meta="Sent transactions scored against this wallet's own history">
        <ul className="divide-y divide-border">
          {ASSESSMENTS.map((a) => (
            <li key={a.time} className={cn("num grid grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-2.5 text-[11px] sm:grid-cols-[100px_1fr_auto]", a.active && "bg-accent/60")}>
              <span className="hidden text-subtle sm:block">{a.time}</span>
              <span className="min-w-0">
                <span className="font-medium">{a.amount}</span>
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {a.signals.map((s) => (
                    <span key={s} className="rounded-sm border border-border px-1 text-[9.5px] text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", a.bar)} style={{ width: `${Math.max(a.score, 3)}%` }} />
                </span>
                <span className={cn("w-[72px] text-right whitespace-nowrap", a.text)}>
                  {a.score} · {a.sev}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </MiniPanel>

      <MiniPanel title="Signals" meta="Transfer to 0x5e88…b04c · Oct 16">
        <ul className="space-y-2.5 px-3.5 py-3 text-[11px]">
          <li>
            <div className="font-medium">Amount above historical range</div>
            <p className="mt-0.5 text-muted-foreground">60 SUI is above this wallet&apos;s typical sends of 2–18 SUI.</p>
          </li>
          <li>
            <div className="font-medium">Recipient not seen before</div>
            <p className="mt-0.5 text-muted-foreground">No earlier transfers from this wallet to this address.</p>
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3.5 py-2.5">
          <span className="mr-1 text-[10.5px] text-subtle">Was this expected?</span>
          {["Expected activity", "Suspicious", "Not sure"].map((l) => (
            <span key={l} className="rounded-md border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      </MiniPanel>
    </ProductFrame>
  );
}

/* ---- Save: savings goals ------------------------------------------------- */

function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SavingsPreview() {
  return (
    <ProductFrame title="Savings" bodyClassName="space-y-3 p-3.5 sm:p-4">
      <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
        <div className="flex items-baseline justify-between text-[10px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          <span>SUI balance · {S.suiBalance}</span>
          <span className="num normal-case tracking-normal text-subtle">checked against live balance</span>
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-brand" style={{ width: "27.4%" }} />
          <div className="h-full bg-brand/45" style={{ width: "34%" }} />
        </div>
        <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Dot className="bg-brand" /> Reserve 50.00
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-brand/45" /> Earmarked 62.00
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-muted-foreground/40" /> Unallocated 70.40
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniPanel title={S.reserve.name} meta="Reserve · SUI">
          <div className="space-y-2.5 px-3.5 py-3">
            <div className="num flex items-baseline justify-between">
              <span className="text-[18px] font-medium tracking-tight">50.00</span>
              <span className="text-[10.5px] text-positive">Completed</span>
            </div>
            <Bar pct={100} className="bg-brand" />
            <div className="num grid grid-cols-2 gap-2 text-[10.5px]">
              <div>
                <div className="text-subtle">Minimum</div>
                <div>{S.reserve.minimum}.00 SUI</div>
              </div>
              <div>
                <div className="text-subtle">Funded</div>
                <div>100%</div>
              </div>
            </div>
          </div>
        </MiniPanel>

        <MiniPanel title={S.target.name} meta="Savings target · SUI">
          <div className="space-y-2.5 px-3.5 py-3">
            <div className="num flex items-baseline justify-between">
              <span className="text-[18px] font-medium tracking-tight">
                {S.target.funded} <span className="text-[11px] text-subtle">/ {S.target.target}.00</span>
              </span>
              <span className="text-[10.5px]">On track</span>
            </div>
            <Bar pct={S.target.pct} className="bg-brand/70" />
            <div className="num grid grid-cols-2 gap-2 text-[10.5px]">
              <div>
                <div className="text-subtle">Needed per month</div>
                <div>19.33 SUI</div>
              </div>
              <div>
                <div className="text-subtle">Est. completion</div>
                <div>2027-01-31</div>
              </div>
            </div>
          </div>
        </MiniPanel>
      </div>
    </ProductFrame>
  );
}

/* ---- Invest: allocation & drift ------------------------------------------ */

const ALLOC = [
  { label: "SUI", current: 36.3, target: 40, drift: "−3.7 pp", tone: "bg-brand" },
  { label: "Stablecoins", current: 63.7, target: 60, drift: "+3.7 pp", tone: "bg-electric" },
  { label: "Other assets", current: 0, target: 0, drift: "0.0 pp", tone: "bg-muted-foreground/50" },
];

export function StrategyPreview() {
  return (
    <ProductFrame title="Investment strategy" bodyClassName="space-y-3 p-3.5 sm:p-4">
      <MiniPanel title="Allocation" meta={`At your reference prices · SUI ${S.referencePrice}`}>
        <ul className="space-y-3.5 px-3.5 py-3.5">
          {ALLOC.map((a) => (
            <li key={a.label} className="num text-[11px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground">
                  {a.current.toFixed(1)}% <span className="text-subtle">· target {a.target}% · {a.drift}</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-muted">
                <div className={cn("h-full rounded-full", a.tone)} style={{ width: `${a.current}%` }} />
                {a.target > 0 && <div className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: `${a.target}%` }} aria-hidden />}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3.5 py-2 text-[10.5px] text-subtle">Drift band ±5 pp · within band</div>
      </MiniPanel>

      <MiniPanel title="Rebalancing scenario" meta="Illustrative · not executed · not a recommendation">
        <div className="num divide-y divide-border text-[11px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3.5 py-2">
            <span>SUI</span>
            <span className="text-muted-foreground">Increase</span>
            <span className="text-right whitespace-nowrap">≈ 18.56 SUI</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3.5 py-2">
            <span>Stablecoins</span>
            <span className="text-muted-foreground">Reduce</span>
            <span className="text-right whitespace-nowrap">≈ 37.12 USDC</span>
          </div>
        </div>
      </MiniPanel>
    </ProductFrame>
  );
}
