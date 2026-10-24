/** Provider-neutral contract for structured (JSON) generation. */

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON Schema the response must follow. */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface LlmResponse {
  /** Raw parsed JSON; validated by the caller. */
  json: unknown;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface LlmProvider {
  readonly id: "gemini";
  readonly model: string;
  generateJson(req: LlmRequest): Promise<LlmResponse>;
  /** Cheap reachability check (model metadata), not a generation. */
  health(): Promise<{ ok: boolean; detail: string }>;
}
