/** FIXTURE — synthetic savings goals for unit tests. Not user data. */
import type { SavingsGoal } from "@/modules/savings/savings.types";

export const USDC = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
export const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export function goal(over: Partial<SavingsGoal> & { earmark?: string } = {}): SavingsGoal {
  const { earmark, ...rest } = over;
  return {
    id: "goal-1",
    kind: "target",
    name: "Six-month savings",
    coinType: USDC,
    symbol: "USDC",
    decimals: 6,
    targetAmount: "2000",
    targetDate: "2026-07-01",
    monthlyContribution: null,
    notes: null,
    startDate: "2026-01-01",
    allocations: earmark === undefined ? [] : [{ id: "a1", date: "2026-01-01", delta: earmark }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}
