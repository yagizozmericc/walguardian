"use client";

import { Panel } from "@/components/common/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClassAllocation, StrategyEvaluation } from "@/modules/strategy/strategy.types";

const CLASS_LABEL = { native: "SUI", stablecoin: "Stablecoins", other: "Other assets" } as const;

function Dumbbell({ c, band }: { c: ClassAllocation; band: number }) {
  const cur = Number(c.currentPct);
  const tgt = c.targetPct === null ? null : Number(c.targetPct);
  const lo = tgt === null ? cur : Math.min(cur, tgt);
  const hi = tgt === null ? cur : Math.max(cur, tgt);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative h-5 w-full min-w-[160px] cursor-default" aria-label={`${CLASS_LABEL[c.assetClass]}: current ${c.currentPct}%${tgt !== null ? `, target ${c.targetPct}%` : ""}`}>
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          {tgt !== null && (
            <div
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-muted-foreground/25"
              style={{ left: `${Math.max(tgt - band, 0)}%`, width: `${Math.min(tgt + band, 100) - Math.max(tgt - band, 0)}%` }}
            />
          )}
          <div
            className={cn("absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full", c.outOfBand ? "bg-warning" : "bg-chart-1/50")}
            style={{ left: `${lo}%`, width: `${hi - lo}%` }}
          />
          {tgt !== null && (
            <div className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full border-2 border-muted-foreground bg-surface" style={{ left: `${tgt}%` }} />
          )}
          <div className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-surface" style={{ left: `${cur}%` }} />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span className="num">
          Current {c.currentPct}%{tgt !== null && ` · target ${c.targetPct}% · band ±${band}`}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function AllocationPanel({ evaluation, band }: { evaluation: StrategyEvaluation; band: number }) {
  const classes = evaluation.classes!;
  const hasTargets = classes.some((c) => c.targetPct !== null);
  return (
    <Panel
      title="Allocation"
      meta={`$${formatAmount(evaluation.totalUsd ?? "0", 2)} analysed at your reference prices`}
    >
      <div className="flex flex-wrap items-center gap-4 px-4 pt-3 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-1" /> Current</span>
        {hasTargets && (
          <>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-muted-foreground" /> Target</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-muted-foreground/25" /> Tolerance band</span>
          </>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Class</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Value</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right">Drift</TableHead>
            <TableHead className="hidden w-[34%] md:table-cell">0% – 100%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((c) => (
            <TableRow key={c.assetClass}>
              <TableCell className="font-medium">{CLASS_LABEL[c.assetClass]}</TableCell>
              <TableCell className="num hidden text-right sm:table-cell">${formatAmount(c.valueUsd, 2)}</TableCell>
              <TableCell className="num text-right">{c.currentPct}%</TableCell>
              <TableCell className="num text-right text-muted-foreground">{c.targetPct === null ? "—" : `${c.targetPct}%`}</TableCell>
              <TableCell className="num text-right">
                {c.driftPct === null ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <span className={c.outOfBand ? "text-warning" : "text-muted-foreground"}>
                    {c.driftPct.startsWith("-") ? `−${c.driftPct.slice(1)}` : `+${c.driftPct}`}
                    {c.outOfBand && <span className="ml-1 hidden text-[11px] sm:inline">outside band</span>}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Dumbbell c={c} band={band} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!hasTargets && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-subtle">Set target percentages to see drift and a rebalancing scenario.</p>
      )}
    </Panel>
  );
}
