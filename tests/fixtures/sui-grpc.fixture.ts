/**
 * FIXTURE — hand-written payloads shaped like Sui gRPC v2 messages as decoded
 * by @grpc/proto-loader (keepCase, longs=String, enums=String, oneofs=true).
 * Used only by unit tests. Never imported by application code.
 */

export const WATCHED = `0x${"a1".repeat(32)}`;
export const RECIPIENT = `0x${"b2".repeat(32)}`;
export const SENDER = `0x${"c3".repeat(32)}`;
export const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
export const USDC =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
export const DEX_PACKAGE = `0x${"d4".repeat(32)}`;

/** Watched address sends 2.5 SUI to RECIPIENT, paying 0.002 SUI gas. */
export const outgoingSuiTransfer = {
  digest: "FIXTUREdigestOutgoing111111111111111111111",
  _digest: "digest",
  transaction: {
    sender: WATCHED,
    kind: {
      kind: "PROGRAMMABLE_TRANSACTION",
      data: "programmable_transaction",
      programmable_transaction: {
        commands: [{ command: "split_coins", split_coins: {} }, { command: "transfer_objects", transfer_objects: {} }],
      },
    },
  },
  effects: {
    status: { success: true },
    gas_used: { computation_cost: "1000000", storage_cost: "1976000", storage_rebate: "976000" },
  },
  checkpoint: "250000123",
  timestamp: { seconds: "1790000000", nanos: 500_000_000 },
  balance_changes: [
    { address: WATCHED, coin_type: SUI, amount: "-2502000000" },
    { address: RECIPIENT, coin_type: SUI, amount: "2500000000" },
  ],
};

/** SENDER pays 100 USDC to the watched address. */
export const incomingUsdc = {
  digest: "FIXTUREdigestIncoming222222222222222222222",
  transaction: { sender: SENDER, kind: { kind: "PROGRAMMABLE_TRANSACTION", programmable_transaction: { commands: [] } } },
  effects: { status: { success: true }, gas_used: { computation_cost: "1", storage_cost: "0", storage_rebate: "0" } },
  checkpoint: "250000200",
  timestamp: { seconds: "1790000100" },
  balance_changes: [
    { address: SENDER, coin_type: USDC, amount: "-100000000" },
    { address: WATCHED, coin_type: USDC, amount: "100000000" },
  ],
};

/** Watched address swaps 10 SUI for 31 USDC through a DEX Move call. */
export const swapViaMoveCall = {
  digest: "FIXTUREdigestSwap33333333333333333333333333",
  transaction: {
    sender: WATCHED,
    kind: {
      kind: "PROGRAMMABLE_TRANSACTION",
      programmable_transaction: {
        commands: [{ move_call: { package: "0xd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", module: "pool", function: "swap_exact_in" } }],
      },
    },
  },
  effects: { status: { success: true }, gas_used: { computation_cost: "2000000", storage_cost: "0", storage_rebate: "0" } },
  checkpoint: "250000300",
  timestamp: { seconds: "1790000200" },
  balance_changes: [
    { address: WATCHED, coin_type: SUI, amount: "-10002000000" },
    { address: WATCHED, coin_type: USDC, amount: "31000000" },
  ],
};

export const listTransactionsFrames = [
  { transaction: swapViaMoveCall, watermark: { cursor: Buffer.from([1, 2, 3]), checkpoint: "250000300" } },
  { transaction: incomingUsdc, watermark: { cursor: Buffer.from([1, 2, 2]) } },
  {
    transaction: outgoingSuiTransfer,
    watermark: { cursor: Buffer.from([1, 2, 1]) },
    end: { reason: "QUERY_END_REASON_ITEM_LIMIT" },
  },
];
