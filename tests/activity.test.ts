import { describe, expect, it } from "vitest";
import type { CoinMetadata } from "@/modules/blockchain/blockchain.types";
import { normalizeExecutedTransaction } from "@/modules/blockchain/sui.normalize";
import { deriveActivity } from "@/modules/portfolio/activity";
import { RECIPIENT, SENDER, SUI, USDC, WATCHED, incomingUsdc, outgoingSuiTransfer, swapViaMoveCall } from "./fixtures/sui-grpc.fixture";

const metadata = new Map<string, CoinMetadata>([
  [SUI, { coinType: SUI, symbol: "SUI", name: "Sui", decimals: 9 }],
  [USDC, { coinType: USDC, symbol: "USDC", name: "USDC", decimals: 6 }],
]);

describe("deriveActivity", () => {
  it("separates gas from the transferred SUI amount for the sender", () => {
    const a = deriveActivity(normalizeExecutedTransaction(outgoingSuiTransfer), WATCHED, metadata);
    expect(a.direction).toBe("out");
    expect(a.isSender).toBe(true);
    expect(a.transfers).toEqual([
      { coinType: SUI, symbol: "SUI", decimals: 9, rawAmount: "-2500000000", amount: "-2.5", gasExcluded: true },
    ]);
    expect(a.counterparties).toEqual([RECIPIENT]);
  });

  it("identifies incoming transfers and the paying counterparty", () => {
    const a = deriveActivity(normalizeExecutedTransaction(incomingUsdc), WATCHED, metadata);
    expect(a.direction).toBe("in");
    expect(a.transfers[0]).toMatchObject({ amount: "100", gasExcluded: false });
    expect(a.counterparties).toEqual([SENDER]);
  });

  it("classifies multi-asset changes as a swap", () => {
    const a = deriveActivity(normalizeExecutedTransaction(swapViaMoveCall), WATCHED, metadata);
    expect(a.direction).toBe("swap");
    expect(a.transfers.map((t) => t.amount).sort()).toEqual(["-10", "31"]);
    expect(a.moveCalls[0].function).toBe("swap_exact_in");
  });

  it("leaves amounts unformatted when decimals are unknown", () => {
    const a = deriveActivity(normalizeExecutedTransaction(incomingUsdc), WATCHED, new Map());
    expect(a.transfers[0]).toMatchObject({ amount: null, rawAmount: "100000000", symbol: null });
  });

  it("reports no direction when only gas moved", () => {
    const tx = normalizeExecutedTransaction({
      ...outgoingSuiTransfer,
      balance_changes: [{ address: WATCHED, coin_type: SUI, amount: "-2000000" }],
    });
    expect(deriveActivity(tx, WATCHED, metadata)).toMatchObject({ direction: "none", transfers: [] });
  });
});
