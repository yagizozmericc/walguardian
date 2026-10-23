"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useApiResource } from "@/components/common/use-api-resource";
import { useWatchAddress } from "@/components/providers/watch-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { cn } from "@/lib/utils";
import type { SecurityReport } from "@/modules/security/security.types";
import { AssessmentDetail } from "./assessment-detail";
import { AssessmentList } from "./assessment-list";
import { BehaviorProfile } from "./behavior-profile";
import { STATUS_DOT, STATUS_LABEL } from "./labels";

const PAGE = 50;

export function SecurityView() {
  const { address } = useWatchAddress();
  const { state, refresh } = useApiResource<SecurityReport>(address ? `/api/security/${address}` : null);
  const [filter, setFilter] = useState<"flagged" | "all">("flagged");
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const report = state.status === "ready" ? state.data : null;
  const flagged = useMemo(() => report?.assessed.filter((a) => a.assessment.score > 0) ?? [], [report]);
  const items = filter === "flagged" ? flagged : report?.assessed ?? [];
  const current = report?.assessed.find((a) => a.digest === selected) ?? items[0] ?? null;

  const select = (digest: string) => {
    setSelected(digest);
    // On narrow layouts the detail panel sits below the list.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("assessment-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!address) {
    return (
      <PageContainer>
        <PageHeader title="Security Center" />
        <Panel>
          <EmptyState
            title="Analyze a Sui address"
            description="Enter a public Sui Testnet address above to build its behavioral profile and review deviations from its own history."
          />
        </Panel>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Security Center"
        description={
          <>
            Behavioral deviations for <span className="font-mono">{shortAddress(address, 6)}</span>, scored by deterministic rules
            against the wallet&apos;s own history.
          </>
        }
        actions={
          <>
            {report && (
              <span className="hidden text-xs text-subtle sm:inline" title={`Fetched ${report.source.fetchedAt}`}>
                {report.rulesVersion} · {formatRelative(report.source.fetchedAt)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
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
          <ErrorState error={state.error} onRetry={refresh} />
        </Panel>
      )}

      {(state.status === "loading" || state.status === "idle") && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface px-5 py-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-3 h-3 w-96 max-w-full" />
          </div>
          <Panel title="Assessed transactions">
            <TableSkeleton rows={8} cols={4} />
          </Panel>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <StatusBand report={report} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Panel
              title="Assessed transactions"
              meta={`${report.assessed.length} sent by this address`}
              actions={
                <div className="flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Filter">
                  {(["flagged", "all"] as const).map((f) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={filter === f}
                      onClick={() => {
                        setFilter(f);
                        setLimit(PAGE);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 text-muted-foreground",
                        filter === f && "bg-muted font-medium text-foreground",
                      )}
                    >
                      {f === "flagged" ? `Flagged (${flagged.length})` : `All (${report.assessed.length})`}
                    </button>
                  ))}
                </div>
              }
            >
              {items.length === 0 ? (
                <EmptyState
                  title={filter === "flagged" ? "No flagged transactions" : "No transactions sent by this address"}
                  description={
                    filter === "flagged"
                      ? "No rule contributed points to any transaction in the analysed history. Open All to see, per transaction, which rules could not be applied for lack of history."
                      : "Only transactions sent by the address are assessed. Incoming transfers are listed on the Overview."
                  }
                />
              ) : (
                <>
                  <AssessmentList items={items.slice(0, limit)} selected={current?.digest ?? null} onSelect={select} />
                  {items.length > limit && (
                    <div className="border-t border-border px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                        Show more ({items.length - limit})
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Panel>

            <Panel title="Assessment" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start" id="assessment-detail">
              {current ? (
                <AssessmentDetail item={current} network={report.network} />
              ) : (
                <EmptyState title="Nothing selected" description="Select a transaction to see its score breakdown." />
              )}
            </Panel>
          </div>

          <BehaviorProfile baseline={report.baseline} />

          <Panel title="Methodology and limits">
            <ul className="list-disc space-y-1.5 py-3 pr-4 pl-8 text-[13px] text-muted-foreground">
              <li>Behavioral anomalies are deviations from this wallet&apos;s own history. They are not evidence of malicious activity.</li>
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </PageContainer>
  );
}

function StatusBand({ report }: { report: SecurityReport }) {
  const c = report.severityCounts;
  const b = report.baseline;
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", STATUS_DOT[report.status])} />
            <span className="text-[15px] font-medium">{STATUS_LABEL[report.status]}</span>
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{report.statusSummary}</p>
        </div>
        <dl className="num flex gap-6 text-right">
          {(
            [
              ["High", c.high, "text-critical"],
              ["Medium", c.medium, "text-warning"],
              ["Low", c.low, "text-foreground"],
            ] as const
          ).map(([label, n, cls]) => (
            <div key={label}>
              <dt className="label-caps">{label}</dt>
              <dd className={cn("mt-1 text-[20px] font-medium", n > 0 ? cls : "text-subtle")}>{n}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-5 py-2.5 text-xs text-subtle">
        <span>
          {report.analysedTransactionCount} most recent transactions{report.historyComplete ? " (full available history)" : ""}
        </span>
        {b.windowStartMs && b.windowEndMs && (
          <span className="num">
            {formatTimestamp(b.windowStartMs)} – {formatTimestamp(b.windowEndMs)}
          </span>
        )}
        <span>Historical analysis · manual refresh</span>
      </div>
    </section>
  );
}
