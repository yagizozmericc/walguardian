/**
 * One illustrative scenario shared by every landing-page preview, so figures
 * agree across sections. Synthetic: no real wallet, price or user data.
 *
 * Wallet holds 182.40 SUI and 640 USDC. On Day 1 the user sets a 50 SUI
 * "Gas reserve". Later they simulate sending 95 SUI to a recipient this
 * wallet has never paid, which would push the reserve below its minimum.
 */
export const SCENARIO = {
  wallet: "0x7a3f…c41e",
  recipient: "0x91c2…7d0a",
  knownRecipient: "0x4be1…22f9",
  suiBalance: "182.40",
  usdc: "640.00",
  transfer: "95",
  suiAfter: "87.40",
  suiAfterWithGas: "87.3979",
  reserve: { name: "Gas reserve", minimum: "50", fundedAfter: "25.40", pctAfter: 51 },
  target: { name: "Hardware wallet", target: "120", funded: "62.00", pct: 52 },
  referencePrice: "$2.00",
  day1: "Oct 3, 2026",
  day1Iso: "2026-10-03",
  later: "Oct 21, 2026",
  model: "gemini-3.5-flash-lite",
} as const;

/** Verbatim from the transfer engine, so the preview matches the product. */
export const TRANSFER_DISCLAIMER =
  "Simulation only: nothing was signed or sent. Guardian cannot guarantee that a real transaction would succeed or that a recipient is safe.";
