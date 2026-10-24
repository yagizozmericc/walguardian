"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useApiResource } from "@/components/common/use-api-resource";
import { usePostResource } from "@/components/common/use-post-resource";
import { useCopilot } from "@/components/copilot/copilot-context";
import { SyntheticDemoControls } from "@/components/demo/synthetic-controls";
import { useMemoryGoals, useMemoryStrategy } from "@/components/memory/use-memory";
import { STATUS_DOT, STATUS_LABEL } from "@/components/security/labels";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUnits } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { MemoryProviderInfo } from "@/modules/memory/memory.factory";
import type { MemoryHistoryEntry } from "@/modules/memory/memory.types";
import { earmarkedRaw } from "@/modules/savings/savings.engine";
import type { SavingsEvaluation } from "@/modules/savings/savings.types";
import type { SecurityReport } from "@/modules/security/security.types";
import { defaultStrategySettings } from "@/modules/strategy/strategy.defaults";
import type { StrategyEvaluation } from "@/modules/strategy/strategy.types";

function Card({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-subtle hover:text-foreground">
          Open <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="flex-1 px-4 py-3">{children}</div>
    </section>
  );
}

const Loading = () => (
  <div className="space-y-2" aria-busy="true">
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-3 w-48" />
  </div>
);
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] text-muted-foreground">{children}</p>;
const Failed = ({ message }: { message: string }) => <p className="text-[13px] text-critical">{message}</p>;

export function CommandCenter({ address }: { address: string }) {
  const copilot = useCopilot();
  const security = useApiResource<SecurityReport>(`/api/security/${address}`);
  const goals = useMemoryGoals(address);
  const strategy = useMemoryStrategy(address);
  const records = useApiResource<{ provider: MemoryProviderInfo; session: boolean; entries: MemoryHistoryEntry[] }>("/api/memory/records");

  const goalList = useMemo(() => (goals.state.status === "ready" ? goals.state.data.items : []), [goals.state]);
  const savings = usePostResource<SavingsEvaluation>("/api/savings/evaluate", goalList.length ? { address, goals: goalList } : null);
  const earmarks = useMemo(
    () => goalList.map((g) => ({ coinType: g.coinType, amount: formatUnits(earmarkedRaw(g), g.decimals) })).filter((e) => e.amount !== "0"),
    [goalList],
  );
  const settings = strategy.state.status === "ready" ? strategy.state.data.settings : null;
  const allocation = usePostResource<StrategyEvaluation>(
    "/api/strategy/evaluate",
    strategy.state.status === "ready" && settings ? { address, settings: settings ?? defaultStrategySettings(), earmarks } : null,
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Security" href="/security">
          {security.state.status === "ready" ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", STATUS_DOT[security.state.data.status])} />
                <span className="text-[14px] font-medium">{STATUS_LABEL[security.state.data.status]}</span>
              </div>
              <p className="num text-xs text-muted-foreground">
                Open: {security.state.data.openCounts.high} high · {security.state.data.openCounts.medium} medium · {security.state.data.openCounts.low} low
              </p>
              <p className="text-xs text-subtle">
                {security.state.data.assessed.length} sent transactions assessed · deviations, not proof of malice
              </p>
            </div>
          ) : security.state.status === "error" ? (
            <Failed message={security.state.error.message} />
          ) : (
            <Loading />
          )}
        </Card>

        <Card title="Savings" href="/savings">
          {goals.state.status === "error" ? (
            <Failed message={goals.state.error.message} />
          ) : goals.state.status !== "ready" ? (
            <Loading />
          ) : goals.state.data.provider.provider === "disabled" ? (
            <Muted>Memory is not configured, so goals cannot be saved.</Muted>
          ) : goalList.length === 0 ? (
            <Muted>No savings goals yet.</Muted>
          ) : savings.state.status === "ready" ? (
            <ul className="space-y-2">
              {savings.state.data.goals.slice(0, 2).map((e) => {
                const g = goalList.find((x) => x.id === e.goalId);
                return (
                  <li key={e.goalId}>
                    <div className="num flex justify-between gap-2 text-xs">
                      <span className="truncate">{g?.name}</span>
                      <span className="text-muted-foreground">{e.progressPct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={Number(e.progressPct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g?.name} progress`}>
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(Number(e.progressPct), 100)}%` }} />
                    </div>
                  </li>
                );
              })}
              {goalList.length > 2 && <li className="text-xs text-subtle">+{goalList.length - 2} more</li>}
            </ul>
          ) : savings.state.status === "error" ? (
            <Failed message={savings.state.error.message} />
          ) : (
            <Loading />
          )}
        </Card>

        <Card title="Strategy" href="/strategy">
          {strategy.state.status === "error" ? (
            <Failed message={strategy.state.error.message} />
          ) : strategy.state.status !== "ready" ? (
            <Loading />
          ) : !settings ? (
            <Muted>No targets or reference prices saved yet.</Muted>
          ) : allocation.state.status === "ready" ? (
            allocation.state.data.status === "complete" ? (
              <div className="space-y-1">
                {allocation.state.data.classes!.filter((c) => c.currentPct !== "0.00" || (c.targetPct && c.targetPct !== "0.00")).map((c) => (
                  <div key={c.assetClass} className="num flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.assetClass === "native" ? "SUI" : c.assetClass === "stablecoin" ? "Stablecoins" : "Other"}</span>
                    <span className={c.outOfBand ? "text-warning" : undefined}>
                      {c.currentPct}%{c.targetPct ? ` / ${c.targetPct}%` : ""}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-subtle">At your reference prices (assumptions)</p>
              </div>
            ) : (
              <Muted>Allocation unavailable: some assets have no reference price.</Muted>
            )
          ) : allocation.state.status === "error" ? (
            <Failed message={allocation.state.error.message} />
          ) : (
            <Loading />
          )}
        </Card>

        <Card title="Financial memory" href="/memory">
          {records.state.status === "ready" ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", records.state.data.provider.provider === "walrus" ? "bg-positive" : records.state.data.provider.provider === "mock" ? "bg-warning" : "bg-subtle")} />
                <span className="text-[14px] font-medium">
                  {records.state.data.provider.provider === "mock" ? "Development mock (not Walrus)" : records.state.data.provider.label}
                </span>
              </div>
              <p className="num text-xs text-muted-foreground">
                {records.state.data.entries.filter((e) => e.status === "current").length} current record(s) for this session
              </p>
            </div>
          ) : records.state.status === "error" ? (
            <Failed message={records.state.error.message} />
          ) : (
            <Loading />
          )}
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/assess">Check a transfer</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => copilot.ask("Summarize this wallet's security, savings and allocation, and what I should look at first.")}>
          Ask the copilot for a summary
        </Button>
        <div className="ml-auto">
          <SyntheticDemoControls address={address} compact />
        </div>
      </div>
    </div>
  );
}
