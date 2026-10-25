/**
 * Client-safe view of the memory write policy, so the UI can disable
 * operations the server would refuse and say why. The server enforces the
 * same rules in memory.policy.ts.
 */

export type WriteKind =
  | "security_feedback"
  | "transfer_decision"
  | "investment_decision"
  | "goal"
  | "goal_delete"
  | "strategy"
  | "note"
  | "synthetic"
  | "connectivity_check";

/** The only kinds a structured-only (public demo) provider accepts. */
export const STRUCTURED_KINDS: readonly WriteKind[] = ["security_feedback", "transfer_decision", "investment_decision", "connectivity_check"];

export interface WritePolicyView {
  provider: "walrus" | "mock" | "disabled";
  writes: { enabled: boolean; structuredOnly: boolean };
}

export type WriteAvailability = { allowed: true } | { allowed: false; reason: string };

const LABEL: Partial<Record<WriteKind, string>> = {
  goal: "Savings goals",
  goal_delete: "Savings goals",
  strategy: "Strategy settings and reference prices",
  note: "Notes",
};

export function writeAvailability(p: WritePolicyView | null | undefined, kind: WriteKind): WriteAvailability {
  const what = LABEL[kind] ?? "This record";
  if (!p) return { allowed: false, reason: "Checking where memories are stored…" };
  if (p.provider === "disabled") return { allowed: false, reason: `${what} cannot be saved because memory is not configured in this deployment.` };
  if (!p.writes.enabled) return { allowed: false, reason: `${what} cannot be saved because memory is read-only in this deployment.` };
  if (p.writes.structuredOnly && !STRUCTURED_KINDS.includes(kind)) {
    return {
      allowed: false,
      reason: `${what} are not saved in this public demo: it stores only predefined choices (security review verdicts, transfer decisions and rebalancing decisions) on Walrus Mainnet, never free-text or personal financial plans.`,
    };
  }
  return { allowed: true };
}
