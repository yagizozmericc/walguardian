import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Code2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSigned, formatTimestamp, suiscanTxUrl } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";

const DIRECTION = {
  out: { label: "Sent", icon: ArrowUpRight },
  in: { label: "Received", icon: ArrowDownLeft },
  swap: { label: "Exchange", icon: ArrowLeftRight },
  none: { label: "Interaction", icon: Code2 },
} as const;

export function ActivityTable({ activity, network }: { activity: ActivityItem[]; network: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Time</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden lg:table-cell">Counterparty</TableHead>
          <TableHead className="hidden xl:table-cell">Move call</TableHead>
          <TableHead className="text-right">Transaction</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activity.map((a) => {
          const d = DIRECTION[a.direction];
          const Icon = d.icon;
          const call = a.moveCalls[0];
          return (
            <TableRow key={a.digest}>
              <TableCell className="num text-muted-foreground">{formatTimestamp(a.timestampMs)}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="size-3.5 text-subtle" strokeWidth={1.75} />
                  {d.label}
                  {a.success === false && <span className="text-xs text-critical">Failed</span>}
                </span>
              </TableCell>
              <TableCell className="num text-right">
                {a.transfers.length === 0 ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    {a.transfers.map((t) => (
                      <span
                        key={t.coinType}
                        className={cn(BigInt(t.rawAmount) > 0n && "text-positive")}
                        title={t.gasExcluded ? "Transferred amount; gas fee excluded." : undefined}
                      >
                        {t.amount !== null ? formatSigned(t.amount) : `${t.rawAmount} raw`}{" "}
                        <span className="text-muted-foreground">{t.symbol ?? "?"}</span>
                      </span>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                {a.counterparties.length === 0
                  ? "—"
                  : a.counterparties.slice(0, 2).map((c) => (
                      <div key={c} title={c}>
                        {shortAddress(c)}
                      </div>
                    ))}
                {a.counterparties.length > 2 && <div className="text-subtle">+{a.counterparties.length - 2} more</div>}
              </TableCell>
              <TableCell className="hidden max-w-[220px] truncate font-mono text-xs text-muted-foreground xl:table-cell">
                {call ? (
                  <span title={`${call.package}::${call.module}::${call.function}`}>
                    {call.module}::{call.function}
                    {a.moveCalls.length > 1 && <span className="text-subtle"> +{a.moveCalls.length - 1}</span>}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">
                <a
                  href={suiscanTxUrl(network, a.digest)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  title={a.digest}
                >
                  {a.digest.slice(0, 8)}…
                </a>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
