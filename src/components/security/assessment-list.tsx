"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatTimestamp } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { cn } from "@/lib/utils";
import type { AssessedTransaction } from "@/modules/security/security.types";
import { RULE_LABEL, SEVERITY_BAR, SEVERITY_LABEL, SEVERITY_TEXT } from "./labels";

function outflowText(a: AssessedTransaction): string {
  if (a.outflows.length === 0) return "—";
  return a.outflows
    .map((o) => `${o.amount !== null ? formatAmount(o.amount) : `${o.rawAmount} raw`} ${o.symbol ?? "?"}`)
    .join(", ");
}

export function AssessmentList({
  items,
  selected,
  onSelect,
}: {
  items: AssessedTransaction[];
  selected: string | null;
  onSelect: (digest: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[88px]">Score</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-right">Outflow</TableHead>
          <TableHead className="hidden md:table-cell">Recipient</TableHead>
          <TableHead>Signals</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((a) => {
          const { score, severity, signals } = a.assessment;
          const isSelected = a.digest === selected;
          return (
            <TableRow
              key={a.digest}
              data-state={isSelected ? "selected" : undefined}
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onSelect(a.digest)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(a.digest);
                }
              }}
              className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={cn("h-4 w-0.5 rounded-full", SEVERITY_BAR[severity])} aria-hidden />
                  <span className="num w-6 text-right font-medium">{score}</span>
                  <span className={cn("text-xs", SEVERITY_TEXT[severity])}>{SEVERITY_LABEL[severity]}</span>
                </div>
              </TableCell>
              <TableCell className="num text-muted-foreground">{formatTimestamp(a.timestampMs)}</TableCell>
              <TableCell className="num text-right">{outflowText(a)}</TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {a.recipients[0] ? shortAddress(a.recipients[0]) : a.moveCalls[0] ? `${a.moveCalls[0].module}::${a.moveCalls[0].function}` : "—"}
                {a.recipients.length > 1 && <span className="text-subtle"> +{a.recipients.length - 1}</span>}
              </TableCell>
              <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                {a.review && (
                  <span className={cn("mr-1.5", a.review.remainsFlagged ? "text-critical" : "text-foreground")}>
                    {a.review.verdict === "expected" ? "Reviewed: expected" : a.review.verdict === "suspicious" ? "Reviewed: suspicious" : "Reviewed: unsure"}
                    {a.review.remainsFlagged ? " (still flagged)" : ""} ·
                  </span>
                )}
                {signals.length === 0 ? (
                  <span className="text-subtle">—</span>
                ) : (
                  signals.map((s) => (s.critical ? `${RULE_LABEL[s.rule]} (critical)` : RULE_LABEL[s.rule])).join(" · ")
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
