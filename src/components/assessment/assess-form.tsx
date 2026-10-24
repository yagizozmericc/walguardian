"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/components/common/use-api-resource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmount, shortCoinType } from "@/lib/format";
import { SuiAddressSchema } from "@/lib/sui-address";
import type { SpendableBreakdown } from "@/modules/assessment/transfer.types";

export interface AssetOption {
  coinType: string;
  symbol: string | null;
  balance: string | null;
}

export interface TransferInput {
  recipient: string;
  coinType: string;
  amount: string;
}

export function AssessForm({
  address,
  assets,
  pending,
  onSubmit,
}: {
  address: string;
  assets: AssetOption[];
  pending: boolean;
  onSubmit: (input: TransferInput) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [coinType, setCoinType] = useState(assets[0]?.coinType ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [spendable, setSpendable] = useState<{ coinType: string; value: SpendableBreakdown | null; failed: boolean } | null>(null);
  const selected = assets.find((a) => a.coinType === coinType);

  useEffect(() => {
    if (!coinType) return;
    const ac = new AbortController();
    fetchJson<SpendableBreakdown>("/api/assessments/spendable", ac.signal, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, coinType }),
    })
      .then((value) => setSpendable({ coinType, value, failed: false }))
      .catch(() => !ac.signal.aborted && setSpendable({ coinType, value: null, failed: true }));
    return () => ac.abort();
  }, [address, coinType]);

  const s = spendable?.coinType === coinType ? spendable : null;
  const unit = selected?.symbol ?? "";

  return (
    <form
      className="space-y-4 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = SuiAddressSchema.safeParse(recipient);
        if (!r.success) return setError(`Recipient: ${r.error.issues[0]?.message}`);
        if (!/^\d+(\.\d+)?$/.test(amount.trim()) || /^0+(\.0+)?$/.test(amount.trim())) return setError("Enter an amount greater than zero.");
        setError(null);
        onSubmit({ recipient: r.data, coinType, amount: amount.trim() });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="recipient">Recipient address</Label>
        <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <Label>Asset</Label>
          <Select value={coinType} onValueChange={(v) => { setCoinType(v); setAmount(""); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Asset" />
            </SelectTrigger>
            <SelectContent>
              {assets.map((a) => (
                <SelectItem key={a.coinType} value={a.coinType}>
                  {a.symbol ?? shortCoinType(a.coinType)}
                  <span className="text-xs text-muted-foreground">{a.balance !== null ? formatAmount(a.balance) : "not held"}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <div className="flex gap-2">
            <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="num" />
            <Button
              type="button"
              variant="outline"
              disabled={!s?.value}
              onClick={() => s?.value && setAmount(s.value.estimatedAvailable)}
              title="Fill in the conservative estimated available amount"
            >
              Max
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border px-3 py-2 text-xs">
        {s?.value ? (
          <>
            <div className="num flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">
                Total balance <span className="text-foreground">{formatAmount(s.value.totalBalance, 6)} {unit}</span>
              </span>
              <span className="text-muted-foreground">
                Estimated available <span className="font-medium text-foreground">{formatAmount(s.value.estimatedAvailable, 6)} {unit}</span>
              </span>
            </div>
            {s.value.notes.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-subtle">
                {s.value.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        ) : s?.failed ? (
          <span className="text-subtle">Estimated available amount could not be calculated.</span>
        ) : (
          <span className="text-subtle">Calculating estimated available amount…</span>
        )}
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
      <Button type="submit" disabled={pending || !coinType}>
        {pending ? "Checking…" : "Check this transfer"}
      </Button>
    </form>
  );
}
