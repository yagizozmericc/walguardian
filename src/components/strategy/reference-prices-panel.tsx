"use client";

import { useState } from "react";
import { Panel } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayUtc } from "@/lib/dates";
import { formatAmount, shortCoinType } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReferencePriceSchema, type StrategySettings, type ValuedHolding } from "@/modules/strategy/strategy.types";

export interface PriceRow {
  coinType: string;
  symbol: string | null;
  amount: string | null;
  state: ValuedHolding["state"] | "not_held";
  valueUsd: string | null;
}

const STATE_TEXT: Record<PriceRow["state"], string> = {
  priced: "Priced",
  missing_price: "Needs price",
  missing_decimals: "No decimals published",
  excluded: "Excluded",
  not_held: "Not held",
};

export function ReferencePricesPanel({
  rows,
  settings,
  onSave,
}: {
  rows: PriceRow[];
  settings: StrategySettings;
  onSave: (next: StrategySettings) => void;
}) {
  const initial = () => Object.fromEntries(settings.referencePrices.map((r) => [r.coinType, r.priceUsd]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saved = new Map(settings.referencePrices.map((r) => [r.coinType, r]));
  const dirty = rows.some((r) => (draft[r.coinType] ?? "") !== (saved.get(r.coinType)?.priceUsd ?? ""));

  const savePrices = () => {
    const nextErrors: Record<string, string> = {};
    const prices = [];
    for (const r of rows) {
      const value = (draft[r.coinType] ?? "").trim();
      if (!value) continue;
      const prev = saved.get(r.coinType);
      const candidate = { coinType: r.coinType, priceUsd: value, setOn: prev?.priceUsd === value ? prev.setOn : todayUtc() };
      const parsed = ReferencePriceSchema.safeParse(candidate);
      if (parsed.success) prices.push(parsed.data);
      else nextErrors[r.coinType] = parsed.error.issues[0]?.message ?? "Invalid price.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      const untouched = settings.referencePrices.filter((p) => !rows.some((r) => r.coinType === p.coinType));
      onSave({ ...settings, referencePrices: [...untouched, ...prices] });
    }
  };

  const toggleExcluded = (coinType: string) => {
    const excluded = settings.excluded.includes(coinType)
      ? settings.excluded.filter((c) => c !== coinType)
      : [...settings.excluded, coinType];
    onSave({ ...settings, excluded });
  };

  return (
    <Panel
      title="Reference prices"
      meta="Your assumptions in USD · not market prices"
      actions={
        <Button size="sm" variant={dirty ? "default" : "outline"} onClick={savePrices} disabled={!dirty}>
          Save prices
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-[150px]">Price (USD)</TableHead>
            <TableHead className="hidden text-right md:table-cell">Value</TableHead>
            <TableHead className="text-right">Analysis</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const excluded = settings.excluded.includes(r.coinType);
            const canPrice = r.state !== "missing_decimals";
            return (
              <TableRow key={r.coinType} className={cn(excluded && "opacity-60")}>
                <TableCell className="max-w-[220px]">
                  <div className="truncate font-medium">{r.symbol ?? "Unknown"}</div>
                  <div className="truncate font-mono text-[11px] text-subtle" title={r.coinType}>
                    {shortCoinType(r.coinType)}
                  </div>
                </TableCell>
                <TableCell className="num text-right">{r.amount ? formatAmount(r.amount) : r.state === "not_held" ? "0" : "—"}</TableCell>
                <TableCell>
                  {canPrice ? (
                    <>
                      <Input
                        aria-label={`Reference price for ${r.symbol ?? r.coinType}`}
                        inputMode="decimal"
                        className="num h-7 text-[13px]"
                        placeholder="—"
                        value={draft[r.coinType] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.coinType]: e.target.value }))}
                        disabled={excluded}
                      />
                      {errors[r.coinType] && <div className="mt-1 text-[11px] text-critical">{errors[r.coinType]}</div>}
                      {saved.get(r.coinType) && !errors[r.coinType] && (
                        <div className="mt-0.5 text-[11px] text-subtle">set {saved.get(r.coinType)!.setOn}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-subtle">Cannot be valued</span>
                  )}
                </TableCell>
                <TableCell className="num hidden text-right md:table-cell">
                  {r.valueUsd !== null ? `$${formatAmount(r.valueUsd, 2)}` : <span className="text-subtle">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  {r.state === "not_held" ? (
                    <span className="text-xs text-subtle">Used for purchases</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <span className={cn("text-xs", r.state === "priced" ? "text-muted-foreground" : r.state === "excluded" ? "text-subtle" : "text-warning")}>
                        {STATE_TEXT[excluded ? "excluded" : r.state]}
                      </span>
                      <Button variant="ghost" size="xs" onClick={() => toggleExcluded(r.coinType)}>
                        {excluded ? "Include" : "Exclude"}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="border-t border-border px-4 py-2.5 text-xs text-subtle">
        Testnet assets have no market price. Values and percentages on this page use only the prices you enter here. Excluding an asset removes it from the analysis and is shown in every result.
      </p>
    </Panel>
  );
}
