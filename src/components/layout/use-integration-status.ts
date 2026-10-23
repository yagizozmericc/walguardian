"use client";

import { useEffect, useState } from "react";
import type { IntegrationStatusResponse } from "@/lib/status-types";

let inflight: Promise<IntegrationStatusResponse> | null = null;

function load(): Promise<IntegrationStatusResponse> {
  inflight ??= fetch("/api/status").then((r) => {
    if (!r.ok) throw new Error(`Status check failed (${r.status})`);
    return r.json() as Promise<IntegrationStatusResponse>;
  });
  inflight.catch(() => {
    inflight = null;
  });
  return inflight;
}

/** One shared /api/status request per page load. */
export function useIntegrationStatus() {
  const [data, setData] = useState<IntegrationStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, failed };
}
