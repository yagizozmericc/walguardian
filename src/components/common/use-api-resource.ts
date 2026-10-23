"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisplayError } from "@/components/common/states";
import type { ApiErrorBody } from "@/lib/errors";

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: DisplayError }
  | { status: "ready"; data: T; refreshing: boolean };

export async function fetchJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal, cache: "no-store" });
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
  return body as T;
}

export function toDisplayError(err: unknown): DisplayError {
  const d = (err as { display?: DisplayError }).display;
  return d ?? { message: err instanceof Error ? err.message : "Network error." };
}

/**
 * Loads a JSON API resource. `refresh()` re-requests with `fresh=1` so the
 * server bypasses its short cache. Errors are surfaced, never replaced.
 */
export function useApiResource<T>(url: string | null) {
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; state: ResourceState<T> } | null>(null);
  const [last, setLast] = useState<{ url: string; data: T } | null>(null);
  const key = url ? `${url}#${generation}` : null;

  useEffect(() => {
    if (!url || !key) return;
    const ac = new AbortController();
    const target = generation > 0 ? `${url}${url.includes("?") ? "&" : "?"}fresh=1` : url;
    fetchJson<T>(target, ac.signal)
      .then((data) => {
        setLoaded({ key, state: { status: "ready", data, refreshing: false } });
        setLast({ url, data });
      })
      .catch((err) => {
        if (!ac.signal.aborted) setLoaded({ key, state: { status: "error", error: toDisplayError(err) } });
      });
    return () => ac.abort();
  }, [url, key, generation]);

  let state: ResourceState<T>;
  if (!url) state = { status: "idle" };
  else if (loaded?.key === key) state = loaded.state;
  else if (last?.url === url) state = { status: "ready", data: last.data, refreshing: true };
  else state = { status: "loading" };

  return { state, refresh: useCallback(() => setGeneration((g) => g + 1), []) };
}
