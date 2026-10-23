"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePostResource } from "@/components/common/use-post-resource";
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
  return usePostResource<SavingsEvaluation>("/api/savings/evaluate", address && goals.length ? { address, goals } : null);
}
