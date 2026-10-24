import { z } from "zod";

/**
 * Memory records. Walrus Memory stores free text with semantic recall; the
 * structured fields below live in a versioned envelope inside that text
 * (see memory.codec.ts). These are application contracts, not native Walrus
 * fields.
 */

export const MEMORY_CATEGORIES = [
  "profile",
  "goal",
  "behavior",
  "security_decision",
  "investment_decision",
  "reasoning",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_SOURCES = ["user", "system", "ai"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const EnvelopeSchema = z.object({
  v: z.literal(1),
  /** Application record id (stable across supersession chains via entityId). */
  id: z.string().min(1).max(64),
  /** Hash of the owning principal; checked on decode as a second isolation layer. */
  principal: z.string().regex(/^[0-9a-f]{16}$/),
  category: z.enum(MEMORY_CATEGORIES),
  source: z.enum(MEMORY_SOURCES),
  /** What the record is about, e.g. "goal:<id>", "tx:<digest>", "strategy:<address>". */
  entityId: z.string().min(1).max(200),
  wallet: z.string().max(80).nullable(),
  network: z.enum(["testnet", "mainnet"]),
  createdAt: z.string().datetime(),
  supersedes: z.string().max(64).nullable(),
  /** A tombstone: the entity was deleted by the user. Earlier blobs remain until they expire. */
  deleted: z.boolean(),
  data: z.unknown(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export type MemoryProviderKind = "walrus" | "mock";

export interface MemoryRecord extends Envelope {
  /** Human-readable sentence stored ahead of the envelope (used for semantic recall). */
  summary: string;
  blobId: string;
  /** Expiry reported by the provider (simulated for the mock); null if unknown. */
  expiresAt: string | null;
  provider: MemoryProviderKind;
}

export type RecordStatus = "current" | "superseded" | "deleted" | "expired";

export interface MemoryHistoryEntry {
  blobId: string;
  status: RecordStatus;
  createdAt: string | null;
  expiresAt: string | null;
  record: MemoryRecord | null;
}
