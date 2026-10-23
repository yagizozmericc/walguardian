import type { SavingsGoal } from "./savings.types";

/**
 * Persistence boundary for savings goals. The savings engine never depends on
 * an implementation. Today the only implementation is a temporary, per-tab
 * demo store; the Walrus Memory implementation replaces it in Phase 6.
 */
export interface GoalRepository {
  /** Human-readable description of where goals live, shown in the UI. */
  readonly persistence: { kind: "temporary" | "walrus"; label: string; detail: string };
  list(owner: string): SavingsGoal[];
  save(owner: string, goal: SavingsGoal): void;
  remove(owner: string, goalId: string): void;
  subscribe(listener: () => void): () => void;
}
