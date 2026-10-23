import "server-only";
import { todayUtc } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import type { SuiTatumProvider } from "@/modules/blockchain/sui.adapter";
import { normalizeCoinType } from "@/modules/portfolio/assets";
import { evaluateGoals, validateGoalAmounts } from "./savings.engine";
import type { SavingsEvaluation, SavingsGoal } from "./savings.types";

/**
 * Evaluates goals for an address. The goals come from the caller (the
 * persistence layer is separate); this service verifies each asset's decimals
 * against onchain metadata and checks earmarks against the live balance.
 */
export async function evaluateSavings(
  provider: SuiTatumProvider,
  address: string,
  input: SavingsGoal[],
): Promise<SavingsEvaluation> {
  const goals = input.map((g) => ({ ...g, coinType: normalizeCoinType(g.coinType) }));

  const problems = goals.flatMap((g) => validateGoalAmounts(g).map((p) => `${g.name}: ${p}`));
  if (problems.length) throw new ValidationError(problems.join(" "), { problems });

  await provider.assertNetwork();
  for (const coinType of new Set(goals.map((g) => g.coinType))) {
    const meta = await provider.getCoinMetadata(coinType);
    const mismatch = goals.find((g) => g.coinType === coinType && g.decimals !== meta.decimals);
    if (meta.decimals === null) throw new ValidationError(`Decimals for ${coinType} are not published onchain; it cannot be used for a goal.`);
    if (mismatch) throw new ValidationError(`${mismatch.name}: asset decimals (${mismatch.decimals}) do not match onchain metadata (${meta.decimals}).`);
  }

  const balances = new Map((await provider.getBalances(address)).map((b) => [b.coinType, BigInt(b.balance)]));
  const asOf = todayUtc();
  const { goals: evaluated, coverage } = evaluateGoals(goals, asOf, balances);
  const source = provider.source();
  return {
    address,
    asOf,
    goals: evaluated,
    coverage,
    source: { provider: "tatum", network: source.network, fetchedAt: source.fetchedAt },
  };
}
