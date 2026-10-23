import { describe, expect, it } from "vitest";
import { ProviderError, ValidationError } from "@/lib/errors";
import {
  collectTransactionFrames,
  decodeCursor,
  encodeCursor,
  hasMoreHistory,
  normalizeBalances,
  normalizeCoinInfo,
  normalizeExecutedTransaction,
  normalizeServiceInfo,
} from "@/modules/blockchain/sui.normalize";
import {
  DEX_PACKAGE,
  SUI,
  WATCHED,
  listTransactionsFrames,
  outgoingSuiTransfer,
  swapViaMoveCall,
} from "./fixtures/sui-grpc.fixture";

describe("normalizeExecutedTransaction", () => {
  it("maps core fields, timestamps and net gas fee", () => {
    const tx = normalizeExecutedTransaction(outgoingSuiTransfer);
    expect(tx.digest).toBe(outgoingSuiTransfer.digest);
    expect(tx.sender).toBe(WATCHED);
    expect(tx.kind).toBe("programmable");
    expect(tx.success).toBe(true);
    expect(tx.checkpoint).toBe("250000123");
    expect(tx.timestampMs).toBe(1790000000500);
    expect(tx.gasFeeMist).toBe("2000000"); // 1_000_000 + 1_976_000 − 976_000
    expect(tx.balanceChanges).toHaveLength(2);
    expect(tx.balanceChanges[0]).toEqual({ address: WATCHED, coinType: SUI, amount: "-2502000000" });
  });

  it("extracts Move calls with normalized package IDs", () => {
    const tx = normalizeExecutedTransaction(swapViaMoveCall);
    expect(tx.moveCalls).toEqual([{ package: DEX_PACKAGE, module: "pool", function: "swap_exact_in" }]);
  });

  it("returns nulls rather than guesses when fields are absent", () => {
    const tx = normalizeExecutedTransaction({ digest: "x" });
    expect(tx).toMatchObject({ sender: null, success: null, gasFeeMist: null, timestampMs: null, kind: "unknown" });
  });

  it("rejects malformed payloads with a ProviderError", () => {
    expect(() => normalizeExecutedTransaction({ balance_changes: "nope" })).toThrow(ProviderError);
  });
});

describe("collectTransactionFrames", () => {
  it("collects items, keeps the last watermark cursor and end reason", () => {
    const r = collectTransactionFrames(listTransactionsFrames);
    expect(r.transactions.map((t) => t.digest)).toEqual([
      swapViaMoveCall.digest,
      "FIXTUREdigestIncoming222222222222222222222",
      outgoingSuiTransfer.digest,
    ]);
    expect([...r.lastCursor!]).toEqual([1, 2, 1]);
    expect(r.endReason).toBe("QUERY_END_REASON_ITEM_LIMIT");
  });

  it("handles a scan-limit frame with no item", () => {
    const r = collectTransactionFrames([
      { watermark: { cursor: Buffer.from([9]) }, end: { reason: "QUERY_END_REASON_SCAN_LIMIT" } },
    ]);
    expect(r.transactions).toEqual([]);
    expect(hasMoreHistory(r.endReason)).toBe(true);
  });

  it("treats tip and bound reasons as end of history", () => {
    expect(hasMoreHistory("QUERY_END_REASON_LEDGER_TIP")).toBe(false);
    expect(hasMoreHistory("QUERY_END_REASON_CHECKPOINT_BOUND")).toBe(false);
    expect(hasMoreHistory(null)).toBe(false);
  });
});

describe("cursor encoding", () => {
  it("round-trips bytes through base64url", () => {
    const bytes = new Uint8Array([0, 255, 17, 42]);
    expect([...decodeCursor(encodeCursor(bytes))]).toEqual([...bytes]);
  });
  it("rejects malformed cursors as validation errors", () => {
    expect(() => decodeCursor("not base64url!")).toThrow(ValidationError);
  });
});

describe("other normalizers", () => {
  it("normalizes balances and pagination token", () => {
    const r = normalizeBalances({ balances: [{ coin_type: "0x2::sui::SUI", balance: "5" }], next_page_token: Buffer.alloc(0) });
    expect(r.balances).toEqual([{ coinType: SUI, balance: "5" }]);
    expect(r.nextPageToken).toBeNull();
  });

  it("keeps unknown decimals as null", () => {
    expect(normalizeCoinInfo("0x2::sui::SUI", {}).decimals).toBeNull();
    expect(normalizeCoinInfo("0x2::sui::SUI", { metadata: { decimals: 9, symbol: "SUI" } })).toMatchObject({ decimals: 9, symbol: "SUI" });
  });

  it("requires a chain identity from GetServiceInfo", () => {
    expect(() => normalizeServiceInfo({})).toThrow(ProviderError);
    expect(normalizeServiceInfo({ chain_id: "abc", chain: "testnet", checkpoint_height: "10", epoch: "3" })).toMatchObject({
      chain: "testnet",
      checkpointHeight: "10",
    });
  });
});
