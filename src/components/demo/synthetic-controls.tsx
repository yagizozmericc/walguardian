"use client";

import { useState } from "react";
import { fetchJson, toDisplayError } from "@/components/common/use-api-resource";
import { useIntegrationStatus } from "@/components/layout/use-integration-status";
import { Button } from "@/components/ui/button";

/** Load or reset clearly labelled synthetic demo records. Rendered only with the development mock provider. */
export function SyntheticDemoControls({ address, compact = false }: { address: string; compact?: boolean }) {
  const { data } = useIntegrationStatus();
  const [state, setState] = useState<{ pending: boolean; message: string | null; error: string | null }>({ pending: false, message: null, error: null });
  if (!data?.demo.syntheticDataAvailable) return null;

  const run = (method: "POST" | "DELETE") => {
    setState({ pending: true, message: null, error: null });
    fetchJson<{ created: string[]; skipped: string[] }>("/api/demo/synthetic", undefined, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    })
      .then((r) => {
        const msg = r.created.length ? `${method === "POST" ? "Added" : "Removed"}: ${r.created.join(", ")}.` : "Nothing to change.";
        setState({ pending: false, message: `${msg}${r.skipped.length ? ` Kept: ${r.skipped.join(", ")}.` : ""}`, error: null });
        if (r.created.length) setTimeout(() => window.location.reload(), 900);
      })
      .catch((err) => setState({ pending: false, message: null, error: toDisplayError(err).message }));
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <span className="mr-1 text-[13px] text-muted-foreground">Synthetic demo data (development mock only):</span>}
        <Button size="sm" variant="outline" disabled={state.pending} onClick={() => run("POST")}>
          Load synthetic demo data
        </Button>
        <Button size="sm" variant="ghost" disabled={state.pending} onClick={() => run("DELETE")}>
          Reset synthetic data
        </Button>
      </div>
      {state.message && <p className="text-xs text-muted-foreground">{state.message}</p>}
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      {!compact && (
        <p className="text-xs text-subtle">
          Adds labelled synthetic savings goals, investment preferences, illustrative reference prices and a note for this session. Safe to run repeatedly; reset removes only synthetic records.
        </p>
      )}
    </div>
  );
}
