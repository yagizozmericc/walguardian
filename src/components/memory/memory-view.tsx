"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageContainer, PageHeader, Panel } from "@/components/common/page";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useApiResource } from "@/components/common/use-api-resource";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format";
import { shortAddress } from "@/lib/sui-address";
import { cn } from "@/lib/utils";
import type { MemoryProviderInfo } from "@/modules/memory/memory.factory";
import type { MemoryCategory, MemoryHistoryEntry, RecordStatus } from "@/modules/memory/memory.types";
import { MemoryBanner } from "./memory-banner";
import { SyntheticDemoControls } from "@/components/demo/synthetic-controls";
import { useWatchAddress } from "@/components/providers/watch-context";

interface RecordsResponse {
  provider: MemoryProviderInfo;
  session: boolean;
  entries: MemoryHistoryEntry[];
}

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  profile: "Preferences",
  goal: "Savings goal",
  behavior: "Behavior",
  security_decision: "Security review",
  investment_decision: "Investment decision",
  reasoning: "Reasoning",
};

const STATUS_TEXT: Record<RecordStatus, string> = {
  current: "Current",
  superseded: "Superseded",
  deleted: "Deletion record",
  expired: "Expired",
};

export function MemoryView() {
  const { state, refresh } = useApiResource<RecordsResponse>("/api/memory/records");
  const { address } = useWatchAddress();
  const [filter, setFilter] = useState<"current" | "all">("all");
  const data = state.status === "ready" ? state.data : null;
  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => (filter === "current" ? e.status === "current" : true)),
    [data, filter],
  );

  return (
    <PageContainer className="max-w-[1320px]">
      <PageHeader
        title="Financial memory"
        description="Every preference, goal, decision and review saved for this session, with its source, timestamp, identifiers and expiry."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={state.status === "loading"}>
            <RefreshCw className={state.status === "ready" && state.refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <MemoryBanner
        className="mb-3"
        provider={data?.provider ?? null}
        what="Memories"
        notices={[
          "Access is tied to this browser's signed session, not to a wallet address. Clearing cookies ends access from this browser.",
          "Walrus Memory content is encrypted at rest, but the hosted relayer processes plaintext. Store only non-sensitive, synthetic data.",
          "Walrus records cannot be erased early: deleting writes a deletion record, and earlier records remain until they expire.",
        ]}
      />

      {address && <SyntheticDemoControls address={address} />}

      {state.status === "error" && (
        <Panel className="mt-6">
          <ErrorState error={state.error} onRetry={refresh} />
        </Panel>
      )}

      <div className="mt-6">
        {state.status === "loading" || state.status === "idle" ? (
          <Panel title="Records">
            <TableSkeleton rows={6} cols={5} />
          </Panel>
        ) : data && (data.provider.provider === "disabled" || !data.session || data.entries.length === 0) ? (
          <Panel title="Records">
            <EmptyState
              title={data.provider.provider === "disabled" ? "Memory is not configured" : "No memories yet"}
              description={
                data.provider.provider === "disabled"
                  ? data.provider.detail
                  : "Create a savings goal, save investment preferences, or review a transaction in the Security Center. Each saved item appears here."
              }
            />
          </Panel>
        ) : data ? (
          <Panel
            title="Records"
            meta={`${data.entries.length} total · ${data.entries.filter((e) => e.status === "current").length} current`}
            actions={
              <div className="flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Filter">
                {(["all", "current"] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn("rounded px-2 py-0.5 text-muted-foreground", filter === f && "bg-muted font-medium text-foreground")}
                  >
                    {f === "all" ? "All" : "Current"}
                  </button>
                ))}
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Type</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Saved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Record / blob</TableHead>
                  <TableHead className="text-right">Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.blobId} className={cn(e.status !== "current" && "text-muted-foreground")}>
                    <TableCell className="whitespace-nowrap">{e.record ? CATEGORY_LABEL[e.record.category] : "—"}</TableCell>
                    <TableCell className="max-w-[420px] whitespace-normal">
                      {e.record ? (
                        <>
                          <div className="line-clamp-2">
                            {e.record.summary.startsWith("[Synthetic demo]") && (
                              <span className="mr-1.5 rounded-sm border border-warning/40 px-1 text-[10px] font-medium tracking-wide text-warning uppercase">Synthetic</span>
                            )}
                            {e.record.summary.replace(/^\[Synthetic demo\]\s*/, "")}
                          </div>
                          {e.record.wallet && <div className="mt-0.5 font-mono text-[11px] text-subtle">{shortAddress(e.record.wallet)}</div>}
                        </>
                      ) : (
                        <span className="text-subtle">{e.status === "expired" ? "Content no longer retrievable" : "Not retrievable in this listing"}</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{e.record?.source ?? "—"}</TableCell>
                    <TableCell className="num whitespace-nowrap">{e.createdAt ? formatTimestamp(Date.parse(e.createdAt)) : "—"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-xs", e.status === "expired" && "text-warning")}>{STATUS_TEXT[e.status]}</TableCell>
                    <TableCell className="hidden font-mono text-[11px] text-subtle lg:table-cell">
                      <div title={e.record?.id}>{e.record ? `${e.record.id.slice(0, 8)}…` : "—"}</div>
                      <div title={e.blobId}>{e.blobId.slice(0, 10)}…</div>
                    </TableCell>
                    <TableCell className="num text-right text-xs whitespace-nowrap">
                      {e.expiresAt ? formatTimestamp(Date.parse(e.expiresAt)) : "Unknown"}
                      {data.provider.provider === "mock" && e.expiresAt && <div className="text-[10px] text-subtle">simulated</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        ) : null}
      </div>
    </PageContainer>
  );
}
