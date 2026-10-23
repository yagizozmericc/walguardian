"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson, toDisplayError, type ResourceState } from "./use-api-resource";

/**
 * Debounced POST of a JSON body; re-runs whenever the body changes. While a
 * new result is pending, the previous one stays visible as "refreshing".
 */
export function usePostResource<T>(url: string, payload: unknown | null, debounceMs = 250) {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ key: string; state: ResourceState<T> } | null>(null);
  const body = payload === null ? null : JSON.stringify(payload);
  const key = body ? `${generation}:${body}` : null;

  useEffect(() => {
    if (!body || !key) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetchJson<T>(url, ac.signal, { method: "POST", body, headers: { "content-type": "application/json" } })
        .then((data) => setResult({ key, state: { status: "ready", data, refreshing: false } }))
        .catch((err) => {
          if (!ac.signal.aborted) setResult({ key, state: { status: "error", error: toDisplayError(err) } });
        });
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [url, body, key, debounceMs]);

  let state: ResourceState<T>;
  if (!body) state = { status: "idle" };
  else if (result?.key === key) state = result.state;
  else if (result?.state.status === "ready") state = { ...result.state, refreshing: true };
  else state = { status: "loading" };

  return { state, refresh: useCallback(() => setGeneration((g) => g + 1), []) };
}
