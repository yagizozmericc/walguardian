import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { ProviderError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { LlmProvider, LlmRequest, LlmResponse } from "./llm.provider";

/**
 * Gemini via the official @google/genai SDK. Server-only: the key is read from
 * validated env and never leaves this module. Error messages are scrubbed of
 * the key before they are logged or returned.
 */

const TIMEOUT_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mapGeminiError(err: unknown, scrub: (s: string) => string): ProviderError {
  const status = err instanceof ApiError ? err.status : undefined;
  const msg = scrub(err instanceof Error ? err.message : String(err)).slice(0, 200);
  if (status === 401 || status === 403) return new ProviderError("llm", "PROVIDER_UNAUTHORIZED", "The Gemini API rejected the key (check GEMINI_API_KEY).");
  if (status === 429) return new ProviderError("llm", "PROVIDER_RATE_LIMITED", "Gemini free-tier rate limit reached; try again shortly.", true);
  if (status === 404) return new ProviderError("llm", "PROVIDER_UNSUPPORTED", `The configured model is not available to this key (${msg}).`);
  if (status !== undefined && status >= 500) return new ProviderError("llm", "PROVIDER_UNAVAILABLE", `Gemini is temporarily unavailable (${status}).`, true);
  if (/timeout|timed out|abort|fetch failed|ECONN|ENOTFOUND/i.test(msg)) return new ProviderError("llm", "PROVIDER_UNAVAILABLE", "Gemini did not respond in time.", true);
  return new ProviderError("llm", "PROVIDER_ERROR", `Gemini request failed${status ? ` (${status})` : ""}: ${msg}`);
}

export class GeminiProvider implements LlmProvider {
  readonly id = "gemini" as const;
  private readonly ai: GoogleGenAI;
  private readonly scrub: (s: string) => string;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS } });
    this.scrub = (s) => (apiKey ? s.split(apiKey).join("[redacted]") : s);
  }

  async generateJson(req: LlmRequest): Promise<LlmResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.ai.models.generateContent({
          model: this.model,
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: req.schema,
            temperature: 0.2,
            maxOutputTokens: req.maxOutputTokens,
          },
        });
        const text = r.text ?? "";
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new ProviderError("llm", "PROVIDER_ERROR", "The model returned a response that is not valid JSON.");
        }
        return {
          json,
          model: r.modelVersion ?? this.model,
          usage: { inputTokens: r.usageMetadata?.promptTokenCount ?? null, outputTokens: r.usageMetadata?.candidatesTokenCount ?? null },
        };
      } catch (err) {
        const mapped = err instanceof ProviderError ? err : mapGeminiError(err, this.scrub);
        if (!mapped.retryable || attempt >= 1) throw mapped;
        logger.warn("llm.retry", { model: this.model, code: mapped.code });
        await sleep(1500);
      }
    }
  }

  async health() {
    try {
      const m = await this.ai.models.get({ model: this.model });
      return { ok: true, detail: `${m.displayName ?? this.model} (${this.model})` };
    } catch (err) {
      return { ok: false, detail: mapGeminiError(err, this.scrub).message };
    }
  }
}
