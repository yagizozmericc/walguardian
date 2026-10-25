import { createHash } from "node:crypto";
import { z } from "zod";
import type { MemoryWriteConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { Kv } from "@/lib/kv";
import { logger } from "@/lib/logger";
import { MAX_TYPE_TAG_LENGTH, isCanonicalStructTag } from "@/lib/sui-type";
import { consumeLimits } from "@/lib/rate-limit";
import type { WriteKind } from "./memory.capabilities";

/**
 * Write controls for memory, enforced in MemoryService.write so no route can
 * bypass them:
 *  1. a switch (the remote provider is read-only unless enabled),
 *  2. a structured-only policy for the public demo: predefined choices about
 *     server-derived context, never free text,
 *  3. per-session and global daily quotas on the shared store.
 */

export type { WriteKind } from "./memory.capabilities";

const ADDRESS = /^0x[0-9a-f]{64}$/;
const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{20,64}$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
// Mirrors describeScenario(): "reduce A[, B]; increase C" over the fixed class names, or "no change".
const CLASSES = "(?:SUI|stablecoins|other assets)";
const SCENARIO = new RegExp(`^(?:no change|(?:reduce ${CLASSES}(?:, ${CLASSES})*)?(?:; )?(?:increase ${CLASSES}(?:, ${CLASSES})*)?)$`);

/** The only records a structured-only provider accepts. Free-text fields must be null. */
const STRUCTURED: Partial<Record<WriteKind, z.ZodType>> = {
  security_feedback: z
    .object({
      digest: z.string().regex(DIGEST),
      verdict: z.enum(["expected", "suspicious", "unsure"]),
      note: z.null({ error: "Notes are not stored in this deployment." }),
      recipients: z.array(z.string().regex(ADDRESS)).max(20),
      packages: z.array(z.string().regex(ADDRESS)).max(20),
      transactionTimeMs: z.number().int().nullable(),
      score: z.number().int().min(0).max(100),
      critical: z.boolean(),
    })
    .strict(),
  transfer_decision: z
    .object({
      recipient: z.string().regex(ADDRESS),
      coinType: z.string().max(MAX_TYPE_TAG_LENGTH).refine(isCanonicalStructTag, "Not a canonical Sui coin type."),
      amount: z.string().regex(/^\d{1,30}(\.\d{1,30})?$/),
      decision: z.enum(["would_proceed", "would_not_proceed"]),
      note: z.null({ error: "Notes are not stored in this deployment." }),
    })
    .strict(),
  investment_decision: z
    .object({
      decision: z.enum(["accepted", "rejected"]),
      reason: z.null({ error: "Reasons are not stored in this deployment." }),
      scenario: z.string().regex(SCENARIO, "Unrecognised scenario."),
      targets: z.object({ native: z.string().regex(PERCENT), stablecoin: z.string().regex(PERCENT), other: z.string().regex(PERCENT) }).strict().nullable(),
    })
    .strict(),
  // The operator's one-off connectivity check (scripts/check-walrus.ts): a fixed, synthetic record.
  connectivity_check: z.object({ synthetic: z.literal(true), at: z.iso.datetime() }).strict(),
};

/** Kinds with a structured schema; must equal STRUCTURED_KINDS in memory.capabilities (tested). */
export const structuredPolicyKinds = (): WriteKind[] => Object.keys(STRUCTURED) as WriteKind[];

export const STRUCTURED_ONLY_DETAIL =
  "This public demo stores only predefined choices: security review verdicts, transfer decisions and rebalancing decisions. Notes, goals and other free text are not stored.";

export interface WriteGuard {
  beforeWrite(input: { kind: WriteKind; data: unknown }, principalId: string): Promise<void>;
}

/** A burst ceiling on top of the daily quotas. */
const WRITES_PER_MINUTE_SESSION = 6;
const WRITES_PER_MINUTE_GLOBAL = 60;

export function createWriteGuard(cfg: MemoryWriteConfig, opts: { remote: boolean; kv: () => Kv }): WriteGuard {
  return {
    async beforeWrite(input, principalId) {
      if (!cfg.enabled) {
        throw new AppError("MEMORY_READ_ONLY", "Memory is read-only in this deployment. Nothing was saved.", 403);
      }
      if (cfg.structuredOnly) {
        const schema = STRUCTURED[input.kind];
        if (!schema) throw new AppError("MEMORY_POLICY", `${STRUCTURED_ONLY_DETAIL} Nothing was saved.`, 403);
        const parsed = schema.safeParse(input.data);
        if (!parsed.success) {
          throw new AppError("MEMORY_POLICY", `${parsed.error.issues[0]?.message ?? "This record is not allowed."} Nothing was saved.`, 403);
        }
      }

      const { store, shared } = opts.kv();
      // A remote (Walrus) write is only made under quotas every instance enforces.
      if (opts.remote && !shared) {
        throw new AppError("MEMORY_QUOTA", "Memory writes need the shared quota store, which is not configured. Nothing was saved.", 503);
      }
      const session = createHash("sha256").update(principalId).digest("hex").slice(0, 24);
      let r;
      try {
        r = await consumeLimits(store, "memwrite", [
          { id: `s:${session}`, perMinute: WRITES_PER_MINUTE_SESSION, perDay: cfg.perSessionDay },
          { id: "global", perMinute: WRITES_PER_MINUTE_GLOBAL, perDay: cfg.globalDay },
        ]);
      } catch (err) {
        logger.warn("kv.memory_quota_unavailable", { message: err instanceof Error ? err.message : String(err) });
        throw new AppError("MEMORY_QUOTA", "Memory writes are paused because the quota store is unavailable. Nothing was saved.", 503);
      }
      if (!r.allowed) {
        throw new AppError("MEMORY_QUOTA", `Memory write limit reached (${r.reason}). Try again in ${r.retryAfterS}s. Nothing was saved.`, 429);
      }
    },
  };
}
