"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Panel } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopilot } from "@/components/copilot/copilot-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount } from "@/lib/format";
import type { RebalanceScenario } from "@/modules/strategy/strategy.types";

const CLASS_LABEL = { native: "SUI", stablecoin: "Stablecoins", other: "Other assets" } as const;

export interface PastDecision {
  decision: "accepted" | "rejected";
  reason: string | null;
  createdAt: string;
  memoryId: string;
}

export function ScenarioPanel({
  scenario,
  pastDecisions = [],
  deciding = false,
  onDecide,
}: {
  scenario: RebalanceScenario;
  pastDecisions?: PastDecision[];
  deciding?: boolean;
  onDecide?: (decision: "accepted" | "rejected", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const copilot = useCopilot();
  return (
    <Panel
      title="Rebalancing scenario"
      meta="Illustrative · not executed · not a recommendation"
      actions={
        <Button variant="ghost" size="xs" onClick={() => copilot.ask("Explain this rebalancing scenario and how it fits my preferences and past decisions.")}>
          Ask the copilot
        </Button>
      }
    >
      {pastDecisions.length > 0 && (
        <div className="flex gap-2.5 border-b border-border bg-muted/30 px-4 py-3">
          <History className="mt-0.5 size-3.5 shrink-0 text-subtle" strokeWidth={1.75} aria-hidden />
          <div className="space-y-1 text-[13px]">
            <div className="font-medium">From your memory</div>
            {pastDecisions.slice(0, 3).map((d) => (
              <p key={d.memoryId} className="text-muted-foreground">
                You {d.decision} this kind of change on {d.createdAt.slice(0, 10)}
                {d.reason ? <>: &ldquo;{d.reason}&rdquo;</> : "."}
              </p>
            ))}
          </div>
        </div>
      )}
      {scenario.trades.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">The current allocation already matches your targets; no changes are needed.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Action</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenario.trades.map((t, i) => (
              <TableRow key={`${t.side}-${t.coinType ?? t.assetClass}-${i}`}>
                <TableCell className="text-muted-foreground">{t.side === "sell" ? "Reduce" : "Increase"}</TableCell>
                <TableCell>
                  {t.symbol ?? <span className="text-subtle">Unspecified</span>}
                  {t.symbol !== CLASS_LABEL[t.assetClass] && <span className="ml-1.5 text-xs text-subtle">{CLASS_LABEL[t.assetClass]}</span>}
                </TableCell>
                <TableCell className="num text-right">
                  {t.amount !== null ? `${t.side === "sell" ? "−" : "+"}${formatAmount(t.amount)}` : <span className="text-subtle">—</span>}
                </TableCell>
                <TableCell className="num text-right">${formatAmount(t.valueUsd, 2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {onDecide && scenario.trades.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <span className="text-xs text-subtle">Record your decision</span>
          <Input
            aria-label="Reason (optional)"
            placeholder="Reason (optional, no personal data)"
            className="h-8 max-w-xs flex-1 text-[13px]"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" disabled={deciding} onClick={() => { onDecide("accepted", reason.trim()); setReason(""); }}>
            Accept
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={deciding} onClick={() => { onDecide("rejected", reason.trim()); setReason(""); }}>
            Reject
          </Button>
        </form>
      )}

      <div className="grid gap-4 border-t border-border px-4 py-4 md:grid-cols-2">
        <div>
          <h3 className="label-caps">After the scenario</h3>
          <dl className="num mt-2 space-y-1 text-[13px]">
            {(Object.keys(CLASS_LABEL) as (keyof typeof CLASS_LABEL)[]).map((c) => (
              <div key={c} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{CLASS_LABEL[c]}</dt>
                <dd>{scenario.resultingPct[c]}%</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-subtle">
            {scenario.reachesTargets ? "Reaches your targets." : "Does not fully reach your targets because of the constraints below."}
          </p>
        </div>
        <div className="space-y-3">
          {scenario.constraintsApplied.length > 0 && (
            <div>
              <h3 className="label-caps">Constraints applied</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-warning">
                {scenario.constraintsApplied.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="label-caps">Assumptions</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-subtle">
              {scenario.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
