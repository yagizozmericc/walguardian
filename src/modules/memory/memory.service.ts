import { principalTag } from "@/modules/session/session";
import { decodeMemory, encodeMemory } from "./memory.codec";
import type { MemoryClient } from "./memory.client";
import type { MemoryCategory, MemoryHistoryEntry, MemoryRecord, MemorySource } from "./memory.types";
import { MEMORY_CATEGORIES } from "./memory.types";

/**
 * Memory operations for one authenticated principal. Namespaces are derived
 * here from the server-side principal and never taken from a request. A write
 * is reported only after the provider confirms it with a blob id.
 */

const RECALL_LIMIT = 100;

export interface WriteInput {
  category: MemoryCategory;
  source: MemorySource;
  entityId: string;
  wallet: string | null;
  summary: string;
  data: unknown;
  supersedes?: string | null;
  deleted?: boolean;
}

export interface ListResult {
  records: MemoryRecord[];
  /** Expired records the provider still lists but no longer serves. */
  expired: number;
  /** True when more records exist than one recall returns. */
  truncated: boolean;
}

export class MemoryService {
  private readonly tag: string;

  constructor(
    private readonly client: MemoryClient,
    private readonly cfg: { namespacePrefix: string; network: "testnet" | "mainnet" },
    private readonly principalId: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.tag = principalTag(principalId);
  }

  get provider() {
    return this.client.kind;
  }

  namespace(category: MemoryCategory): string {
    return `${this.cfg.namespacePrefix}-${this.principalId}-${category}`;
  }

  async write(input: WriteInput): Promise<MemoryRecord> {
    const envelope = {
      v: 1 as const,
      id: crypto.randomUUID(),
      principal: this.tag,
      category: input.category,
      source: input.source,
      entityId: input.entityId,
      wallet: input.wallet,
      network: this.cfg.network,
      createdAt: this.now().toISOString(),
      supersedes: input.supersedes ?? null,
      deleted: input.deleted ?? false,
      data: input.data,
    };
    const text = encodeMemory(input.summary, envelope);
    const r = await this.client.rememberAndWait(text, this.namespace(input.category), { idempotencyKey: envelope.id });
    return { ...envelope, summary: input.summary, blobId: r.blob_id, expiresAt: null, provider: this.client.kind };
  }

  /** Records of one category for this principal (optionally one wallet), newest first. */
  async list(category: MemoryCategory, opts: { wallet?: string | null } = {}): Promise<ListResult> {
    const ns = this.namespace(category);
    const [recalled, listed] = await Promise.all([
      this.client.recall({ query: `guardian ${category.replace("_", " ")} memory`, namespace: ns, limit: RECALL_LIMIT, sort: "recent" }),
      this.client.listMemories({ namespace: ns }),
    ]);
    const meta = new Map(listed.memories.map((m) => [m.blob_id, m]));
    const nowMs = this.now().getTime();
    const records: MemoryRecord[] = [];
    for (const r of recalled.results) {
      const decoded = decodeMemory(r.text);
      if (!decoded || decoded.envelope.principal !== this.tag || decoded.envelope.category !== category) continue;
      const m = meta.get(r.blob_id);
      if (m?.expires_at && new Date(m.expires_at).getTime() <= nowMs) continue;
      if (opts.wallet !== undefined && decoded.envelope.wallet !== opts.wallet) continue;
      records.push({ ...decoded.envelope, summary: decoded.summary, blobId: r.blob_id, expiresAt: m?.expires_at ?? null, provider: this.client.kind });
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const active = listed.memories.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > nowMs).length;
    return {
      records,
      expired: listed.memories.length - active,
      truncated: active > recalled.results.length || listed.has_more,
    };
  }

  /** Latest record per entity (newest wins); entities whose latest record is a tombstone are omitted. */
  async current(category: MemoryCategory, opts: { wallet?: string | null } = {}): Promise<{ byEntity: Map<string, MemoryRecord>; list: ListResult }> {
    const list = await this.list(category, opts);
    return { byEntity: latestByEntity(list.records), list };
  }

  /** Every record this principal can see, with its status, across categories. */
  async history(): Promise<MemoryHistoryEntry[]> {
    const nowMs = this.now().getTime();
    const out: MemoryHistoryEntry[] = [];
    for (const category of MEMORY_CATEGORIES) {
      const ns = this.namespace(category);
      const [listed, recalled] = await Promise.all([
        this.client.listMemories({ namespace: ns }),
        this.client.recall({ query: `guardian ${category.replace("_", " ")} memory`, namespace: ns, limit: RECALL_LIMIT, sort: "recent" }),
      ]);
      const decodedByBlob = new Map<string, MemoryRecord>();
      for (const r of recalled.results) {
        const d = decodeMemory(r.text);
        if (d && d.envelope.principal === this.tag) {
          decodedByBlob.set(r.blob_id, { ...d.envelope, summary: d.summary, blobId: r.blob_id, expiresAt: null, provider: this.client.kind });
        }
      }
      const latest = latestByEntity([...decodedByBlob.values()], true);
      for (const m of listed.memories) {
        const expired = m.expires_at !== null && new Date(m.expires_at).getTime() <= nowMs;
        const record = decodedByBlob.get(m.blob_id) ?? null;
        const withExpiry = record ? { ...record, expiresAt: m.expires_at } : null;
        let status: MemoryHistoryEntry["status"] = "expired";
        if (!expired && record) status = record.deleted ? "deleted" : latest.get(record.entityId)?.id === record.id ? "current" : "superseded";
        out.push({ blobId: m.blob_id, status, createdAt: record?.createdAt ?? m.created_at, expiresAt: m.expires_at, record: withExpiry });
      }
    }
    return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }

  /** Memories most relevant to a question, for assessments and future AI explanations (provider ranking). */
  async relevant(query: string, categories: readonly MemoryCategory[], opts: { wallet?: string | null; limit?: number } = {}): Promise<MemoryRecord[]> {
    const limit = opts.limit ?? 8;
    const results: (MemoryRecord & { distance: number })[] = [];
    for (const category of categories) {
      const r = await this.client.recall({ query, namespace: this.namespace(category), limit, sort: "relevance" });
      for (const m of r.results) {
        const d = decodeMemory(m.text);
        if (!d || d.envelope.principal !== this.tag || d.envelope.deleted) continue;
        if (opts.wallet !== undefined && d.envelope.wallet !== opts.wallet) continue;
        results.push({ ...d.envelope, summary: d.summary, blobId: m.blob_id, expiresAt: null, provider: this.client.kind, distance: m.distance });
      }
    }
    return results
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((r) => {
        const record: MemoryRecord & { distance?: number } = { ...r };
        delete record.distance;
        return record;
      });
  }
}

/** Folds records (any order) to the latest per entity. Tombstones remove the entity unless `keepTombstones`. */
export function latestByEntity(records: MemoryRecord[], keepTombstones = false): Map<string, MemoryRecord> {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const map = new Map<string, MemoryRecord>();
  for (const r of sorted) {
    if (r.deleted && !keepTombstones) map.delete(r.entityId);
    else map.set(r.entityId, r);
  }
  return map;
}
