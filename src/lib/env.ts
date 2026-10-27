import "server-only";
import { z } from "zod";
import { ConfigError } from "./errors";

const TESTNET_TATUM_GRPC = "sui-testnet-grpc.gateway.tatum.io:443";
const MAINNET_TATUM_GRPC = "sui-mainnet-grpc.gateway.tatum.io:443";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z.object({
  SUI_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ALLOW_MAINNET: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  TATUM_API_KEY: optionalString,
  TATUM_SUI_GRPC_ENDPOINT: optionalString,
  TATUM_MAX_RPS: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(200).default(3)),
  MEMORY_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["walrus", "mock"]).optional()),
  MEMWAL_PRIVATE_KEY: optionalString,
  MEMWAL_ACCOUNT_ID: optionalString,
  MEMWAL_SERVER_URL: optionalString,
  MEMWAL_NAMESPACE_PREFIX: z.preprocess(emptyToUndefined, z.string().regex(/^[a-z0-9-]{1,32}$/, "lowercase letters, digits and dashes").default("guardian-demo")),
  ALLOW_WALRUS_MAINNET: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  SESSION_SECRET: optionalString,
  MOCK_MEMORY_FILE: z.preprocess(emptyToUndefined, z.string().default(".data/mock-memory.json")),
  MOCK_MEMORY_TTL_DAYS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(3650).default(28)),
  GEMINI_API_KEY: optionalString,
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().regex(/^[a-z0-9][a-z0-9.-]{2,63}$/, "a Gemini model id such as gemini-3.5-flash-lite").default("gemini-3.5-flash-lite")),
  LLM_MAX_OUTPUT_TOKENS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(128).max(8192).default(1200)),
  COPILOT_RATE_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(120).default(6)),
  COPILOT_RATE_PER_DAY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(5000).default(100)),
  API_RATE_PER_MINUTE: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(1000).default(30)),
  API_RATE_PER_DAY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).default(2000)),
  // Upstash Redis (REST) for shared limits and short-lived caches. Never stores memory content.
  KV_REST_API_URL: z.preprocess(emptyToUndefined, z.string().url().startsWith("https://", "must use https").optional()),
  KV_REST_API_TOKEN: optionalString,
  // Memory writes: the remote provider is read-only unless explicitly enabled.
  MEMORY_WRITES_ENABLED: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  MEMORY_WRITES_PER_SESSION_DAY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(1000).default(20)),
  MEMORY_WRITES_GLOBAL_DAY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).default(300)),
  // Injected by Vercel.
  VERCEL: optionalString,
  VERCEL_ENV: z.preprocess(emptyToUndefined, z.enum(["production", "preview", "development"]).optional()),
});

export type LlmConfig =
  | { provider: "disabled"; reason: string }
  | { provider: "gemini"; apiKey: string; model: string; maxOutputTokens: number; ratePerMinute: number; ratePerDay: number };

/** Hosted relayers listed in the Walrus Memory docs. */
export const WALRUS_TESTNET_RELAYER = "https://relayer.dev.memwal.ai";
/** Retired Testnet ("staging") relayer, replaced by relayer.dev.memwal.ai (walrus-memory PR #1321). */
const RETIRED_WALRUS_RELAYERS = ["https://relayer-staging.memory.walrus.xyz"];
export const WALRUS_MAINNET_RELAYER = "https://relayer.memory.walrus.xyz";

/**
 * Write policy for the memory provider. The remote provider (Walrus) is
 * read-only unless MEMORY_WRITES_ENABLED=true, accepts only predefined
 * structured records (no free text), and requires shared quotas.
 */
export interface MemoryWriteConfig {
  enabled: boolean;
  structuredOnly: boolean;
  perSessionDay: number;
  globalDay: number;
}

export type MemoryConfig =
  | { provider: "disabled"; reason: string }
  | {
      provider: "mock";
      namespacePrefix: string;
      sessionSecret: string;
      file: string;
      ttlDays: number;
      writes: MemoryWriteConfig;
    }
  | {
      provider: "walrus";
      namespacePrefix: string;
      sessionSecret: string;
      key: string;
      accountId: string;
      serverUrl: string;
      network: "testnet" | "mainnet" | "unknown";
      writes: MemoryWriteConfig;
    };

export type SuiNetwork = "testnet" | "mainnet";

export type DeploymentEnvironment = "production" | "preview" | "development" | "local";

export interface ServerEnv {
  network: SuiNetwork;
  tatum: { apiKey: string | undefined; grpcEndpoint: string; maxRequestsPerSecond: number };
  memory: MemoryConfig;
  llm: LlmConfig;
  deployment: { vercel: boolean; environment: DeploymentEnvironment };
  /** Upstash Redis REST credentials; `prefix` separates Preview, Production and local keys in one database. */
  redis: { url: string; token: string; prefix: string } | null;
  limits: { apiPerMinute: number; apiPerDay: number };
}

/**
 * Parses and validates server environment variables.
 *
 * Mainnet is refused unless ALLOW_MAINNET=true is set explicitly, so a
 * misconfigured deployment can never silently read or write Mainnet.
 */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ConfigError(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;

  if (e.SUI_NETWORK === "mainnet" && e.ALLOW_MAINNET !== "true") {
    throw new ConfigError(
      "SUI_NETWORK=mainnet requires ALLOW_MAINNET=true. Guardian AI is Testnet-first; Mainnet needs explicit approval.",
    );
  }

  const grpcEndpoint = normalizeGrpcEndpoint(
    e.TATUM_SUI_GRPC_ENDPOINT ??
      (e.SUI_NETWORK === "mainnet" ? MAINNET_TATUM_GRPC : TESTNET_TATUM_GRPC),
  );

  if (e.SUI_NETWORK === "testnet" && grpcEndpoint.includes("mainnet")) {
    throw new ConfigError(
      "TATUM_SUI_GRPC_ENDPOINT points at Mainnet while SUI_NETWORK=testnet.",
    );
  }

  const vercel = Boolean(e.VERCEL);
  const environment: DeploymentEnvironment = vercel ? (e.VERCEL_ENV ?? "development") : "local";
  if (Boolean(e.KV_REST_API_URL) !== Boolean(e.KV_REST_API_TOKEN)) {
    throw new ConfigError("KV_REST_API_URL and KV_REST_API_TOKEN must be set together.", "CONFIG_MISSING");
  }

  return {
    network: e.SUI_NETWORK,
    tatum: { apiKey: e.TATUM_API_KEY, grpcEndpoint, maxRequestsPerSecond: e.TATUM_MAX_RPS },
    memory: parseMemoryConfig(e, vercel),
    deployment: { vercel, environment },
    redis: e.KV_REST_API_URL && e.KV_REST_API_TOKEN ? { url: e.KV_REST_API_URL, token: e.KV_REST_API_TOKEN, prefix: `wg:${environment}:` } : null,
    limits: { apiPerMinute: e.API_RATE_PER_MINUTE, apiPerDay: e.API_RATE_PER_DAY },
    llm: e.GEMINI_API_KEY
      ? {
          provider: "gemini",
          apiKey: e.GEMINI_API_KEY,
          model: e.LLM_MODEL,
          maxOutputTokens: e.LLM_MAX_OUTPUT_TOKENS,
          ratePerMinute: e.COPILOT_RATE_PER_MINUTE,
          ratePerDay: e.COPILOT_RATE_PER_DAY,
        }
      : { provider: "disabled", reason: "GEMINI_API_KEY is not set." },
  };
}

/**
 * Memory is opt-in and explicit: there is no implicit fallback between
 * providers. The Walrus Mainnet relayer is refused unless ALLOW_WALRUS_MAINNET
 * is set (a separate switch from ALLOW_MAINNET, which governs Tatum).
 */
function parseMemoryConfig(e: z.infer<typeof EnvSchema>, vercel: boolean): MemoryConfig {
  if (!e.MEMORY_PROVIDER) {
    return { provider: "disabled", reason: "MEMORY_PROVIDER is not set. Set it to \"walrus\" or \"mock\"." };
  }
  if (e.MEMORY_PROVIDER === "mock" && vercel) {
    // Vercel functions have no persistent, shared disk: the mock would silently lose records.
    return { provider: "disabled", reason: "The development mock cannot persist records on Vercel, so memory is disabled here." };
  }
  if (!e.SESSION_SECRET || !/^[0-9a-fA-F]{64,}$/.test(e.SESSION_SECRET)) {
    throw new ConfigError("SESSION_SECRET must be at least 32 random bytes in hex when memory is enabled.");
  }
  const quotas = { perSessionDay: e.MEMORY_WRITES_PER_SESSION_DAY, globalDay: e.MEMORY_WRITES_GLOBAL_DAY };
  if (e.MEMORY_PROVIDER === "mock") {
    return {
      provider: "mock",
      namespacePrefix: e.MEMWAL_NAMESPACE_PREFIX,
      sessionSecret: e.SESSION_SECRET,
      file: e.MOCK_MEMORY_FILE,
      ttlDays: e.MOCK_MEMORY_TTL_DAYS,
      writes: { enabled: true, structuredOnly: false, ...quotas },
    };
  }
  if (!e.MEMWAL_PRIVATE_KEY || !e.MEMWAL_ACCOUNT_ID || !e.MEMWAL_SERVER_URL) {
    throw new ConfigError("MEMORY_PROVIDER=walrus requires MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID and MEMWAL_SERVER_URL.", "CONFIG_MISSING");
  }
  const serverUrl = e.MEMWAL_SERVER_URL.replace(/\/+$/, "");
  if (!/^https:\/\//.test(serverUrl)) throw new ConfigError("MEMWAL_SERVER_URL must use https.");
  if (RETIRED_WALRUS_RELAYERS.includes(serverUrl)) {
    throw new ConfigError(`MEMWAL_SERVER_URL points to the retired Walrus Memory staging relayer. Use ${WALRUS_TESTNET_RELAYER} for Testnet.`);
  }
  const network = serverUrl === WALRUS_TESTNET_RELAYER ? "testnet" : serverUrl === WALRUS_MAINNET_RELAYER ? "mainnet" : "unknown";
  if (network !== "testnet" && e.ALLOW_WALRUS_MAINNET !== "true") {
    throw new ConfigError(
      `MEMWAL_SERVER_URL is not the Walrus Memory Testnet relayer. Using ${network === "mainnet" ? "the Mainnet relayer" : "another relayer"} requires ALLOW_WALRUS_MAINNET=true and explicit approval.`,
    );
  }
  return {
    provider: "walrus",
    namespacePrefix: e.MEMWAL_NAMESPACE_PREFIX,
    sessionSecret: e.SESSION_SECRET,
    key: e.MEMWAL_PRIVATE_KEY,
    accountId: e.MEMWAL_ACCOUNT_ID,
    serverUrl,
    network,
    writes: { enabled: e.MEMORY_WRITES_ENABLED === "true", structuredOnly: true, ...quotas },
  };
}

/**
 * grpc-js expects "host:port". Accept the URL form shown in Tatum's docs
 * ("https://sui-testnet-grpc.gateway.tatum.io") and normalize it; TLS is
 * always used, so plaintext schemes are rejected.
 */
export function normalizeGrpcEndpoint(raw: string): string {
  let value = raw.trim();
  const scheme = /^([a-z]+):\/\//i.exec(value);
  if (scheme) {
    if (scheme[1].toLowerCase() !== "https") {
      throw new ConfigError("TATUM_SUI_GRPC_ENDPOINT must use TLS (https:// or host:443).");
    }
    value = value.slice(scheme[0].length);
  }
  value = value.replace(/\/+$/, "");
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(value)) {
    throw new ConfigError("TATUM_SUI_GRPC_ENDPOINT must be a hostname, optionally with a port.");
  }
  return value.includes(":") ? value : `${value}:443`;
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
