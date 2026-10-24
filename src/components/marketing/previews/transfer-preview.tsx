import { cn } from "@/lib/utils";
import { Dot, MiniPanel, ProductFrame } from "../primitives";
import { SCENARIO as S, TRANSFER_DISCLAIMER } from "../scenario";

function Row({ label, before, after, warn }: { label: string; before: string; after: string; warn?: boolean }) {
  return (
    <div className="num flex flex-wrap items-baseline justify-between gap-x-3 py-[3px] text-[11.5px]">
      <span className={cn("text-muted-foreground", warn && "text-warning")}>{label}</span>
      <span>
        {before} <span className="text-subtle">→</span> <span className="font-medium">{after}</span>
      </span>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 flex h-8 items-center rounded-md border border-input bg-surface px-2.5 text-[12px]", mono && "font-mono")}>{value}</div>
    </div>
  );
}

/** Static replica of the Transfer check result for the shared scenario. */
export function TransferPreview() {
  return (
    <ProductFrame title="Transfer check · simulation only" bodyClassName="grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <div className="space-y-3 border-b border-border p-4 lg:border-r lg:border-b-0">
        <div className="text-[13px] font-semibold tracking-tight">Transfer check</div>
        <Field label="Asset" value="SUI · balance 182.40" />
        <Field label="Amount" value={S.transfer} />
        <Field label="Recipient address" value={S.recipient} mono />
        <div className="num text-[10.5px] text-subtle">Estimated available ≈ 70.39 SUI after earmarks and a gas buffer</div>
        <div className="flex h-8 items-center justify-center rounded-md bg-foreground text-[12px] font-medium text-background">Check this transfer</div>
        <p className="text-[10.5px] leading-snug text-subtle">Nothing is signed or sent.</p>
      </div>

      <div className="min-w-0 space-y-3 p-3.5 sm:p-4">
        <div className="rounded-lg border border-critical/30 bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Dot className="size-2 bg-critical" />
            <span className="text-[14px] font-medium">Review carefully before sending</span>
          </div>
          <p className="num mt-1 text-[11.5px] text-muted-foreground">
            Simulated: {S.transfer} SUI to <span className="font-mono">{S.recipient}</span>. 2 confirmed facts, 2 historical patterns, 1 preference or decision conflict, 0 unknowns.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <MiniPanel title="Protect" meta="Pre-execution signals">
            <div className="space-y-1.5 px-3.5 py-2.5 text-[11.5px]">
              <div className="num flex items-baseline justify-between">
                <span className="text-muted-foreground">Score</span>
                <span>
                  <span className="text-[15px] font-medium">46</span>/100 · <span className="text-warning">medium</span>
                </span>
              </div>
              <p className="text-muted-foreground">Recipient not paid before</p>
              <p className="text-muted-foreground">Amount above historical range (2–18 SUI)</p>
              <p className="text-[10.5px] text-subtle">Recipient has recent on-chain activity. Activity is not evidence of safety.</p>
            </div>
          </MiniPanel>

          <MiniPanel title="Save" meta="Before → after (estimated)">
            <div className="px-3.5 py-2">
              <Row label="SUI balance" before={S.suiBalance} after={S.suiAfter} />
              <Row label="SUI incl. estimated gas" before={S.suiBalance} after={S.suiAfterWithGas} />
              <Row label={`${S.reserve.name} (below minimum)`} before="100%" after={`${S.reserve.pctAfter}%`} warn />
            </div>
          </MiniPanel>

          <MiniPanel title="Invest" meta="At your reference prices">
            <div className="px-3.5 py-2">
              <div className="num flex justify-between py-[3px] text-[11.5px]">
                <span className="text-muted-foreground">Transfer value</span>
                <span>$190.00</span>
              </div>
              <Row label="SUI (target 40%)" before="36%" after="21%" warn />
              <Row label="Stablecoins (target 60%)" before="64%" after="79%" />
            </div>
          </MiniPanel>

          <MiniPanel title="Memory" meta="Your past notes and decisions">
            <ul className="divide-y divide-border">
              <li className="px-3.5 py-2 text-[11.5px]">
                <span className="text-muted-foreground">&ldquo;I prefer to keep a minimum SUI reserve.&rdquo;</span>{" "}
                <span className="text-[10px] text-subtle">your note · {S.day1Iso}</span>
              </li>
              <li className="px-3.5 py-2 text-[11.5px]">
                <span className="text-muted-foreground">You rejected &ldquo;Rebalance toward 50% SUI&rdquo;: &ldquo;Too much volatility for now.&rdquo;</span>{" "}
                <span className="text-[10px] text-subtle">your decision · 2026-10-09</span>
              </li>
            </ul>
          </MiniPanel>
        </div>

        <p className="text-[10.5px] leading-snug text-subtle">{TRANSFER_DISCLAIMER}</p>
      </div>
    </ProductFrame>
  );
}
