import { Activity, Archive, ArrowRightLeft, LayoutGrid, PanelRight, PiggyBank, ShieldCheck } from "lucide-react";
import { LogoMark, BRAND_NAME } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Dot, ProductFrame } from "../primitives";
import { SCENARIO as S } from "../scenario";

const NAV = [
  { label: "Overview", icon: LayoutGrid, active: true },
  { label: "Security", icon: ShieldCheck },
  { label: "Savings", icon: PiggyBank },
  { label: "Strategy", icon: Activity },
  { label: "Transfer check", icon: ArrowRightLeft },
  { label: "Financial memory", icon: Archive },
];

const ACTIVITY = [
  { dir: "Received", amount: "+40.00 SUI", party: "0x2d07…a913", time: "Oct 18, 09:41", tx: "8kQv…n3Fa" },
  { dir: "Sent", amount: "−60.00 SUI", party: "0x5e88…b04c", time: "Oct 16, 10:12", tx: "Ap9T…c1Ub" },
  { dir: "Sent", amount: "−12.50 SUI", party: S.knownRecipient, time: "Oct 12, 18:20", tx: "3HcZ…wp7R" },
  { dir: "Sent", amount: "−8.00 SUI", party: S.knownRecipient, time: "Sep 28, 11:05", tx: "Gd2m…7xLe" },
];

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{label}</div>
      <div className="num mt-1 truncate text-[17px] font-medium tracking-tight">{value}</div>
      <div className="truncate text-[10px] text-subtle">{sub}</div>
    </div>
  );
}

/** Static replica of the dashboard shell: Overview with the Copilot panel open. */
export function AppPreview() {
  return (
    <ProductFrame title={`${BRAND_NAME} · Overview`} className="text-left">
      <div className="flex md:h-[480px]">
        <aside className="hidden w-44 shrink-0 flex-col border-r border-border bg-ink/60 md:flex">
          <div className="flex h-10 items-center gap-2 border-b border-border px-3.5">
            <LogoMark className="size-3.5 text-brand" />
            <span className="text-[11.5px] font-semibold tracking-tight">{BRAND_NAME}</span>
          </div>
          <nav className="flex flex-col gap-px p-2" aria-hidden>
            {NAV.map(({ label, icon: Icon, active }) => (
              <span key={label} className={cn("flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-muted-foreground", active && "bg-accent font-medium text-foreground")}>
                <Icon className={cn("size-3.5 text-subtle", active && "text-brand")} strokeWidth={1.75} />
                {label}
              </span>
            ))}
          </nav>
          <div className="mt-auto space-y-1.5 border-t border-border px-3.5 py-3 text-[10px]">
            <div className="text-[9px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Data sources</div>
            {[
              ["Tatum · Sui Testnet", "Live", "bg-positive"],
              ["Memory", "Mock", "bg-warning"],
              ["Gemini", "Ready", "bg-subtle"],
            ].map(([l, s, c]) => (
              <div key={l} className="flex items-center justify-between text-muted-foreground">
                <span>{l}</span>
                <span className="flex items-center gap-1 text-subtle">
                  <Dot className={c} />
                  {s}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
            <div className="flex h-6 min-w-0 flex-1 items-center rounded-md border border-border bg-surface px-2 font-mono text-[10.5px] text-muted-foreground">
              {S.wallet}
            </div>
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9.5px] text-subtle">Sui Testnet</span>
            <span className="hidden items-center gap-1 rounded-md bg-accent px-2 py-1 text-[10.5px] sm:flex">
              <PanelRight className="size-3" />
              Copilot
            </span>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 space-y-3 overflow-hidden p-3.5 sm:p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[14px] font-semibold tracking-tight">Overview</div>
                  <div className="text-[10.5px] text-subtle">Tatum · checkpoint 291,804,112 · just now</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-surface px-3.5 py-3 lg:grid-cols-4">
                <Metric label="SUI balance" value={S.suiBalance} sub="Native coin" />
                <Metric label="Verified stablecoins" value={`${S.usdc} USDC`} sub="Registry-matched only" />
                <Metric label="Coin types" value="2" sub="Held by this address" />
                <Metric label="Last activity" value="Oct 18" sub="24 transactions loaded" />
              </div>
              <div className="rounded-lg border border-border bg-surface">
                <div className="flex items-baseline gap-2 border-b border-border px-3.5 py-2">
                  <span className="text-[11.5px] font-medium">Recent activity</span>
                  <span className="hidden truncate text-[10px] text-subtle sm:inline">Transactions affecting this address, newest first</span>
                </div>
                <ul className="divide-y divide-border">
                  {ACTIVITY.map((a) => (
                    <li key={a.time} className="num grid grid-cols-[64px_1fr_auto] items-center gap-2 px-3.5 py-2 text-[10.5px] sm:grid-cols-[96px_70px_1fr_1fr_auto]">
                      <span className="hidden text-subtle sm:block">{a.time}</span>
                      <span className="text-muted-foreground">{a.dir}</span>
                      <span className={cn("text-right font-medium sm:text-left", a.dir === "Received" && "text-positive")}>{a.amount}</span>
                      <span className="hidden font-mono text-subtle sm:block">{a.party}</span>
                      <span className="text-right font-mono text-subtle">{a.tx}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <aside className="hidden w-[268px] shrink-0 flex-col border-l border-border bg-surface lg:flex">
              <div className="flex h-9 items-center border-b border-border px-3.5 text-[11.5px] font-medium">Copilot</div>
              <div className="flex-1 space-y-3 overflow-hidden p-3.5">
                <div className="ml-6 rounded-lg bg-muted px-2.5 py-1.5 text-[11px]">How would this transfer affect my savings goals?</div>
                <p className="text-[11px] leading-relaxed">
                  Sending {S.transfer} SUI would take {S.reserve.name} below the minimum you set.
                </p>
                <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  <li>
                    <span className="mr-1 text-[8.5px] font-medium tracking-wide text-subtle uppercase">Calculated</span>
                    Backed funds fall from {S.reserve.minimum} to {S.reserve.fundedAfter} SUI. <Cite id="C2" />
                  </li>
                  <li>
                    <span className="mr-1 text-[8.5px] font-medium tracking-wide text-subtle uppercase">Memory</span>
                    On {S.day1} you chose to keep a minimum SUI reserve. <Cite id="M1" />
                  </li>
                </ul>
                <div className="text-[9.5px] text-subtle">AI-generated from the cited data. Verify before acting.</div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

export function Cite({ id }: { id: string }) {
  return <span className="rounded-sm border border-border px-1 align-middle font-mono text-[9px] text-subtle">{id}</span>;
}
