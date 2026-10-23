import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, shortCoinType } from "@/lib/format";
import type { Holding } from "@/modules/portfolio/portfolio.types";

const CLASS_LABEL: Record<Holding["assetClass"], string> = {
  native: "Native",
  stablecoin: "Stablecoin",
  other: "Unclassified",
};

export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Asset</TableHead>
          <TableHead>Classification</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="hidden text-right md:table-cell">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((h) => (
          <TableRow key={h.coinType}>
            <TableCell className="max-w-[320px]">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-medium">{h.symbol ?? "Unknown"}</span>
                <span className="truncate text-xs text-muted-foreground">{h.name}</span>
              </div>
              <div className="truncate font-mono text-[11px] text-subtle" title={h.coinType}>
                {shortCoinType(h.coinType)}
              </div>
            </TableCell>
            <TableCell>
              {h.classificationReference ? (
                <Tooltip>
                  <TooltipTrigger className="cursor-default text-muted-foreground underline decoration-dotted decoration-subtle underline-offset-4">
                    {CLASS_LABEL[h.assetClass]}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{h.classificationReference}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-subtle" title="Not in the verified asset registry; not treated as a stablecoin.">
                  {CLASS_LABEL[h.assetClass]}
                </span>
              )}
            </TableCell>
            <TableCell className="num text-right">
              {h.amount !== null ? (
                <span title={`${h.amount} ${h.symbol ?? ""}`}>{formatAmount(h.amount)}</span>
              ) : (
                <span className="text-subtle" title="Coin decimals unavailable; showing raw units.">
                  {h.rawBalance} raw
                </span>
              )}
            </TableCell>
            <TableCell className="hidden text-right text-subtle md:table-cell">Unavailable</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
