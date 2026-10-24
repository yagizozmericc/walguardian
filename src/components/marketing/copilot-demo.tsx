"use client";

import { useId, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENARIO as S } from "./scenario";

type Basis = "Onchain" | "Calculated" | "Your setting" | "Memory";
interface Citation {
  id: string;
  source: string;
}
interface Exchange {
  q: string;
  answer: string;
  points: { basis: Basis; text: string; cite: Citation }[];
  limitation?: string;
}

/** Illustrative answers in the shape the real copilot returns (basis + citation per claim). */
const EXCHANGES: Exchange[] = [
  {
    q: "Why was this transaction flagged?",
    answer: "The 60 SUI transfer on Oct 16 scored 46/100 (medium) because it differs from this wallet's own history. That is a deviation, not evidence of fraud.",
    points: [
      { basis: "Onchain", text: "This wallet had not sent funds to 0x5e88…b04c before.", cite: { id: "O3", source: "Tatum · Sui Testnet transaction history" } },
      { basis: "Calculated", text: "60 SUI is above the wallet's historical range of 2–18 SUI per transfer.", cite: { id: "C1", source: "Protect · behavioral baseline" } },
      { basis: "Memory", text: "You have not reviewed this recipient yet.", cite: { id: "M2", source: "Financial memory · security reviews" } },
    ],
  },
  {
    q: "How would this transfer affect my savings goals?",
    answer: `Sending ${S.transfer} SUI would take ${S.reserve.name} below the minimum you set. ${S.target.name} would be unaffected.`,
    points: [
      { basis: "Calculated", text: `Backed funds for ${S.reserve.name} would fall from ${S.reserve.minimum}.00 to ${S.reserve.fundedAfter} SUI (100% → ${S.reserve.pctAfter}%).`, cite: { id: "C2", source: "Save · transfer simulation" } },
      { basis: "Your setting", text: `${S.reserve.name} is a reserve with a ${S.reserve.minimum} SUI minimum.`, cite: { id: "P1", source: "Savings goals" } },
      { basis: "Memory", text: `On ${S.day1} you said: "I prefer to keep a minimum SUI reserve."`, cite: { id: "M1", source: `Financial memory · your note · ${S.day1Iso}` } },
    ],
  },
  {
    q: "Am I drifting away from my target allocation?",
    answer: "Slightly. SUI is below its target and stablecoins are above, but both remain inside the drift band you chose.",
    points: [
      { basis: "Calculated", text: "SUI is 36.3% of the portfolio against a 40% target (−3.7 pp).", cite: { id: "C3", source: "Invest · allocation engine" } },
      { basis: "Your setting", text: `Your drift band is ±5 pp, using a SUI reference price of ${S.referencePrice}.`, cite: { id: "P2", source: "Investment preferences" } },
      { basis: "Memory", text: 'On Oct 9 you rejected "Rebalance toward 50% SUI": "Too much volatility for now."', cite: { id: "M3", source: "Financial memory · investment decision · 2026-10-09" } },
    ],
    limitation: "Values use your reference prices. Testnet assets have no market price.",
  },
  {
    q: "What did I decide about this recipient last time?",
    answer: `You reviewed a transfer to ${S.knownRecipient} and marked it as expected.`,
    points: [
      { basis: "Memory", text: 'On Oct 12 you marked the 12.50 SUI transfer as expected: "Monthly rent split."', cite: { id: "M4", source: "Financial memory · security review · 2026-10-12" } },
      { basis: "Onchain", text: `This wallet has paid ${S.knownRecipient} twice, most recently on Oct 12.`, cite: { id: "O2", source: "Tatum · Sui Testnet transaction history" } },
    ],
    limitation: "Your earlier review personalizes scoring. It never clears critical signals.",
  },
];

function Cite({ c }: { c: Citation }) {
  return (
    <span
      tabIndex={0}
      className="group/cite relative inline-block cursor-default rounded-sm border border-border px-1 align-middle font-mono text-[10px] text-subtle outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {c.id}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2 py-1 font-sans text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover/cite:opacity-100 group-focus-visible/cite:opacity-100"
      >
        {c.source}
      </span>
    </span>
  );
}

export function CopilotDemo() {
  const [active, setActive] = useState(1);
  const base = useId();
  const ex = EXCHANGES[active];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <div role="tablist" aria-label="Example questions" aria-orientation="vertical" className="flex flex-col gap-2">
        {EXCHANGES.map((e, i) => (
          <button
            key={e.q}
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(ev) => {
              const next = ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? -1 : 0;
              if (!next) return;
              ev.preventDefault();
              const n = (active + next + EXCHANGES.length) % EXCHANGES.length;
              setActive(n);
              document.getElementById(`${base}-tab-${n}`)?.focus();
            }}
            className={cn(
              "group flex items-center justify-between gap-3 rounded-lg border px-4 py-3.5 text-left text-[14.5px] transition-colors",
              i === active ? "border-brand/35 bg-surface text-foreground" : "border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground",
            )}
          >
            <span>&ldquo;{e.q}&rdquo;</span>
            <span className={cn("h-px w-4 shrink-0 bg-current transition-all", i === active ? "w-6 text-brand" : "opacity-40")} aria-hidden />
          </button>
        ))}
      </div>

      <div className="mk-frame overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex h-10 items-center justify-between border-b border-border px-4">
          <span className="text-[12.5px] font-medium">Copilot</span>
          <span className="flex items-center gap-3">
            <span className="rounded-sm border border-border px-1.5 py-px font-mono text-[9.5px] tracking-wide text-subtle uppercase">Illustrative</span>
            <X className="size-3.5 text-subtle" aria-hidden />
          </span>
        </div>
        <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${active}`} aria-live="polite" className="min-h-[340px] space-y-4 px-4 py-5 sm:px-5">
          <div key={`q-${active}`} className="mk-enter ml-10 rounded-lg bg-muted px-3 py-2 text-[13.5px]">
            {ex.q}
          </div>
          <div key={`a-${active}`} className="mk-enter space-y-3" style={{ "--mk-delay": "120ms" } as React.CSSProperties}>
            <p className="text-[13.5px] leading-relaxed">{ex.answer}</p>
            <ul className="space-y-2">
              {ex.points.map((p) => (
                <li key={p.cite.id} className="text-[13px] leading-relaxed text-muted-foreground">
                  <span className="mr-1.5 text-[10px] font-medium tracking-wide text-subtle uppercase">{p.basis}</span>
                  {p.text} <Cite c={p.cite} />
                </li>
              ))}
            </ul>
            {ex.limitation && <p className="text-[12px] text-subtle">{ex.limitation}</p>}
            <p className="text-[11px] text-subtle">AI-generated with {S.model} from the cited data. Verify before acting.</p>
          </div>
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-[12.5px] text-subtle">
            Ask about this wallet…
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground/10" aria-hidden>
              <ArrowUp className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
