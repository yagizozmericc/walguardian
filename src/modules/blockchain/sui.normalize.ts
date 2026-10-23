import { normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { ProviderError, ValidationError } from "@/lib/errors";
import { normalizeCoinType } from "@/modules/portfolio/assets";
import type {
  BalanceChange,
  ChainInfo,
  CoinMetadata,
  MoveCallRef,
  NormalizedTransaction,
  RawBalance,
} from "./blockchain.types";

/**
 * Pure mapping from Sui gRPC v2 messages (as decoded by @grpc/proto-loader with
 * keepCase, longs=String, enums=String) into internal domain models. Every raw
 * shape is validated; unexpected payloads raise a ProviderError rather than
 * producing partial or invented data.
 */

const u64 = z.union([z.string(), z.number()]).transform((v) => String(v));

const TimestampSchema = z.object({ seconds: u64.optional(), nanos: z.number().optional() });

export const ServiceInfoSchema = z.object({
  chain_id: z.string().optional(),
  chain: z.string().optional(),
  epoch: u64.optional(),
  checkpoint_height: u64.optional(),
  lowest_available_checkpoint: u64.optional(),
  timestamp: TimestampSchema.optional(),
});

export const BalanceSchema = z.object({
  coin_type: z.string(),
  balance: u64.optional(),
});

export const ListBalancesResponseSchema = z.object({
  balances: z.array(BalanceSchema).default([]),
  next_page_token: z.instanceof(Uint8Array).optional(),
});

export const CoinInfoResponseSchema = z.object({
  coin_type: z.string().optional(),
  metadata: z
    .object({
      decimals: z.number().optional(),
      name: z.string().optional(),
      symbol: z.string().optional(),
    })
    .optional(),
});

const MoveCallSchema = z.object({
  package: z.string().optional(),
  module: z.string().optional(),
  function: z.string().optional(),
});

const CommandSchema = z.object({ move_call: MoveCallSchema.optional() });

export const ExecutedTransactionSchema = z.object({
  digest: z.string(),
  transaction: z
    .object({
      sender: z.string().optional(),
      kind: z
        .object({
          kind: z.string().optional(),
          programmable_transaction: z
            .object({ commands: z.array(CommandSchema).default([]) })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  effects: z
    .object({
      status: z.object({ success: z.boolean().optional() }).optional(),
      gas_used: z
        .object({
          computation_cost: u64.optional(),
          storage_cost: u64.optional(),
          storage_rebate: u64.optional(),
        })
        .optional(),
    })
    .optional(),
  checkpoint: u64.optional(),
  timestamp: TimestampSchema.optional(),
  balance_changes: z
    .array(z.object({ address: z.string(), coin_type: z.string(), amount: z.string() }))
    .default([]),
});

export const ListTransactionsFrameSchema = z.object({
  transaction: ExecutedTransactionSchema.optional(),
  watermark: z.object({ cursor: z.instanceof(Uint8Array).optional(), checkpoint: u64.optional() }).optional(),
  end: z.object({ reason: z.string().optional() }).optional(),
});

export type ListTransactionsFrame = z.infer<typeof ListTransactionsFrameSchema>;

function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ProviderError("tatum", "PROVIDER_ERROR", `Unexpected ${what} payload from Tatum: ${r.error.issues[0]?.message ?? "invalid"}`);
  }
  return r.data;
}

function timestampToMs(ts: z.infer<typeof TimestampSchema> | undefined): number | null {
  if (!ts?.seconds) return null;
  return Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1e6);
}

export function normalizeServiceInfo(raw: unknown): ChainInfo {
  const r = parse(ServiceInfoSchema, raw, "GetServiceInfo");
  if (!r.chain_id || !r.checkpoint_height) {
    throw new ProviderError("tatum", "PROVIDER_ERROR", "GetServiceInfo returned no chain identity.");
  }
  const ms = timestampToMs(r.timestamp);
  return {
    chainId: r.chain_id,
    chain: r.chain ?? "unknown",
    epoch: r.epoch ?? "0",
    checkpointHeight: r.checkpoint_height,
    lowestAvailableCheckpoint: r.lowest_available_checkpoint ?? null,
    timestamp: ms === null ? null : new Date(ms).toISOString(),
  };
}

export function normalizeBalances(raw: unknown): { balances: RawBalance[]; nextPageToken: Uint8Array | null } {
  const r = parse(ListBalancesResponseSchema, raw, "ListBalances");
  return {
    balances: r.balances.map((b) => ({ coinType: normalizeCoinType(b.coin_type), balance: b.balance ?? "0" })),
    nextPageToken: r.next_page_token && r.next_page_token.length > 0 ? r.next_page_token : null,
  };
}

export function normalizeCoinInfo(coinType: string, raw: unknown): CoinMetadata {
  const r = parse(CoinInfoResponseSchema, raw, "GetCoinInfo");
  return {
    coinType: normalizeCoinType(coinType),
    symbol: r.metadata?.symbol ?? null,
    name: r.metadata?.name ?? null,
    decimals: r.metadata?.decimals ?? null,
  };
}

const SYSTEM_KINDS = new Set([
  "CHANGE_EPOCH",
  "GENESIS",
  "CONSENSUS_COMMIT_PROLOGUE_V1",
  "CONSENSUS_COMMIT_PROLOGUE_V2",
  "CONSENSUS_COMMIT_PROLOGUE_V3",
  "CONSENSUS_COMMIT_PROLOGUE_V4",
  "AUTHENTICATOR_STATE_UPDATE",
  "END_OF_EPOCH",
  "RANDOMNESS_STATE_UPDATE",
  "PROGRAMMABLE_SYSTEM_TRANSACTION",
]);

export function normalizeExecutedTransaction(raw: unknown): NormalizedTransaction {
  const r = parse(ExecutedTransactionSchema, raw, "ExecutedTransaction");
  const kindName = r.transaction?.kind?.kind;
  const kind: NormalizedTransaction["kind"] =
    kindName === "PROGRAMMABLE_TRANSACTION" ? "programmable" : kindName && SYSTEM_KINDS.has(kindName) ? "system" : "unknown";

  const moveCalls: MoveCallRef[] = [];
  for (const c of r.transaction?.kind?.programmable_transaction?.commands ?? []) {
    const m = c.move_call;
    if (m?.package && m.module && m.function) {
      moveCalls.push({ package: normalizeSuiAddress(m.package), module: m.module, function: m.function });
    }
  }

  const gas = r.effects?.gas_used;
  const gasFeeMist =
    gas?.computation_cost !== undefined && gas.storage_cost !== undefined && gas.storage_rebate !== undefined
      ? (BigInt(gas.computation_cost) + BigInt(gas.storage_cost) - BigInt(gas.storage_rebate)).toString()
      : null;

  const balanceChanges: BalanceChange[] = r.balance_changes.map((b) => ({
    address: normalizeSuiAddress(b.address),
    coinType: normalizeCoinType(b.coin_type),
    amount: b.amount,
  }));

  return {
    digest: r.digest,
    checkpoint: r.checkpoint ?? null,
    timestampMs: timestampToMs(r.timestamp),
    sender: r.transaction?.sender ? normalizeSuiAddress(r.transaction.sender) : null,
    kind,
    success: r.effects?.status?.success ?? null,
    gasFeeMist,
    balanceChanges,
    moveCalls,
  };
}

export interface CollectedTransactions {
  transactions: NormalizedTransaction[];
  lastCursor: Uint8Array | null;
  endReason: string | null;
}

/** Folds a ListTransactions stream into transactions plus the resume cursor. */
export function collectTransactionFrames(rawFrames: unknown[]): CollectedTransactions {
  const transactions: NormalizedTransaction[] = [];
  let lastCursor: Uint8Array | null = null;
  let endReason: string | null = null;
  for (const raw of rawFrames) {
    const f = parse(ListTransactionsFrameSchema, raw, "ListTransactions frame");
    if (f.transaction) transactions.push(normalizeExecutedTransaction(f.transaction));
    if (f.watermark?.cursor && f.watermark.cursor.length > 0) lastCursor = f.watermark.cursor;
    if (f.end) endReason = f.end.reason ?? "QUERY_END_REASON_UNKNOWN";
  }
  return { transactions, lastCursor, endReason };
}

/** Item/scan limits mean more history may exist; every other end reason is terminal. */
export function hasMoreHistory(endReason: string | null): boolean {
  return endReason === "QUERY_END_REASON_ITEM_LIMIT" || endReason === "QUERY_END_REASON_SCAN_LIMIT";
}

export function encodeCursor(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function decodeCursor(cursor: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)) {
    throw new ValidationError("Malformed history cursor.");
  }
  return new Uint8Array(Buffer.from(cursor, "base64url"));
}
