/**
 * Deterministic scoring configuration for Protect. Changing any value here
 * changes scores, so bump RULES_VERSION and update the tests together.
 */
export const RULES_VERSION = "protect-rules/1";

export const RULE_CONFIG = {
  /** Minimum prior outgoing transfers of a coin before amounts are compared against its distribution. */
  minAmountSamples: 5,
  /** Minimum prior outgoing transfers before recipient/asset novelty is meaningful. */
  minOutgoingForNovelty: 5,
  /** Minimum prior sent transactions before first-time package use is meaningful. */
  minSentForPackages: 5,
  /** Minimum baseline span, in days, before frequency is compared. */
  minFrequencySpanDays: 3,

  unusualAmount: {
    /** Amount relative to the coin's p95, in percent; first matching tier wins. */
    tiers: [
      { abovePct: 500, points: 35 },
      { abovePct: 200, points: 25 },
      { abovePct: 100, points: 15 },
    ],
  },
  newRecipient: {
    /** Scaled down by the wallet's own recipient novelty rate. */
    maxPoints: 20,
  },
  frequency: {
    windowMs: 24 * 60 * 60 * 1000,
    minCount: 3,
    tiers: [
      { z: 4, points: 20 },
      { z: 2.5, points: 10 },
    ],
  },
  newPackage: { points: 15 },
  largeOutflow: {
    /** Share of the coin balance held immediately before the transaction. */
    tiers: [
      { atLeastPct: 80, points: 40, critical: true },
      { atLeastPct: 50, points: 30, critical: false },
      { atLeastPct: 25, points: 15, critical: false },
    ],
  },
  newAsset: { points: 10 },
  /** An amount this far above p95 sent to a never-seen recipient is treated as critical. */
  criticalAmountToNewRecipientPct: 500,

  severity: { high: 60, medium: 30 },
  confidence: { low: 5, medium: 15, high: 40 },
} as const;

/** Sui framework packages (std, sui, sui_system) are universal and not counted as "new package" use. */
export const FRAMEWORK_PACKAGES = new Set([
  `0x${"0".repeat(63)}1`,
  `0x${"0".repeat(63)}2`,
  `0x${"0".repeat(63)}3`,
]);
