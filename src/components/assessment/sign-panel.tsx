"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Panel } from "@/components/common/page";
import { ErrorState, type DisplayError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { formatAmount, formatSigned, formatTimestamp, shortCoinType, suiscanTxUrl } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { formatUnits } from "@/lib/units";
import { cn } from "@/lib/utils";
import { INSUFFICIENT_GAS_TITLE } from "@/modules/assessment/transfer.engine";
import type { ExecutionResult, GasSummary, PreparedTransfer, SimulatedBalanceChange } from "@/modules/execution/execution.types";
import { SUI_COIN_TYPE } from "@/modules/portfolio/assets";

export type ExecutionState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "broadcasting" }
  | { phase: "done"; result: ExecutionResult }
  | { phase: "error"; error: DisplayError };

const ROLE: Record<SimulatedBalanceChange["role"], string> = { sender: "You", recipient: "Recipient", other: "Other" };

function useAmount(p: PreparedTransfer) {
  return (c: { coinType: string; amount: string }) => {
    const known = c.coinType === p.assessment.asset.coinType ? { d: p.assessment.asset.decimals, s: p.assessment.asset.symbol } : c.coinType === SUI_COIN_TYPE ? { d: 9, s: "SUI" } : null;
    return known ? `${formatSigned(formatUnits(c.amount, known.d), 9)} ${known.s ?? ""}` : `${c.amount} base units ${shortCoinType(c.coinType)}`;
  };
}

const gasText = (g: GasSummary | null) => (g ? `${formatAmount(formatUnits(g.netMist, 9), 9)} SUI` : "not reported");

function Changes({ list, amount }: { list: SimulatedBalanceChange[]; amount: (c: SimulatedBalanceChange) => string }) {
  if (list.length === 0) return <p className="text-[13px] text-subtle">No balance changes reported.</p>;
  return (
    <table className="w-full text-[13px]">
      <tbody className="divide-y divide-border">
        {list.map((c, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-3 text-muted-foreground">{ROLE[c.role]}</td>
            <td className="py-1.5 pr-3 font-mono text-xs" title={c.address}>
              {shortAddress(c.address, 6)}
            </td>
            <td className={cn("num py-1.5 text-right", c.amount.startsWith("-") ? "" : "font-medium")}>{amount(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Node simulation, signing policy and the sign-and-send step for a transfer
 * Guardian built. The wallet is asked to sign only after the user reviews,
 * and warnings require an explicit acknowledgement.
 */
export function SignPanel({ p, walletName, state, onSign }: { p: PreparedTransfer; walletName: string; state: ExecutionState; onSign: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const amount = useAmount(p);
  const s = p.simulation;
  const busy = state.phase === "signing" || state.phase === "broadcasting";

  if (state.phase === "done") {
    const r = state.result;
    const ok = r.status === "success";
    return (
      <Panel title={ok ? "Sent" : "Executed but failed"} meta={`Broadcast through Tatum · ${formatTimestamp(Date.parse(r.executedAt))}`}>
        <div className="space-y-3 px-4 py-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", ok ? "bg-positive" : "bg-critical")} />
            <span className="font-medium">{ok ? "The network executed this transfer." : `The transaction failed onchain: ${r.error}. Gas was still charged.`}</span>
          </div>
          <div className="num flex flex-wrap justify-between gap-2 text-muted-foreground">
            <span>
              Digest <span className="font-mono text-foreground">{r.digest}</span>
            </span>
            <a href={suiscanTxUrl(r.source.network, r.digest)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              View on Suiscan <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="num text-muted-foreground">Gas paid {gasText(r.gas)}</div>
          <Changes list={r.balanceChanges} amount={amount} />
          <p className="text-xs text-subtle">Balances and Protect history update once Tatum indexes the transaction; refresh in a few seconds.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Sign and send" meta="Simulated by a Sui node through Tatum, before signing">
      <div className="space-y-4 px-4 py-3">
        {s ? (
          <div className="space-y-2">
            <div className="num flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", s.status === "success" && s.intent.matches ? "bg-positive" : "bg-critical")} />
                <span className="font-medium">{s.status === "success" ? (s.intent.matches ? "Simulation matches your request" : "Simulation differs from your request") : "Simulation failed"}</span>
              </span>
              <span className="text-muted-foreground">Gas {gasText(s.gas)}</span>
            </div>
            {s.error && <p className="text-[13px] text-critical">{s.error}</p>}
            {s.intent.issues.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-critical">
                {s.intent.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <Changes list={s.balanceChanges} amount={amount} />
            {p.assessment.verdict === "insufficient_gas" && s.status === "success" && (
              <p className="text-xs text-subtle">“{INSUFFICIENT_GAS_TITLE}” above is a historical estimate; this node simulation covers the actual gas.</p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No simulation: the transaction could not be built.</p>
        )}

        {!p.signing.allowed ? (
          <div className="rounded-md border border-critical/30 px-3 py-2 text-[13px]">
            <div className="font-medium">Signing is not available</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {p.signing.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {p.signing.requiresAcknowledgement && (
              <label className="flex gap-2.5 rounded-md border border-warning/40 px-3 py-2 text-[13px]">
                <input type="checkbox" className="mt-0.5 accent-current" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} disabled={busy} />
                <span>
                  <span className="font-medium">I reviewed these warnings and still want to send:</span>
                  <span className="text-muted-foreground"> {p.signing.reasons.join(" · ")}</span>
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onSign} disabled={busy || (p.signing.requiresAcknowledgement && !acknowledged)}>
                {state.phase === "signing" ? `Waiting for ${walletName}…` : state.phase === "broadcasting" ? "Broadcasting…" : `Sign in ${walletName}`}
              </Button>
              {p.transaction && (
                <span className="num text-xs text-subtle">
                  Digest <span className="font-mono">{shortAddress(p.transaction.digest, 6)}</span> · expires {formatTimestamp(Date.parse(p.transaction.expiresAt))}
                </span>
              )}
            </div>
            <p className="text-xs text-subtle">
              Your wallet shows the transaction before you approve it. Guardian broadcasts only these exact bytes; if the wallet returns anything else, nothing is sent. Guardian cannot stop transfers made outside this page.
            </p>
          </>
        )}
        {state.phase === "error" && <ErrorState error={state.error} />}
      </div>
    </Panel>
  );
}
