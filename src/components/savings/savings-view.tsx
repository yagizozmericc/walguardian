"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useApiResource } from "@/components/common/use-api-resource";
import { useWatchAddress } from "@/components/providers/watch-context";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatRelative, shortCoinType } from "@/lib/format";
import { cn } from "@/lib/utils";
import { knownAssets } from "@/modules/portfolio/assets";
import type { PortfolioSnapshot } from "@/modules/portfolio/portfolio.types";
import type { GoalEvaluation, SavingsEvaluation, SavingsGoal } from "@/modules/savings/savings.types";
import { GoalDetail } from "./goal-detail";
import { GoalFormSheet, type GoalAsset } from "./goal-form";
import { SCHEDULE_LABEL, SCHEDULE_TEXT } from "./labels";
import { MemoryBanner, memoryNotices } from "@/components/memory/memory-banner";
import { useMemoryGoals } from "@/components/memory/use-memory";
import { useSavingsEvaluation } from "./use-savings";

export function SavingsView() {
  const { address } = useWatchAddress();
  const portfolio = useApiResource<PortfolioSnapshot>(address ? `/api/portfolio/${address}?limit=1` : null);
  const memory = useMemoryGoals(address);
  const goalsResponse = memory.state.status === "ready" ? memory.state.data : null;
  const goals: SavingsGoal[] = useMemo(
    () => (goalsResponse?.items ?? []).map((g) => {
      const goal: SavingsGoal & { memory?: unknown } = { ...g };
      delete goal.memory;
      return goal;
    }),
    [goalsResponse],
  );
  const canSave = goalsResponse !== null && goalsResponse.provider.provider !== "disabled";
  const save = (g: SavingsGoal) => memory.save(g);
  const remove = (id: string) => memory.remove(id);
  const { state: evalState } = useSavingsEvaluation(address, goals);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; goal: SavingsGoal | null; key: number }>({ open: false, goal: null, key: 0 });

  const network = portfolio.state.status === "ready" ? portfolio.state.data.network : "testnet";
  const assets: GoalAsset[] = useMemo(() => {
    const held = portfolio.state.status === "ready" ? portfolio.state.data.holdings : [];
    const list: GoalAsset[] = held
      .filter((h) => h.decimals !== null)
      .map((h) => ({ coinType: h.coinType, symbol: h.symbol, decimals: h.decimals as number, balance: h.amount }));
    for (const k of knownAssets(network)) {
      if (!list.some((a) => a.coinType === k.coinType)) list.push({ coinType: k.coinType, symbol: k.symbol, decimals: k.decimals, balance: null });
    }
    return list;
  }, [portfolio.state, network]);

  const evaluation: SavingsEvaluation | null = evalState.status === "ready" ? evalState.data : null;
  const evalById = useMemo(() => new Map((evaluation?.goals ?? []).map((g) => [g.goalId, g])), [evaluation]);
  const ordered = useMemo(() => [...goals].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [goals]);
  const current = ordered.find((g) => g.id === selected) ?? ordered[0] ?? null;

  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("goal-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const openForm = (goal: SavingsGoal | null) => setForm((f) => ({ open: true, goal, key: f.key + 1 }));

  if (!address) {
    return (
      <PageContainer>
        <PageHeader title="Savings" />
        <Panel>
          <EmptyState title="Analyze a Sui address" description="Enter a public Sui Testnet address above. Goals are checked against that wallet's onchain balance." />
        </Panel>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Savings"
        description="Goals funded by amounts you explicitly earmark from this wallet. Wallet balances are never counted toward a goal automatically."
        actions={
          <>
            {evaluation && (
              <span className="hidden text-xs text-subtle sm:inline" title={`Balance fetched ${evaluation.source.fetchedAt}`}>
                Checked against Tatum · {formatRelative(evaluation.source.fetchedAt)}
              </span>
            )}
            <Button size="sm" onClick={() => openForm(null)} disabled={portfolio.state.status === "loading" || !canSave}>
              <Plus />
              New goal
            </Button>
          </>
        }
      />

      <MemoryBanner className="mb-6" provider={goalsResponse?.provider ?? null} what="Goals" notices={goalsResponse ? memoryNotices(goalsResponse) : []} />

      {memory.state.status === "error" && (
        <Panel className="mb-6">
          <ErrorState error={memory.state.error} onRetry={memory.refresh} />
        </Panel>
      )}
      {memory.mutationError && (
        <Panel className="mb-6">
          <ErrorState error={memory.mutationError} />
        </Panel>
      )}

      {portfolio.state.status === "error" && (
        <Panel className="mb-6">
          <ErrorState error={portfolio.state.error} onRetry={portfolio.refresh} />
        </Panel>
      )}

      {memory.state.status === "loading" ? (
        <Panel>
          <TableSkeleton rows={3} cols={4} />
        </Panel>
      ) : goals.length === 0 ? (
        <Panel>
          <EmptyState
            title="No savings goals yet"
            description="Create a savings target (for example 2,000 USDC by a date) or a reserve (a minimum you want kept aside). Then earmark funds from this wallet toward it."
            action={
              <Button size="sm" onClick={() => openForm(null)} disabled={!canSave}>
                <Plus />
                New goal
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {evalState.status === "error" && (
            <Panel>
              <ErrorState error={evalState.error} />
            </Panel>
          )}
          {evaluation && <CoverageBand evaluation={evaluation} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
            <Panel title="Goals" meta={`${goals.length} goal${goals.length === 1 ? "" : "s"}`} className="self-start">
              <GoalTable goals={ordered} evalById={evalById} selected={current?.id ?? null} onSelect={select} />
            </Panel>
            <Panel title="Goal" id="goal-detail" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
              {current && (
                <GoalDetail
                  key={current.id}
                  goal={current}
                  evaluation={evalById.get(current.id) ?? null}
                  onSave={save}
                  onEdit={() => openForm(current)}
                  onDelete={() => remove(current.id)}
                />
              )}
            </Panel>
          </div>
        </div>
      )}

      <GoalFormSheet
        key={form.key}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        assets={assets}
        existing={form.goal}
        onSave={(g) => {
          save(g);
          setSelected(g.id);
        }}
      />
    </PageContainer>
  );
}

function GoalTable({
  goals,
  evalById,
  selected,
  onSelect,
}: {
  goals: SavingsGoal[];
  evalById: Map<string, GoalEvaluation>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Goal</TableHead>
          <TableHead className="w-[34%]">Progress</TableHead>
          <TableHead className="hidden text-right md:table-cell">Needed / mo</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {goals.map((g) => {
          const e = evalById.get(g.id);
          const pct = e ? Math.min(Number(e.progressPct), 100) : 0;
          const unit = g.symbol ?? shortCoinType(g.coinType);
          const warn = e?.insights.some((i) => i.level === "warning");
          return (
            <TableRow
              key={g.id}
              tabIndex={0}
              data-state={g.id === selected ? "selected" : undefined}
              aria-selected={g.id === selected}
              onClick={() => onSelect(g.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelect(g.id);
                }
              }}
              className="cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
            >
              <TableCell className="max-w-[220px]">
                <div className="truncate font-medium">{g.name}</div>
                <div className="text-xs text-subtle">
                  {g.kind === "reserve" ? "Reserve" : `By ${g.targetDate}`} · {unit}
                </div>
              </TableCell>
              <TableCell>
                {e ? (
                  <div>
                    <div className="num flex justify-between gap-2 text-xs">
                      <span>
                        {formatAmount(e.funded)} <span className="text-subtle">/ {formatAmount(e.target)}</span>
                      </span>
                      <span className="text-muted-foreground">{e.progressPct}%</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="meter"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${g.name} progress`}
                    >
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-subtle">Evaluating…</span>
                )}
              </TableCell>
              <TableCell className="num hidden text-right md:table-cell">
                {e?.requiredMonthly && (g.kind === "target" || g.targetDate) ? (
                  `${formatAmount(e.requiredMonthly)} ${unit}`
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </TableCell>
              <TableCell className="text-right text-xs">
                {e ? (
                  <span className={cn(g.kind === "reserve" ? (e.completed ? "text-positive" : "text-warning") : SCHEDULE_TEXT[e.schedule.status])}>
                    {g.kind === "reserve" ? (e.completed ? "Funded" : "Below minimum") : SCHEDULE_LABEL[e.schedule.status]}
                    {warn && g.kind !== "reserve" && e.schedule.status !== "behind" && e.schedule.status !== "overdue" && (
                      <span className="text-warning"> · review</span>
                    )}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CoverageBand({ evaluation }: { evaluation: SavingsEvaluation }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="grid divide-y divide-border md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] md:divide-x md:divide-y-0">
        {evaluation.coverage.map((c) => (
          <div key={c.coinType} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label-caps">{c.symbol ?? shortCoinType(c.coinType)} earmarked</span>
              {c.overCommitted && <span className="text-xs text-warning">Exceeds wallet balance</span>}
            </div>
            <div className="num mt-1.5 text-[22px] font-medium tracking-tight">{formatAmount(c.earmarked)}</div>
            <div className="num mt-0.5 text-xs text-muted-foreground">
              Wallet {c.walletBalance === null ? "not checked" : formatAmount(c.walletBalance)} · unallocated{" "}
              {c.unallocated === null ? "—" : formatAmount(c.unallocated)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
