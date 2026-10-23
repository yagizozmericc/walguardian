"use client";

import { cn } from "@/lib/utils";
import type { IntegrationState } from "@/lib/status-types";
import { useIntegrationStatus } from "./use-integration-status";

const DOT: Record<IntegrationState, string> = {
  connected: "bg-positive",
  configured: "bg-subtle",
  not_configured: "bg-subtle/50",
  error: "bg-critical",
};

const LABEL: Record<IntegrationState, string> = {
  connected: "Live",
  configured: "Ready",
  not_configured: "Not set",
  error: "Error",
};

/** Live integration status: every row is a real server-side check. */
export function IntegrationStatus() {
  const { data, failed } = useIntegrationStatus();

  return (
    <div className="space-y-2">
      <div className="label-caps">Data sources</div>
      {failed && <p className="text-xs text-critical">Status check failed.</p>}
      {!data && !failed && <p className="text-xs text-subtle">Checking…</p>}
      {data?.integrations.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 text-xs" title={i.detail}>
          <span className="truncate text-sidebar-foreground/80">{i.label}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-subtle">
            <span className={cn("size-1.5 rounded-full", DOT[i.state])} />
            {LABEL[i.state]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NetworkBadge() {
  const { data } = useIntegrationStatus();
  if (!data) return null;
  const mainnet = data.network === "mainnet";
  return (
    <span
      className="hidden shrink-0 items-center gap-1.5 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex"
      title={`All blockchain reads use Sui ${data.network}.`}
    >
      <span className={cn("size-1.5 rounded-full", mainnet ? "bg-critical" : "bg-warning")} />
      {mainnet ? "Sui Mainnet" : "Sui Testnet"}
    </span>
  );
}
