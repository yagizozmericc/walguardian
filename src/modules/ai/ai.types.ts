import { z } from "zod";

/** Provenance of every item the model may cite. */
export type ContextKind = "onchain" | "calculation" | "preference" | "memory";

export interface ContextItem {
  /** Stable citation id, e.g. "O1", "C4", "P2", "M3". */
  id: string;
  kind: ContextKind;
  /** Where it came from, e.g. "Tatum Sui testnet", "Protect engine (protect-rules/2)". */
  source: string;
  asOf: string | null;
  text: string;
  /** Memory text is untrusted user/system content and is fenced in the prompt. */
  untrusted?: boolean;
}

export interface ContextSection {
  name: "portfolio" | "security" | "savings" | "strategy" | "memory";
  status: "ok" | "empty" | "unavailable";
  detail: string;
}

export interface AgentContext {
  address: string;
  network: string;
  items: ContextItem[];
  sections: ContextSection[];
}

export const BASES = ["onchain", "calculation", "preference", "memory", "suggestion"] as const;

export const ModelAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  points: z
    .array(
      z.object({
        text: z.string().min(1).max(600),
        basis: z.enum(BASES),
        citations: z.array(z.string().max(8)).max(8),
      }),
    )
    .max(8),
  followUps: z.array(z.string().max(200)).max(4),
  limitations: z.array(z.string().max(300)).max(5),
});
export type ModelAnswer = z.infer<typeof ModelAnswerSchema>;

/** JSON Schema given to the model (mirrors ModelAnswerSchema). */
export const MODEL_ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "Direct answer in 1-4 sentences, plain language." },
    points: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          basis: { type: "string", enum: [...BASES] },
          citations: { type: "array", items: { type: "string" }, description: "Context ids supporting this point, e.g. [\"C2\"]." },
        },
        required: ["text", "basis", "citations"],
      },
    },
    followUps: { type: "array", maxItems: 3, items: { type: "string" } },
    limitations: { type: "array", maxItems: 4, items: { type: "string" } },
  },
  required: ["answer", "points", "followUps", "limitations"],
} as const;

export type PointBasis = (typeof BASES)[number] | "unverified";

export interface CopilotPoint {
  text: string;
  basis: PointBasis;
  citations: Pick<ContextItem, "id" | "kind" | "source" | "asOf" | "text">[];
}

export interface CopilotResponse {
  mode: "ai" | "deterministic";
  answer: string;
  points: CopilotPoint[];
  followUps: string[];
  limitations: string[];
  /** Validation findings, e.g. uncited claims or figures not found in the data. */
  warnings: string[];
  sections: ContextSection[];
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  generatedAt: string;
}

export const CopilotRequestSchema = z.object({
  address: z.string(),
  question: z.string().trim().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(6)
    .default([]),
});
