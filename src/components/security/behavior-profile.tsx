import { Panel } from "@/components/common/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatTimestamp, shortCoinType } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { formatUnits } from "@/lib/units";
import type { BehavioralBaseline } from "@/modules/security/security.types";
import { CONFIDENCE_LABEL } from "./labels";

const amt = (raw: string, decimals: number | null) => (decimals === null ? `${raw} raw` : formatAmount(formatUnits(raw, decimals)));

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="num mt-1 text-[15px] font-medium">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-subtle">{sub}</dd>}
    </div>
  );
}

export function BehaviorProfile({ baseline: b }: { baseline: BehavioralBaseline }) {
  const span =
    b.windowStartMs && b.windowEndMs ? `${formatTimestamp(b.windowStartMs)} – ${formatTimestamp(b.windowEndMs)}` : "—";
  return (
    <Panel title="Behavioral profile" meta={`Built from transactions sent by this address · ${span}`}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-border px-4 py-4 md:grid-cols-5">
        <Stat label="Sent" value={b.sentCount} sub="successful transactions" />
        <Stat label="Value transfers" value={b.outgoingTransferCount} sub="moved coins out" />
        <Stat label="Known recipients" value={b.recipients.length} />
        <Stat
          label="New-recipient rate"
          value={b.recipientNoveltyRate === null ? "—" : `${Math.round(b.recipientNoveltyRate * 100)}%`}
          sub={b.recipientNoveltyRate === null ? "too few transfers" : "of transfers"}
        />
        <Stat
          label="Sends per day"
          value={b.dailySentMean === null ? "—" : b.dailySentMean.toFixed(1)}
          sub={b.dailySentMean === null ? "window under 3 days" : `σ ${b.dailySentStdDev?.toFixed(1)}`}
        />
      </dl>

      <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div>
          <div className="px-4 pt-3 pb-1 label-caps">Outgoing amount distribution</div>
          {b.amountStats.length === 0 ? (
            <p className="px-4 pt-1 pb-4 text-[13px] text-muted-foreground">No outgoing value transfers in the analysed history.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">n</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.amountStats.map((s) => (
                  <TableRow key={s.coinType}>
                    <TableCell title={s.coinType}>{s.symbol ?? shortCoinType(s.coinType)}</TableCell>
                    <TableCell className="num text-right">{s.count}</TableCell>
                    <TableCell className="num text-right">{amt(s.median, s.decimals)}</TableCell>
                    <TableCell className="num text-right">{amt(s.p95, s.decimals)}</TableCell>
                    <TableCell className="num text-right">{amt(s.max, s.decimals)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="grid divide-y divide-border">
          <div>
            <div className="px-4 pt-3 pb-1 label-caps">Frequent recipients</div>
            {b.recipients.length === 0 ? (
              <p className="px-4 pt-1 pb-4 text-[13px] text-muted-foreground">None identified.</p>
            ) : (
              <ul className="px-4 pb-3">
                {b.recipients.slice(0, 5).map((r) => (
                  <li key={r.address} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="font-mono text-muted-foreground" title={r.address}>
                      {shortAddress(r.address, 6)}
                    </span>
                    <span className="num text-subtle">
                      {r.count}× · last {formatTimestamp(r.lastSeenMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="px-4 pt-3 pb-1 label-caps">Move packages used</div>
            {b.packages.length === 0 ? (
              <p className="px-4 pt-1 pb-4 text-[13px] text-muted-foreground">No non-framework packages called.</p>
            ) : (
              <ul className="px-4 pb-3">
                {b.packages.slice(0, 5).map((p) => (
                  <li key={p.packageId} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="min-w-0 truncate font-mono text-muted-foreground" title={p.packageId}>
                      {shortAddress(p.packageId, 6)} <span className="text-subtle">{p.modules.slice(0, 2).join(", ")}</span>
                    </span>
                    <span className="num shrink-0 text-subtle">{p.count} tx</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-2.5 text-xs text-subtle">
        Baseline confidence: {CONFIDENCE_LABEL[b.confidence]} (based on {b.outgoingTransferCount} value transfers)
      </div>
    </Panel>
  );
}
