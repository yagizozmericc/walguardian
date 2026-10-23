import { Panel } from "@/components/common/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount } from "@/lib/format";
import type { RebalanceScenario } from "@/modules/strategy/strategy.types";

const CLASS_LABEL = { native: "SUI", stablecoin: "Stablecoins", other: "Other assets" } as const;

export function ScenarioPanel({ scenario }: { scenario: RebalanceScenario }) {
  return (
    <Panel title="Rebalancing scenario" meta="Illustrative · not executed · not a recommendation">
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
