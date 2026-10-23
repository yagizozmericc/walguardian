"use client";

import type { GoalRepository } from "@/modules/savings/goal.repository";
import { SavingsGoalSchema, type SavingsGoal } from "@/modules/savings/savings.types";

/**
 * TEMPORARY DEMO STORE. Goals live only in this browser tab (sessionStorage)
 * and are lost when the tab closes. This is not durable persistence and is
 * labelled as such everywhere it is used. Replaced by Walrus Memory in Phase 6.
 */

const PREFIX = "guardian.demo.goals.";
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; goals: SavingsGoal[] }>();

function readRaw(owner: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + owner);
  } catch {
    return memory.get(owner) ?? null;
  }
}

function writeRaw(owner: string, value: string) {
  try {
    window.sessionStorage.setItem(PREFIX + owner, value);
  } catch {
    memory.set(owner, value);
  }
  listeners.forEach((l) => l());
}

export const temporaryGoalStore: GoalRepository = {
  persistence: {
    kind: "temporary",
    label: "Temporary demo storage",
    detail:
      "Goals are kept only in this browser tab and are lost when it closes. They are not saved to Walrus Memory yet, because the Walrus Memory Testnet relayer is unavailable.",
  },
  list(owner) {
    const raw = readRaw(owner);
    const cached = snapshots.get(owner);
    if (cached && cached.raw === raw) return cached.goals;
    let goals: SavingsGoal[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        goals = Array.isArray(parsed) ? parsed.flatMap((g) => (SavingsGoalSchema.safeParse(g).success ? [g as SavingsGoal] : [])) : [];
      } catch {
        goals = [];
      }
    }
    snapshots.set(owner, { raw, goals });
    return goals;
  },
  save(owner, goal) {
    const goals = this.list(owner).filter((g) => g.id !== goal.id);
    writeRaw(owner, JSON.stringify([...goals, goal]));
  },
  remove(owner, goalId) {
    writeRaw(owner, JSON.stringify(this.list(owner).filter((g) => g.id !== goalId)));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
