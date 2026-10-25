import "server-only";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { formatAmount } from "@/lib/format";
import { SavingsGoalSchema, type SavingsGoal } from "@/modules/savings/savings.types";
import { earmarkedRaw } from "@/modules/savings/savings.engine";
import { formatUnits } from "@/lib/units";
import { StrategySettingsSchema, type StrategySettings } from "@/modules/strategy/strategy.types";
import type { MemoryService } from "./memory.service";
import type { MemoryRecord } from "./memory.types";

/** Domain persistence on top of MemoryService. Every payload is re-validated on read. */

export interface Loaded<T> {
  items: T[];
  /** Records that exist but could not be used (invalid payload), never silently dropped from the count. */
  unreadable: number;
  expired: number;
  truncated: boolean;
}

// ---- Savings goals -------------------------------------------------------

export async function listGoals(s: MemoryService, wallet: string): Promise<Loaded<SavingsGoal & { memory: { id: string; blobId: string; createdAt: string; expiresAt: string | null } }>> {
  const { byEntity, list } = await s.current("goal", { wallet });
  let unreadable = 0;
  const items = [];
  for (const r of byEntity.values()) {
    const g = SavingsGoalSchema.safeParse(r.data);
    if (!g.success) {
      unreadable++;
      continue;
    }
    items.push({ ...g.data, memory: { id: r.id, blobId: r.blobId, createdAt: r.createdAt, expiresAt: r.expiresAt } });
  }
  return { items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), unreadable, expired: list.expired, truncated: list.truncated };
}

/** Prefix marking records created by the synthetic demo seeder (never real user data). */
export const SYNTHETIC_PREFIX = "[Synthetic demo]";
export const isSynthetic = (r: { summary: string }) => r.summary.startsWith(SYNTHETIC_PREFIX);

export async function saveGoal(s: MemoryService, wallet: string, goal: SavingsGoal, opts: { synthetic?: boolean } = {}): Promise<MemoryRecord> {
  const { byEntity } = await s.current("goal", { wallet });
  const prev = byEntity.get(`goal:${goal.id}`);
  const earmarked = formatAmount(formatUnits(earmarkedRaw(goal), goal.decimals));
  const unit = goal.symbol ?? "units";
  return s.write({
    kind: opts.synthetic ? "synthetic" : "goal",
    category: "goal",
    source: "user",
    entityId: `goal:${goal.id}`,
    wallet,
    supersedes: prev?.id ?? null,
    summary: `${opts.synthetic ? `${SYNTHETIC_PREFIX} ` : ""}${prev ? "Updated" : "New"} ${goal.kind === "reserve" ? "reserve" : "savings goal"} "${goal.name}": ${goal.kind === "reserve" ? "keep" : "reach"} ${formatAmount(goal.targetAmount)} ${unit}${goal.targetDate ? ` by ${goal.targetDate}` : ""}; ${earmarked} ${unit} earmarked.`,
    data: goal,
  });
}

export async function deleteGoal(s: MemoryService, wallet: string, goalId: string): Promise<MemoryRecord> {
  const { byEntity } = await s.current("goal", { wallet });
  const prev = byEntity.get(`goal:${goalId}`);
  if (!prev) throw new ValidationError("That goal was not found in memory.");
  const name = SavingsGoalSchema.safeParse(prev.data).success ? (prev.data as SavingsGoal).name : goalId;
  return s.write({ kind: "goal_delete", category: "goal", source: "user", entityId: `goal:${goalId}`, wallet, supersedes: prev.id, deleted: true, summary: `Deleted savings goal "${name}".`, data: { goalId } });
}

// ---- Strategy settings (investment preferences) --------------------------

export async function loadStrategy(s: MemoryService, wallet: string): Promise<{ settings: StrategySettings | null; memory: MemoryRecord | null }> {
  const { byEntity } = await s.current("profile", { wallet });
  const r = byEntity.get(`strategy:${wallet}`) ?? null;
  const parsed = r ? StrategySettingsSchema.safeParse(r.data) : null;
  return { settings: parsed?.success ? parsed.data : null, memory: parsed?.success ? r : null };
}

export async function saveStrategy(s: MemoryService, wallet: string, settings: StrategySettings, opts: { synthetic?: boolean } = {}): Promise<MemoryRecord> {
  const { memory } = await loadStrategy(s, wallet);
  const t = settings.targets;
  return s.write({
    kind: opts.synthetic ? "synthetic" : "strategy",
    category: "profile",
    source: "user",
    entityId: `strategy:${wallet}`,
    wallet,
    supersedes: memory?.id ?? null,
    summary: `${opts.synthetic ? `${SYNTHETIC_PREFIX} ` : ""}Investment preferences: ${t ? `targets SUI ${t.native}%, stablecoins ${t.stablecoin}%, other ${t.other}%` : "no targets"}; drift band ±${settings.driftBandPct}; risk ${settings.riskTolerance ?? "not set"}; horizon ${settings.horizon ?? "not set"}; ${settings.referencePrices.length} reference prices (user assumptions).`,
    data: settings,
  });
}

// ---- Protect feedback -----------------------------------------------------

export const FeedbackSchema = z.object({
  digest: z.string().min(20).max(64).regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Not a transaction digest."),
  verdict: z.enum(["expected", "suspicious", "unsure"]),
  note: z.string().trim().max(500).nullable(),
  /** Context captured at feedback time so later assessments can use it. */
  recipients: z.array(z.string().max(80)).max(20),
  packages: z.array(z.string().max(80)).max(20),
  transactionTimeMs: z.number().int().nullable(),
  score: z.number().int().min(0).max(100),
  critical: z.boolean(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export interface FeedbackMemory extends Feedback {
  memoryId: string;
  blobId: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function listFeedback(s: MemoryService, wallet: string): Promise<Loaded<FeedbackMemory>> {
  const { byEntity, list } = await s.current("security_decision", { wallet });
  let unreadable = 0;
  const items: FeedbackMemory[] = [];
  for (const r of byEntity.values()) {
    const f = FeedbackSchema.safeParse(r.data);
    if (!f.success) {
      unreadable++;
      continue;
    }
    items.push({ ...f.data, memoryId: r.id, blobId: r.blobId, createdAt: r.createdAt, expiresAt: r.expiresAt });
  }
  return { items, unreadable, expired: list.expired, truncated: list.truncated };
}

const VERDICT_TEXT = { expected: "expected activity", suspicious: "suspicious", unsure: "not sure" } as const;

export async function saveFeedback(s: MemoryService, wallet: string, f: Feedback): Promise<MemoryRecord> {
  const { byEntity } = await s.current("security_decision", { wallet });
  const prev = byEntity.get(`tx:${f.digest}`);
  return s.write({
    kind: "security_feedback",
    category: "security_decision",
    source: "user",
    entityId: `tx:${f.digest}`,
    wallet,
    supersedes: prev?.id ?? null,
    summary: `User marked transaction ${f.digest.slice(0, 10)}… (score ${f.score}) as ${VERDICT_TEXT[f.verdict]}${f.note ? `: "${f.note}"` : ""}.`,
    data: f,
  });
}

// ---- Investment decisions --------------------------------------------------

export const DecisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(500).nullable(),
  /** Short description of the scenario the decision refers to, e.g. "reduce SUI, increase USDC". */
  scenario: z.string().trim().min(1).max(300),
  targets: z.object({ native: z.string(), stablecoin: z.string(), other: z.string() }).nullable(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export async function listDecisions(s: MemoryService, wallet: string): Promise<Loaded<Decision & { memoryId: string; createdAt: string; expiresAt: string | null }>> {
  const list = await s.list("investment_decision", { wallet });
  let unreadable = 0;
  const items = [];
  for (const r of list.records) {
    const d = DecisionSchema.safeParse(r.data);
    if (!d.success) {
      unreadable++;
      continue;
    }
    items.push({ ...d.data, memoryId: r.id, createdAt: r.createdAt, expiresAt: r.expiresAt });
  }
  return { items, unreadable, expired: list.expired, truncated: list.truncated };
}

export async function saveDecision(s: MemoryService, wallet: string, d: Decision): Promise<MemoryRecord> {
  return s.write({
    kind: "investment_decision",
    category: "investment_decision",
    source: "user",
    entityId: `decision:${crypto.randomUUID()}`,
    wallet,
    summary: `User ${d.decision} the rebalancing scenario "${d.scenario}"${d.reason ? ` because "${d.reason}"` : ""}.`,
    data: d,
  });
}
