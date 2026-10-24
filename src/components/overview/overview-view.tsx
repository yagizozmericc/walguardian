"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { Metric, PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ActivityTable } from "@/components/portfolio/activity-table";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { usePortfolio } from "@/components/portfolio/use-portfolio";
import { useWatchAddress } from "@/components/providers/watch-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatRelative, suiscanAccountUrl } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import type { PortfolioSnapshot } from "@/modules/portfolio/portfolio.types";
import { CommandCenter } from "./command-center";

export function OverviewView() {
  const { address } = useWatchAddress();
  const portfolio = usePortfolio(address);
  const { state } = portfolio;

  if (!address) {
    return (
      <PageContainer>
        <PageHeader title="Overview" />
        <Panel>
          <EmptyState
            title="Analyze a Sui address"
            description="Enter a public Sui Testnet address in the bar above. Analysis is watch-only: it reads public onchain data through Tatum and does not establish wallet ownership."
          />
        </Panel>
      </PageContainer>
    );
  }

  const data = state.status === "ready" ? state.data : null;

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={
          <a
            href={suiscanAccountUrl(data?.network ?? "testnet", address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono hover:text-foreground"
            title={address}
          >
            {shortAddress(address, 8)}
            <ExternalLink className="size-3" />
          </a>
        }
        actions={
          <>
            {data && <Freshness data={data} />}
            <Button
              variant="outline"
              size="sm"
              onClick={portfolio.refresh}
              disabled={state.status === "loading" || (state.status === "ready" && state.refreshing)}
            >
              <RefreshCw className={state.status === "ready" && state.refreshing ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      {state.status === "error" && (
        <Panel>
          <ErrorState error={state.error} onRetry={portfolio.retry} />
        </Panel>
      )}

      {(state.status === "loading" || state.status === "idle") && <LoadingLayout />}

      {data && (
        <div className="space-y-6">
          <Summary data={data} activityCount={portfolio.activity.length} />
          <CommandCenter address={address} />

          {data.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-[13px] text-warning">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <Panel title="Holdings" meta={`${data.holdings.length} coin types · ${data.valuation.reason}`}>
            {data.holdings.length === 0 ? (
              <EmptyState title="No coins held" description="Tatum reports no coin balances for this address on Sui Testnet." />
            ) : (
              <HoldingsTable holdings={data.holdings} />
            )}
          </Panel>

          <Panel title="Recent activity" meta="Transactions affecting this address, newest first">
            {portfolio.activity.length === 0 ? (
              <EmptyState
                title="No transactions found"
                description="No transactions affecting this address were returned. A new or unused address has no behavioral history to analyze."
              />
            ) : (
              <>
                <ActivityTable activity={portfolio.activity} network={data.network} />
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                  <span className="text-xs text-subtle">
                    {portfolio.activity.length} transactions loaded
                    {!portfolio.hasOlder && " · end of available history"}
                  </span>
                  {portfolio.olderError && <span className="text-xs text-critical">{portfolio.olderError.message}</span>}
                  {portfolio.hasOlder && (
                    <Button variant="ghost" size="sm" onClick={portfolio.loadOlder} disabled={portfolio.loadingOlder}>
                      {portfolio.loadingOlder ? "Loading…" : "Load older"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </PageContainer>
  );
}

function Freshness({ data }: { data: PortfolioSnapshot }) {
  return (
    <span
      className="hidden text-xs text-subtle sm:inline"
      title={`Source: Tatum ${data.source.transport} ${data.source.endpoint} · fetched ${data.source.fetchedAt}`}
    >
      Tatum · checkpoint <span className="num">{Number(data.chain.checkpointHeight).toLocaleString("en-US")}</span> ·{" "}
      {formatRelative(data.source.fetchedAt)}
    </span>
  );
}

function Summary({ data, activityCount }: { data: PortfolioSnapshot; activityCount: number }) {
  const sui = data.holdings.find((h) => h.assetClass === "native");
  const stables = data.holdings.filter((h) => h.assetClass === "stablecoin");
  const lastActive = data.activity[0]?.timestampMs;

  return (
    <section className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-border bg-surface px-5 py-4 md:grid-cols-4 md:divide-x md:divide-border md:[&>*:not(:first-child)]:pl-6">
      <Metric
        label="SUI balance"
        value={sui?.amount ? formatAmount(sui.amount) : "0"}
        sub="Native coin"
      />
      <Metric
        label="Verified stablecoins"
        value={stables.length === 0 ? "None" : stables.map((s) => `${formatAmount(s.amount ?? "0", 2)} ${s.symbol}`).join(" · ")}
        sub="Registry-matched coin types only"
      />
      <Metric label="Coin types" value={data.holdings.length} sub="Held by this address" />
      <Metric
        label="Last activity"
        value={lastActive ? new Date(lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        sub={`${activityCount} transactions loaded`}
      />
    </section>
  );
}

function LoadingLayout() {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-6 rounded-lg border border-border bg-surface px-5 py-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </section>
      <Panel title="Holdings">
        <TableSkeleton rows={3} cols={3} />
      </Panel>
      <Panel title="Recent activity">
        <TableSkeleton rows={6} cols={4} />
      </Panel>
    </div>
  );
}
