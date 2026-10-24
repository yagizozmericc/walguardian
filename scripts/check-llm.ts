/**
 * Live Gemini check (one small free-tier request). Never prints the key.
 *
 *   npm run check:llm
 */
import { existsSync } from "node:fs";
import { AppError } from "@/lib/errors";
import { parseEnv } from "@/lib/env";
import { GeminiProvider } from "@/modules/ai/gemini.provider";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const cfg = parseEnv(process.env).llm;
  if (cfg.provider === "disabled") {
    console.log(`LLM disabled: ${cfg.reason}`);
    return;
  }
  const llm = new GeminiProvider(cfg.apiKey, cfg.model);
  console.log("model:", cfg.model);
  console.log("health:", await llm.health());
  const t0 = Date.now();
  const r = await llm.generateJson({
    system: "You return JSON only.",
    user: "Return status 'ok' and the sum of 2 and 3 as a number.",
    schema: { type: "object", properties: { status: { type: "string" }, sum: { type: "number" } }, required: ["status", "sum"] },
    maxOutputTokens: 64,
  });
  console.log(`structured output in ${Date.now() - t0}ms:`, r.json, "| model:", r.model, "| tokens:", r.usage);
}

main()
  .catch((err) => {
    console.error(err instanceof AppError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
