/**
 * The subset of the official MemWal SDK client that Guardian uses. Both the
 * real Walrus adapter and the development mock implement exactly this shape,
 * mirroring `MemWal` method names and result fields, so switching providers is
 * a configuration change, not a code change.
 */

export interface RememberOutcome {
  blob_id: string;
  namespace: string;
}

export interface RecalledMemory {
  blob_id: string;
  text: string;
  distance: number;
  created_at?: string;
}

export interface ListedMemory {
  blob_id: string;
  namespace_id: string;
  created_at: string;
  expires_at: string | null;
  status: string;
}

export interface MemoryClient {
  readonly kind: "walrus" | "mock";
  rememberAndWait(text: string, namespace: string, opts: { idempotencyKey: string }): Promise<RememberOutcome>;
  recall(params: { query: string; namespace: string; limit: number; sort?: "recent" | "relevance" }): Promise<{ results: RecalledMemory[] }>;
  listMemories(opts: { namespace: string; cursor?: string }): Promise<{ memories: ListedMemory[]; next_cursor: string | null; has_more: boolean }>;
  health(): Promise<{ status: string; detail: string }>;
}
