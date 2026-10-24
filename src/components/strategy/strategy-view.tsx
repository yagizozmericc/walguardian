"use client";

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { usePostResource } from "@/components/common/use-post-resource";
import { useWatchAddress } from "@/components/providers/watch-context";
import { MemoryBanner } from "@/components/memory/memory-banner";
import { useMemoryGoals, useMemoryStrategy, usePostMemory } from "@/components/memory/use-memory";
import { useApiResource } from "@/components/common/use-api-resource";
import { formatRelative } from "@/lib/format";
import { formatUnits } from "@/lib/units";
import { knownAssets } from "@/modules/portfolio/assets";
import { earmarkedRaw } from "@/modules/savings/savings.engine";
import type { StrategyEvaluation } from "@/modules/strategy/strategy.types";
import { AllocationPanel } from "./allocation-panel";
import { ReferencePricesPanel, type PriceRow } from "./reference-prices-panel";
import { ScenarioPanel } from "./scenario-panel";
import { TargetsPanel } from "./targets-panel";
import { defaultStrategySettings, describeScenario } from "@/modules/strategy/strategy.defaults";
import type { Decision } from "@/modules/memory/memory.repositories";

export function StrategyView() {
  const { address } = useWatchAddress();
  const strategy = useMemoryStrategy(address);
  const strategyResponse = strategy.state.status === "ready" ? strategy.state.data : null;
  const settings = useMemo(() => strategyResponse?.settings ?? defaultStrategySettings(), [strategyResponse]);
  const save = (next: typeof settings) => strategy.save(next);
  const goalsMemory = useMemoryGoals(address);
  const goals = useMemo(() => (goalsMemory.state.status === "ready" ? goalsMemory.state.data.items : []), [goalsMemory.state]);
  const decisions = useApiResource<{ items: (Decision & { memoryId: string; createdAt: string })[] }>(address ? `/api/memory/decisions?address=${address}` : null);
  const decide = usePostMemory<{ address: string; decision: Decision }>("/api/memory/decisions");

  // Savings earmarks are passed as a constraint: those funds are never sold in scenarios.
  const earmarks = useMemo(() => {
    const byCoin = new Map<string, { raw: bigint; decimals: number }>();
    for (const g of goals) {
      const prev = byCoin.get(g.coinType);
      byCoin.set(g.coinType, { raw: (prev?.raw ?? 0n) + earmarkedRaw(g), decimals: g.decimals });
    }
    return [...byCoin.entries()].filter(([, v]) => v.raw > 0n).map(([coinType, v]) => ({ coinType, amount: formatUnits(v.raw, v.decimals) }));
  }, [goals]);

  const { state, refresh } = usePostResource<StrategyEvaluation>(
    "/api/strategy/evaluate",
    // Wait for stored preferences before evaluating, so results never flash defaults.
    address && strategy.state.status !== "loading" && strategy.state.status !== "idle" ? { address, settings, earmarks } : null,
  );
  const evaluation = state.status === "ready" ? state.data : null;

  const priceRows: PriceRow[] = useMemo(() => {
    if (!evaluation) return [];
    const rows: PriceRow[] = evaluation.holdings.map((h) => ({ coinType: h.coinType, symbol: h.symbol, amount: h.amount, state: h.state, valueUsd: h.valueUsd }));
    for (const k of knownAssets(evaluation.source.network === "mainnet" ? "mainnet" : "testnet")) {
      if (k.assetClass !== "other" && !rows.some((r) => r.coinType === k.coinType)) {
        rows.push({ coinType: k.coinType, symbol: k.symbol, amount: null, state: "not_held", valueUsd: null });
      }
    }
    return rows;
  }, [evaluation]);

  if (!address) {
    return (
      <PageContainer>
        <PageHeader title="Strategy" />
        <Panel>
          <EmptyState title="Analyze a Sui address" description="Enter a public Sui Testnet address above to compare its allocation with your targets." />
        </Panel>
      </PageContainer>
    );
  }

  const band = Number(settings.driftBandPct) || 0;

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Strategy"
        description="Allocation against your own targets and constraints. Calculations use reference prices you provide; nothing is executed."
        actions={
          evaluation && (
            <span className="hidden text-xs text-subtle sm:inline" title={`Balances fetched ${evaluation.source.fetchedAt}`}>
              Balances from Tatum · {formatRelative(evaluation.source.fetchedAt)}
            </span>
          )
        }
      />

      <div className="mb-6 space-y-2 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-[13px]">
        <p>
          <span className="font-medium text-warning">Reference prices are your assumptions.</span>{" "}
          <span className="text-muted-foreground">Testnet assets have no market price; every value and percentage below is computed from prices you enter.</span>
        </p>
      </div>
      <MemoryBanner className="-mt-3 mb-6" provider={strategyResponse?.provider ?? null} what="Preferences, reference prices and targets" />
      {strategy.state.status === "error" && (
        <Panel className="mb-6">
          <ErrorState error={strategy.state.error} onRetry={strategy.refresh} />
        </Panel>
      )}
      {(strategy.mutationError ?? decide.error) && (
        <Panel className="mb-6">
          <ErrorState error={(strategy.mutationError ?? decide.error)!} />
        </Panel>
      )}

      {state.status === "error" && (
        <Panel className="mb-6">
          <ErrorState error={state.error} onRetry={refresh} />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          {!evaluation && state.status !== "error" && (
            <Panel title="Allocation">
              <TableSkeleton rows={3} cols={5} />
            </Panel>
          )}

          {evaluation && evaluation.status !== "complete" && (
            <Panel title="Allocation">
              <EmptyState
                title={evaluation.status === "empty" ? "Nothing to analyse" : "Allocation unavailable"}
                description={evaluation.unavailableReason ?? undefined}
              />
            </Panel>
          )}

          {evaluation?.status === "complete" && evaluation.classes && <AllocationPanel evaluation={evaluation} band={band} />}

          {evaluation && evaluation.warnings.length > 0 && (
            <Panel title="Liquidity and constraint checks">
              <ul className="space-y-3 px-4 py-4">
                {evaluation.warnings.map((w, i) => (
                  <li key={`${w.id}-${i}`} className="flex gap-2.5">
                    {w.level === "warning" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} aria-label="Warning" />
                    ) : (
                      <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" strokeWidth={1.75} aria-label="Info" />
                    )}
                    <div>
                      <div className="text-[13px] font-medium">{w.title}</div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{w.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {evaluation?.scenario && (
            <ScenarioPanel
              scenario={evaluation.scenario}
              pastDecisions={(decisions.state.status === "ready" ? decisions.state.data.items : []).filter((d) => d.scenario === describeScenario(evaluation.scenario!))}
              deciding={decide.pending}
              onDecide={async (decision, reason) => {
                const ok = await decide.post({
                  address: address!,
                  decision: { decision, reason: reason || null, scenario: describeScenario(evaluation.scenario!), targets: settings.targets },
                });
                if (ok) decisions.refresh();
              }}
            />
          )}

          {evaluation && (
            <ReferencePricesPanel key={`${address}:${settings.updatedAt}`} rows={priceRows} settings={settings} onSave={save} />
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <TargetsPanel key={`${address}:${settings.updatedAt}`} settings={settings} onSave={save} />
          {earmarks.length > 0 && (
            <p className="mt-3 px-1 text-xs text-subtle">
              Savings earmarks ({earmarks.length} asset{earmarks.length === 1 ? "" : "s"}) are treated as locked and never reduced in scenarios.
            </p>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
