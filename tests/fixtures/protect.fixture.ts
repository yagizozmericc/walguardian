/**
 * FIXTURE — deterministic synthetic wallet history for Protect scoring tests
 * and the labelled scoring demo. Not real onchain data; never used by the
 * live application path.
 */
import type { ActivityItem } from "@/modules/portfolio/portfolio.types";

export const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
export const USDC = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
export const WALLET = `0x${"aa".repeat(32)}`;
export const KNOWN = [`0x${"b1".repeat(32)}`, `0x${"b2".repeat(32)}`, `0x${"b3".repeat(32)}`];
export const STRANGER = `0x${"ee".repeat(32)}`;
export const DEX = `0x${"d1".repeat(32)}`;
export const UNKNOWN_PKG = `0x${"f9".repeat(32)}`;

export const T0 = 1_790_000_000_000;
export const HOUR = 3_600_000;
export const SUI_UNIT = 1_000_000_000n;

let seq = 0;

export function tx(opts: {
  t: number;
  out?: { coinType?: string; sui: bigint | number }[];
  inbound?: { coinType?: string; sui: bigint | number };
  recipients?: string[];
  packages?: string[];
  isSender?: boolean;
  success?: boolean;
  digest?: string;
}): ActivityItem {
  const isSender = opts.isSender ?? true;
  const transfers = [
    ...(opts.out ?? []).map((o) => {
      const raw = -BigInt(Math.round(Number(o.sui) * 1e9));
      return { coinType: o.coinType ?? SUI, symbol: o.coinType === USDC ? "USDC" : "SUI", decimals: 9, rawAmount: raw.toString(), amount: null, gasExcluded: true };
    }),
    ...(opts.inbound
      ? [{ coinType: opts.inbound.coinType ?? SUI, symbol: "SUI", decimals: 9, rawAmount: BigInt(Math.round(Number(opts.inbound.sui) * 1e9)).toString(), amount: null, gasExcluded: false }]
      : []),
  ];
  const hasOut = (opts.out ?? []).length > 0;
  return {
    digest: opts.digest ?? `FIXTURE-${++seq}`,
    timestampMs: opts.t,
    checkpoint: null,
    success: opts.success ?? true,
    kind: "programmable",
    isSender,
    sender: isSender ? WALLET : STRANGER,
    direction: hasOut && opts.inbound ? "swap" : hasOut ? "out" : opts.inbound ? "in" : "none",
    transfers,
    counterparties: opts.recipients ?? [],
    recipients: hasOut ? (opts.recipients ?? []) : [],
    gasFeeMist: "1000000",
    moveCalls: (opts.packages ?? []).map((p) => ({ package: p, module: "pool", function: "swap" })),
  };
}

/** 20 regular SUI transfers (8–12 SUI), every 12 hours, to three known recipients, some via a DEX package. */
export function regularHistory(): ActivityItem[] {
  const amounts = [8, 9, 10, 11, 12];
  return Array.from({ length: 20 }, (_, i) =>
    tx({
      t: T0 + i * 12 * HOUR,
      out: [{ sui: amounts[i % amounts.length] }],
      recipients: [KNOWN[i % KNOWN.length]],
      packages: i % 4 === 0 ? [DEX] : [],
      digest: `FIXTURE-regular-${i}`,
    }),
  );
}

/** Time immediately after the regular history. */
export const NEXT_T = T0 + 20 * 12 * HOUR;

/** Balances before the candidate, with plenty of SUI unless overridden. */
export function balances(sui: number): Map<string, bigint> {
  return new Map([[SUI, BigInt(sui) * SUI_UNIT]]);
}
