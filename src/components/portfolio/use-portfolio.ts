"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisplayError } from "@/components/common/states";
import type { ApiErrorBody } from "@/lib/errors";
import type { ActivityItem, PortfolioSnapshot } from "@/modules/portfolio/portfolio.types";

async function fetchPortfolio(address: string, cursor?: string, signal?: AbortSignal): Promise<PortfolioSnapshot> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await fetch(`/api/portfolio/${address}${qs}`, { signal, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error;
    const display: DisplayError = {
      code: e?.code,
      message: e?.message ?? `Request failed (${res.status})`,
      provider: e?.provider,
      requestId: e?.requestId,
    };
    throw Object.assign(new Error(display.message), { display });
  }
  return body as PortfolioSnapshot;
}

function toDisplay(err: unknown): DisplayError {
  const d = (err as { display?: DisplayError }).display;
  return d ?? { message: err instanceof Error ? err.message : "Network error." };
}

/** Result of the most recent load, tagged with the address and request generation it belongs to. */
type Loaded =
  | { key: string; status: "error"; error: DisplayError }
  | { key: string; status: "ready"; data: PortfolioSnapshot };

interface Older {
  key: string;
  items: ActivityItem[];
  cursor: string | null;
  loading: boolean;
  error: DisplayError | null;
}

export type PortfolioState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: DisplayError }
  | { status: "ready"; data: PortfolioSnapshot; refreshing: boolean };

/** Loads a portfolio snapshot from the server. Errors are surfaced, never replaced with data. */
export function usePortfolio(address: string | null) {
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [lastReady, setLastReady] = useState<{ address: string; data: PortfolioSnapshot } | null>(null);
  const [older, setOlder] = useState<Older | null>(null);

  const key = address ? `${address}#${generation}` : null;

  useEffect(() => {
    if (!address || !key) return;
    const ac = new AbortController();
    fetchPortfolio(address, undefined, ac.signal)
      .then((data) => {
        setLoaded({ key, status: "ready", data });
        setLastReady({ address, data });
      })
      .catch((err) => {
        if (!ac.signal.aborted) setLoaded({ key, status: "error", error: toDisplay(err) });
      });
    return () => ac.abort();
  }, [address, key]);

  let state: PortfolioState;
  if (!address) state = { status: "idle" };
  else if (loaded?.key === key) state = loaded.status === "ready" ? { ...loaded, refreshing: false } : loaded;
  else if (lastReady?.address === address) state = { status: "ready", data: lastReady.data, refreshing: true };
  else state = { status: "loading" };

  const current = state.status === "ready" && !state.refreshing ? state.data : null;
  const olderForKey = older?.key === key ? older : null;
  const cursor = olderForKey ? olderForKey.cursor : current?.activityCursor ?? null;

  const loadOlder = useCallback(() => {
    if (!address || !key || !cursor || olderForKey?.loading) return;
    setOlder({ key, items: olderForKey?.items ?? [], cursor, loading: true, error: null });
    fetchPortfolio(address, cursor)
      .then((page) =>
        setOlder((o) =>
          o?.key === key ? { key, items: [...o.items, ...page.activity], cursor: page.activityCursor, loading: false, error: null } : o,
        ),
      )
      .catch((err) => setOlder((o) => (o?.key === key ? { ...o, loading: false, error: toDisplay(err) } : o)));
  }, [address, key, cursor, olderForKey]);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  return {
    state,
    refresh: reload,
    retry: reload,
    activity: state.status === "ready" ? [...state.data.activity, ...(olderForKey?.items ?? [])] : [],
    hasOlder: Boolean(cursor),
    loadOlder,
    loadingOlder: olderForKey?.loading ?? false,
    olderError: olderForKey?.error ?? null,
  };
}
