import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatUnits } from "@/lib/units";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { listGoals, loadStrategy } from "@/modules/memory/memory.repositories";
import type { MemoryService } from "@/modules/memory/memory.service";
import { MEMORY_CATEGORIES } from "@/modules/memory/memory.types";
import { getPortfolioSnapshot } from "@/modules/portfolio/portfolio.service";
import { earmarkedRaw } from "@/modules/savings/savings.engine";
import { evaluateSavings } from "@/modules/savings/savings.service";
import type { SavingsGoal } from "@/modules/savings/savings.types";
import { loadReviewKnowledge } from "@/modules/security/security.memory";
import { getSecurityReport } from "@/modules/security/security.service";
import { defaultStrategySettings } from "@/modules/strategy/strategy.defaults";
import { evaluateStrategy } from "@/modules/strategy/strategy.service";
import { ModelAnswerSchema, MODEL_ANSWER_JSON_SCHEMA, type CopilotResponse } from "./ai.types";
import { buildContext, type ContextInputs } from "./context.builder";
import { deterministicSummary } from "./fallback";
import { GeminiProvider } from "./gemini.provider";
import type { LlmProvider } from "./llm.provider";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.templates";
import { CopilotRateLimiter } from "./rate-limit";
import { validateAnswer } from "./response.validator";

let llm: LlmProvider | null = null;
let limiter: CopilotRateLimiter | null = null;

export function getLlm(): LlmProvider | null {
  const cfg = env().llm;
  if (cfg.provider === "disabled") return null;
  llm ??= new GeminiProvider(cfg.apiKey, cfg.model);
  return llm;
}

function getLimiter(): CopilotRateLimiter {
  const cfg = env().llm;
  limiter ??= new CopilotRateLimiter(cfg.provider === "gemini" ? cfg.ratePerMinute : 6, cfg.provider === "gemini" ? cfg.ratePerDay : 100);
  return limiter;
}

const errText = (err: unknown) => (err instanceof AppError ? err.message : "unexpected error");

async function settle<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("copilot.context_gap", { section: label, message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: errText(err) };
  }
}

/** Gathers every source independently; a failing source becomes an explicit gap in the context. */
export async function gatherContext(address: string, question: string, memory: MemoryService | null): Promise<ContextInputs> {
  const provider = getSuiProvider();
  const memoryInfo = memoryProviderInfo();

  const goalsR = memory ? await settle("savings", () => listGoals(memory, address)) : null;
  const goals: SavingsGoal[] = goalsR?.ok ? goalsR.value.items : [];
  const strategyR = memory ? await settle("strategy", () => loadStrategy(memory, address)) : null;
  const settings = strategyR?.ok ? strategyR.value.settings : null;

  const earmarks = goals
    .map((g) => ({ coinType: g.coinType, amount: formatUnits(earmarkedRaw(g), g.decimals) }))
    .filter((e) => e.amount !== "0");

  const [portfolio, security, savingsEval, strategyEval, memories] = await Promise.all([
    settle("portfolio", () => getPortfolioSnapshot(provider, address, { activityLimit: 10 })),
    settle("security", async () => {
      const k = await loadReviewKnowledge(async () => memory, address);
      return getSecurityReport(provider, address, { memory: k.memory, feedback: k.feedback });
    }),
    goals.length ? settle("savings", () => evaluateSavings(provider, address, goals)) : Promise.resolve(null),
    settle("strategy", () => evaluateStrategy(provider, address, settings ?? defaultStrategySettings(), earmarks)),
    memory ? settle("memory", () => memory.relevant(question, MEMORY_CATEGORIES, { wallet: address, limit: 8 })) : Promise.resolve(null),
  ]);

  const memoryUnavailable = memoryInfo.provider === "disabled" ? memoryInfo.detail : "No memory session yet.";
  return {
    address,
    network: env().network,
    portfolio,
    security,
    savings:
      goalsR && !goalsR.ok
        ? { ok: false, error: goalsR.error }
        : !memory
          ? { ok: false, error: memoryUnavailable }
          : { ok: true, goals, value: savingsEval?.ok ? savingsEval.value : null },
    strategy: strategyEval.ok ? { ok: true, settings, value: strategyEval.value } : strategyEval,
    memories: memories === null ? { ok: false, error: memoryUnavailable } : memories.ok ? { ok: true, records: memories.value, provider: memoryInfo.label } : memories,
  };
}

export async function answerQuestion(opts: {
  address: string;
  question: string;
  history: { role: "user" | "assistant"; text: string }[];
  memory: MemoryService | null;
  rateKey: string;
}): Promise<CopilotResponse> {
  const ctx = buildContext(await gatherContext(opts.address, opts.question, opts.memory));
  const base = { sections: ctx.sections, generatedAt: new Date().toISOString() };
  const fallback = (reason: string, warnings: string[] = []): CopilotResponse => {
    const f = deterministicSummary(ctx, reason);
    return { mode: "deterministic", ...f, followUps: [], warnings, model: null, usage: null, ...base };
  };

  const model = getLlm();
  if (!model) return fallback("GEMINI_API_KEY is not configured");
  const rate = getLimiter().check(opts.rateKey);
  if (!rate.allowed) return fallback(`${rate.reason}; try again in ${rate.retryAfterS}s`);

  try {
    const r = await model.generateJson({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(opts.question, ctx, opts.history),
      schema: MODEL_ANSWER_JSON_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: env().llm.provider === "gemini" ? (env().llm as { maxOutputTokens: number }).maxOutputTokens : 1200,
    });
    const parsed = ModelAnswerSchema.safeParse(r.json);
    if (!parsed.success) return fallback("the model returned malformed output", ["The model response did not match the expected format."]);
    const v = validateAnswer(parsed.data, ctx);
    return { mode: "ai", ...v, model: r.model, usage: r.usage, ...base };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("copilot.llm_failed", { message: errText(err) });
    return fallback(errText(err));
  }
}
