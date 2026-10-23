"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchJson, toDisplayError, type ResourceState } from "@/components/common/use-api-resource";
import type { GoalRepository } from "@/modules/savings/goal.repository";
import type { SavingsEvaluation, SavingsGoal } from "@/modules/savings/savings.types";

const EMPTY: SavingsGoal[] = [];

export function useGoals(repo: GoalRepository, owner: string | null) {
  const goals = useSyncExternalStore(
    repo.subscribe,
    () => (owner ? repo.list(owner) : EMPTY),
    () => EMPTY,
  );
  const save = useCallback((g: SavingsGoal) => owner && repo.save(owner, g), [repo, owner]);
  const remove = useCallback((id: string) => owner && repo.remove(owner, id), [repo, owner]);
  return { goals, save, remove };
}

/** Server-side evaluation of the current goals against the live wallet balance. */
export function useSavingsEvaluation(address: string | null, goals: SavingsGoal[]) {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ key: string; state: ResourceState<SavingsEvaluation> } | null>(null);
  const body = address && goals.length ? JSON.stringify({ address, goals }) : null;
  const key = body ? `${generation}:${body}` : null;

  useEffect(() => {
    if (!body || !key) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetchJson<SavingsEvaluation>("/api/savings/evaluate", ac.signal, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      })
        .then((data) => setResult({ key, state: { status: "ready", data, refreshing: false } }))
        .catch((err) => {
          if (!ac.signal.aborted) setResult({ key, state: { status: "error", error: toDisplayError(err) } });
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [body, key]);

  let state: ResourceState<SavingsEvaluation>;
  if (!body) state = { status: "idle" };
  else if (result?.key === key) state = result.state;
  else if (result?.state.status === "ready") state = { ...result.state, refreshing: true };
  else state = { status: "loading" };

  return { state, refresh: useCallback(() => setGeneration((g) => g + 1), []) };
}
