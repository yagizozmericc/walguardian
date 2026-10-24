"use client";

import { useCallback, useState } from "react";
import { fetchJson, toDisplayError, useApiResource } from "@/components/common/use-api-resource";
import type { DisplayError } from "@/components/common/states";
import type { MemoryProviderInfo } from "@/modules/memory/memory.factory";
import type { SavingsGoal } from "@/modules/savings/savings.types";
import type { StrategySettings } from "@/modules/strategy/strategy.types";

export interface GoalsResponse {
  provider: MemoryProviderInfo;
  session: boolean;
  items: (SavingsGoal & { memory: { id: string; blobId: string; createdAt: string; expiresAt: string | null } })[];
  expired: number;
  unreadable: number;
  truncated: boolean;
}

export interface StrategyResponse {
  provider: MemoryProviderInfo;
  session: boolean;
  settings: StrategySettings | null;
  memory: { id: string; createdAt: string; expiresAt: string | null } | null;
}

const JSON_HEADERS = { "content-type": "application/json" };

function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<DisplayError | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(toDisplayError(err));
      return null;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, clearError: () => setError(null) };
}

/** Savings goals persisted in memory for the watched wallet. */
export function useMemoryGoals(address: string | null) {
  const { state, refresh } = useApiResource<GoalsResponse>(address ? `/api/memory/goals?address=${address}` : null);
  const m = useMutation();
  const save = useCallback(
    async (goal: SavingsGoal) => {
      const ok = await m.run(() => fetchJson("/api/memory/goals", undefined, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ address, goal }) }));
      if (ok) refresh();
      return Boolean(ok);
    },
    [address, m, refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      const ok = await m.run(() => fetchJson(`/api/memory/goals/${id}?address=${address}`, undefined, { method: "DELETE" }));
      if (ok) refresh();
      return Boolean(ok);
    },
    [address, m, refresh],
  );
  return { state, refresh, save, remove, saving: m.pending, mutationError: m.error, clearError: m.clearError };
}

/** Investment preferences persisted in memory for the watched wallet. */
export function useMemoryStrategy(address: string | null) {
  const { state, refresh } = useApiResource<StrategyResponse>(address ? `/api/memory/strategy?address=${address}` : null);
  const m = useMutation();
  const save = useCallback(
    async (settings: StrategySettings) => {
      const ok = await m.run(() => fetchJson("/api/memory/strategy", undefined, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ address, settings }) }));
      if (ok) refresh();
      return Boolean(ok);
    },
    [address, m, refresh],
  );
  return { state, refresh, save, saving: m.pending, mutationError: m.error };
}

export function usePostMemory<B>(url: string) {
  const m = useMutation();
  const post = useCallback(
    (body: B) => m.run(() => fetchJson<{ saved: boolean; memory: { id: string; blobId: string; provider: string } }>(url, undefined, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) })),
    [url, m],
  );
  return { post, pending: m.pending, error: m.error };
}
