import "server-only";
import { todayUtc } from "@/lib/dates";
import { listGoals, loadStrategy, saveGoal, saveStrategy, SYNTHETIC_PREFIX, isSynthetic } from "@/modules/memory/memory.repositories";
import type { MemoryService } from "@/modules/memory/memory.service";
import { SYNTHETIC_GOAL_IDS, SYNTHETIC_NOTE, SYNTHETIC_NOTE_ENTITY, syntheticGoals, syntheticStrategy } from "./synthetic";

export interface SyntheticResult {
  created: string[];
  skipped: string[];
}

/** Seeds labelled synthetic records for this session and wallet. Idempotent; never overwrites the user's own settings. */
export async function seedSynthetic(s: MemoryService, wallet: string, now = new Date()): Promise<SyntheticResult> {
  const today = todayUtc(now.getTime());
  const iso = now.toISOString();
  const created: string[] = [];
  const skipped: string[] = [];

  const existing = new Set((await listGoals(s, wallet)).items.map((g) => g.id));
  for (const g of syntheticGoals(today, iso)) {
    if (existing.has(g.id)) skipped.push(`goal ${g.name} (already present)`);
    else {
      await saveGoal(s, wallet, g, { synthetic: true });
      created.push(`goal ${g.name}`);
    }
  }

  const strategy = await loadStrategy(s, wallet);
  if (!strategy.memory) {
    await saveStrategy(s, wallet, syntheticStrategy(today, iso), { synthetic: true });
    created.push("investment preferences and reference prices");
  } else {
    skipped.push(isSynthetic(strategy.memory) ? "investment preferences (already present)" : "investment preferences (your own settings are kept)");
  }

  const { byEntity } = await s.current("reasoning", { wallet });
  if (byEntity.has(SYNTHETIC_NOTE_ENTITY)) skipped.push("note (already present)");
  else {
    await s.write({ kind: "synthetic", category: "reasoning", source: "user", entityId: SYNTHETIC_NOTE_ENTITY, wallet, summary: `${SYNTHETIC_PREFIX} User note: ${SYNTHETIC_NOTE}`, data: { text: SYNTHETIC_NOTE, synthetic: true } });
    created.push("note");
  }
  return { created, skipped };
}

/** Hides synthetic records with deletion records. Unrelated records are untouched; Walrus cannot erase early. */
export async function resetSynthetic(s: MemoryService, wallet: string): Promise<SyntheticResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  const goals = await s.current("goal", { wallet });
  for (const id of SYNTHETIC_GOAL_IDS) {
    const r = goals.byEntity.get(`goal:${id}`);
    if (!r) continue;
    await s.write({ kind: "synthetic", category: "goal", source: "system", entityId: `goal:${id}`, wallet, supersedes: r.id, deleted: true, summary: `${SYNTHETIC_PREFIX} Removed synthetic goal.`, data: { goalId: id } });
    created.push(`removed goal ${id}`);
  }
  const strategy = await loadStrategy(s, wallet);
  if (strategy.memory && isSynthetic(strategy.memory)) {
    await s.write({ kind: "synthetic", category: "profile", source: "system", entityId: `strategy:${wallet}`, wallet, supersedes: strategy.memory.id, deleted: true, summary: `${SYNTHETIC_PREFIX} Removed synthetic investment preferences.`, data: {} });
    created.push("removed investment preferences");
  } else if (strategy.memory) skipped.push("investment preferences (your own settings are kept)");
  const notes = await s.current("reasoning", { wallet });
  const note = notes.byEntity.get(SYNTHETIC_NOTE_ENTITY);
  if (note) {
    await s.write({ kind: "synthetic", category: "reasoning", source: "system", entityId: SYNTHETIC_NOTE_ENTITY, wallet, supersedes: note.id, deleted: true, summary: `${SYNTHETIC_PREFIX} Removed synthetic note.`, data: {} });
    created.push("removed note");
  }
  return { created, skipped };
}
