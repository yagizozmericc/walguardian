"use client";

import { usePostResource } from "@/components/common/use-post-resource";
import type { SavingsEvaluation, SavingsGoal } from "@/modules/savings/savings.types";

/** Server-side evaluation of the current goals against the live wallet balance. */
export function useSavingsEvaluation(address: string | null, goals: SavingsGoal[]) {
  return usePostResource<SavingsEvaluation>("/api/savings/evaluate", address && goals.length ? { address, goals } : null);
}
