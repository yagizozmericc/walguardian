"use client";

import { useState } from "react";
import { Panel } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ASSET_CLASSES, StrategySettingsSchema, type StrategySettings } from "@/modules/strategy/strategy.types";

const CLASS_LABEL = { native: "SUI", stablecoin: "Stablecoins", other: "Other assets" } as const;
const NONE = "__none";

export function TargetsPanel({ settings, onSave }: { settings: StrategySettings; onSave: (next: StrategySettings) => void }) {
  const [targets, setTargets] = useState({
    native: settings.targets?.native ?? "",
    stablecoin: settings.targets?.stablecoin ?? "",
    other: settings.targets?.other ?? "",
  });
  const [band, setBand] = useState(settings.driftBandPct);
  const [minStable, setMinStable] = useState(settings.minStablecoinReserveUsd ?? "");
  const [gas, setGas] = useState(settings.gasReserveSui ?? "");
  const [risk, setRisk] = useState(settings.riskTolerance ?? NONE);
  const [horizon, setHorizon] = useState(settings.horizon ?? NONE);
  const [errors, setErrors] = useState<string[]>([]);

  const anyTarget = ASSET_CLASSES.some((c) => targets[c].trim() !== "");
  const sum = ASSET_CLASSES.reduce((s, c) => s + Math.round((Number(targets[c]) || 0) * 100), 0) / 100;

  const save = () => {
    const next = {
      ...settings,
      targets: anyTarget
        ? { native: targets.native.trim() || "0", stablecoin: targets.stablecoin.trim() || "0", other: targets.other.trim() || "0" }
        : null,
      driftBandPct: band.trim(),
      minStablecoinReserveUsd: minStable.trim() || null,
      gasReserveSui: gas.trim() || null,
      riskTolerance: risk === NONE ? null : (risk as StrategySettings["riskTolerance"]),
      horizon: horizon === NONE ? null : (horizon as StrategySettings["horizon"]),
    };
    const parsed = StrategySettingsSchema.safeParse(next);
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
      return;
    }
    setErrors([]);
    onSave(parsed.data);
  };

  return (
    <Panel title="Targets and constraints" meta="Set by you; used only for the calculations on this page">
      <form
        className="space-y-5 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="label-caps">Target allocation</legend>
          <div className="grid grid-cols-3 gap-3">
            {ASSET_CLASSES.map((c) => (
              <div key={c} className="space-y-1.5">
                <Label htmlFor={`target-${c}`} className="text-xs text-muted-foreground">
                  {CLASS_LABEL[c]} %
                </Label>
                <Input
                  id={`target-${c}`}
                  inputMode="decimal"
                  className="num h-8"
                  placeholder="—"
                  value={targets[c]}
                  onChange={(e) => setTargets((t) => ({ ...t, [c]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className={cn("num text-xs", anyTarget && sum !== 100 ? "text-warning" : "text-subtle")}>
            {anyTarget ? `Total ${sum.toFixed(2)}%${sum === 100 ? "" : " — must equal 100%"}` : "No targets set: only the current allocation is shown."}
          </p>
        </fieldset>

        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="band" className="text-xs text-muted-foreground">Drift band (± points)</Label>
            <Input id="band" inputMode="decimal" className="num h-8" value={band} onChange={(e) => setBand(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="min-stable" className="text-xs text-muted-foreground">Min. stablecoin reserve (USD)</Label>
            <Input id="min-stable" inputMode="decimal" className="num h-8" placeholder="none" value={minStable} onChange={(e) => setMinStable(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gas" className="text-xs text-muted-foreground">SUI kept for gas</Label>
            <Input id="gas" inputMode="decimal" className="num h-8" placeholder="none" value={gas} onChange={(e) => setGas(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Risk tolerance</Label>
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Investment horizon</Label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                <SelectItem value="short">Under 1 year</SelectItem>
                <SelectItem value="medium">1–5 years</SelectItem>
                <SelectItem value="long">Over 5 years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-subtle">
          Risk tolerance and horizon are recorded as context; they do not change any number on this page.
        </p>

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-md border border-critical/30 bg-critical-muted px-3 py-2 text-xs text-critical" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Button type="submit" size="sm">Save targets and constraints</Button>
      </form>
    </Panel>
  );
}
