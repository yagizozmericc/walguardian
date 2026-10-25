import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemWalMock } from "@mysten-incubation/memwal";
import type { MemoryClient } from "./memory.client";

/**
 * DEVELOPMENT MOCK — NOT WALRUS. Wraps the SDK's official `MemWalMock` (same
 * method names and result shapes as `MemWal`) and records writes in a local,
 * git-ignored JSON file so application restarts can be exercised. Expiry is
 * simulated (default 28 days; the real lifetime is set by the relayer, ~6 weeks
 * by default on Mainnet); expired records stop
 * being recalled, like blobs pruned by the relayer, but remain listed.
 * Selected only by MEMORY_PROVIDER=mock and labelled as mock everywhere.
 */

interface StoredRecord {
  blobId: string;
  namespace: string;
  text: string;
  createdAt: string;
  expiresAt: string;
  idempotencyKey: string;
}

interface MockState {
  version: 1;
  note: string;
  records: StoredRecord[];
}

const NOTE = "Guardian development mock memory. Not Walrus. Safe to delete.";

export class MockMemoryClient implements MemoryClient {
  readonly kind = "mock" as const;
  private state: MockState | null = null;
  private sdk: MemWalMock | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly ttlDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private isExpired(r: StoredRecord) {
    return new Date(r.expiresAt).getTime() <= this.now().getTime();
  }

  private async load(): Promise<{ state: MockState; sdk: MemWalMock }> {
    if (this.state && this.sdk) return { state: this.state, sdk: this.sdk };
    let state: MockState = { version: 1, note: NOTE, records: [] };
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as MockState;
      if (parsed?.version === 1 && Array.isArray(parsed.records)) state = parsed;
    } catch {
      // No file yet (first run) or unreadable: start empty.
    }
    this.state = state;
    this.sdk = MemWalMock.create({
      owner: "mock-owner",
      initialMemories: state.records.filter((r) => !this.isExpired(r)).map((r) => ({ text: r.text, namespace: r.namespace, blobId: r.blobId })),
    });
    return { state, sdk: this.sdk };
  }

  private persist(state: MockState) {
    this.writes = this.writes.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 1));
      await rename(tmp, this.file);
    });
    return this.writes;
  }

  async rememberAndWait(text: string, namespace: string, opts: { idempotencyKey: string }) {
    const { state, sdk } = await this.load();
    const existing = state.records.find((r) => r.idempotencyKey === opts.idempotencyKey && r.namespace === namespace);
    if (existing) return { blob_id: existing.blobId, namespace };
    const r = await sdk.rememberAndWait(text, namespace, { idempotencyKey: opts.idempotencyKey });
    const createdAt = this.now();
    state.records.push({
      blobId: r.blob_id,
      namespace,
      text,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlDays * 86_400_000).toISOString(),
      idempotencyKey: opts.idempotencyKey,
    });
    await this.persist(state);
    return { blob_id: r.blob_id, namespace };
  }

  async recall(params: { query: string; namespace: string; limit: number; sort?: "recent" | "relevance" }) {
    const { state, sdk } = await this.load();
    const r = await sdk.recall({ query: params.query, namespace: params.namespace, limit: params.limit, sort: params.sort });
    const byBlob = new Map(state.records.map((x) => [x.blobId, x]));
    return {
      results: r.results
        .filter((m) => {
          const rec = byBlob.get(m.blob_id);
          return rec !== undefined && !this.isExpired(rec);
        })
        .map((m) => ({ blob_id: m.blob_id, text: m.text, distance: m.distance, created_at: byBlob.get(m.blob_id)!.createdAt })),
    };
  }

  async listMemories(opts: { namespace: string }) {
    const { state } = await this.load();
    return {
      memories: state.records
        .filter((r) => r.namespace === opts.namespace)
        .map((r) => ({ blob_id: r.blobId, namespace_id: r.namespace, created_at: r.createdAt, expires_at: r.expiresAt, status: this.isExpired(r) ? "expired" : "active" })),
      next_cursor: null,
      has_more: false,
    };
  }

  async health() {
    await this.load();
    return { status: "ok", detail: `development mock (${this.file}); not Walrus` };
  }
}
