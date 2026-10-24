import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { ConfigError } from "@/lib/errors";

describe("parseEnv", () => {
  it("defaults to Sui testnet and the Tatum testnet gRPC gateway", () => {
    const e = parseEnv({});
    expect(e.network).toBe("testnet");
    expect(e.tatum.grpcEndpoint).toBe("sui-testnet-grpc.gateway.tatum.io:443");
    expect(e.tatum.apiKey).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ TATUM_API_KEY: "  " }).tatum.apiKey).toBeUndefined();
  });

  it("refuses mainnet without explicit approval", () => {
    expect(() => parseEnv({ SUI_NETWORK: "mainnet" })).toThrow(ConfigError);
    expect(() => parseEnv({ SUI_NETWORK: "mainnet", ALLOW_MAINNET: "false" })).toThrow(ConfigError);
  });

  it("allows mainnet only with ALLOW_MAINNET=true", () => {
    const e = parseEnv({ SUI_NETWORK: "mainnet", ALLOW_MAINNET: "true" });
    expect(e.tatum.grpcEndpoint).toBe("sui-mainnet-grpc.gateway.tatum.io:443");
  });

  it("rejects a mainnet endpoint while configured for testnet", () => {
    expect(() =>
      parseEnv({ TATUM_SUI_GRPC_ENDPOINT: "sui-mainnet-grpc.gateway.tatum.io:443" }),
    ).toThrow(ConfigError);
  });

  it("normalizes URL-form endpoints to host:port", () => {
    expect(parseEnv({ TATUM_SUI_GRPC_ENDPOINT: "https://sui-testnet-grpc.gateway.tatum.io" }).tatum.grpcEndpoint).toBe(
      "sui-testnet-grpc.gateway.tatum.io:443",
    );
    expect(parseEnv({ TATUM_SUI_GRPC_ENDPOINT: "https://sui-testnet-grpc.gateway.tatum.io:8443/" }).tatum.grpcEndpoint).toBe(
      "sui-testnet-grpc.gateway.tatum.io:8443",
    );
  });

  it("rejects plaintext or malformed endpoints", () => {
    expect(() => parseEnv({ TATUM_SUI_GRPC_ENDPOINT: "http://sui-testnet-grpc.gateway.tatum.io" })).toThrow(ConfigError);
    expect(() => parseEnv({ TATUM_SUI_GRPC_ENDPOINT: "sui-testnet-grpc.gateway.tatum.io/path" })).toThrow(ConfigError);
  });

  it("rejects unknown networks", () => {
    expect(() => parseEnv({ SUI_NETWORK: "devnet" })).toThrow(ConfigError);
  });

  describe("memory configuration", () => {
    const secret = "ab".repeat(32);
    it("is disabled unless a provider is chosen explicitly", () => {
      expect(parseEnv({}).memory.provider).toBe("disabled");
    });
    it("requires a strong session secret when enabled", () => {
      expect(() => parseEnv({ MEMORY_PROVIDER: "mock" })).toThrow(ConfigError);
      expect(() => parseEnv({ MEMORY_PROVIDER: "mock", SESSION_SECRET: "short" })).toThrow(ConfigError);
      expect(parseEnv({ MEMORY_PROVIDER: "mock", SESSION_SECRET: secret }).memory).toMatchObject({ provider: "mock", ttlDays: 28, namespacePrefix: "guardian-demo" });
    });
    it("accepts the Testnet relayer and refuses Mainnet without explicit approval", () => {
      const walrus = { MEMORY_PROVIDER: "walrus", SESSION_SECRET: secret, MEMWAL_PRIVATE_KEY: "k", MEMWAL_ACCOUNT_ID: "0x1" };
      expect(parseEnv({ ...walrus, MEMWAL_SERVER_URL: "https://relayer-staging.memory.walrus.xyz/" }).memory).toMatchObject({ provider: "walrus", network: "testnet" });
      expect(() => parseEnv({ ...walrus, MEMWAL_SERVER_URL: "https://relayer.memory.walrus.xyz" })).toThrow(/ALLOW_WALRUS_MAINNET/);
      expect(() => parseEnv({ ...walrus, MEMWAL_SERVER_URL: "https://example.com" })).toThrow(ConfigError);
      expect(parseEnv({ ...walrus, MEMWAL_SERVER_URL: "https://relayer.memory.walrus.xyz", ALLOW_WALRUS_MAINNET: "true" }).memory).toMatchObject({ network: "mainnet" });
    });
    it("requires credentials for walrus", () => {
      expect(() => parseEnv({ MEMORY_PROVIDER: "walrus", SESSION_SECRET: secret })).toThrow(/requires/);
    });
    it("keeps Walrus read-only and structured-only unless writes are enabled explicitly", () => {
      const walrus = { MEMORY_PROVIDER: "walrus", SESSION_SECRET: secret, MEMWAL_PRIVATE_KEY: "k", MEMWAL_ACCOUNT_ID: "0x1", MEMWAL_SERVER_URL: "https://relayer.memory.walrus.xyz", ALLOW_WALRUS_MAINNET: "true" };
      expect(parseEnv(walrus).memory).toMatchObject({ writes: { enabled: false, structuredOnly: true, perSessionDay: 20, globalDay: 300 } });
      expect(parseEnv({ ...walrus, MEMORY_WRITES_ENABLED: "true" }).memory).toMatchObject({ writes: { enabled: true, structuredOnly: true } });
      expect(parseEnv({ MEMORY_PROVIDER: "mock", SESSION_SECRET: secret }).memory).toMatchObject({ writes: { enabled: true, structuredOnly: false } });
    });
    it("disables the file-based mock on Vercel instead of losing records silently", () => {
      const m = parseEnv({ MEMORY_PROVIDER: "mock", SESSION_SECRET: secret, VERCEL: "1", VERCEL_ENV: "preview" }).memory;
      expect(m).toMatchObject({ provider: "disabled" });
      expect(m.provider === "disabled" && m.reason).toMatch(/cannot persist records on Vercel/);
    });
  });

  describe("deployment and Redis", () => {
    const kv = { KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "t" };
    it("separates key prefixes per deployment environment", () => {
      expect(parseEnv(kv).redis?.prefix).toBe("wg:local:");
      expect(parseEnv({ ...kv, VERCEL: "1", VERCEL_ENV: "preview" }).redis?.prefix).toBe("wg:preview:");
      expect(parseEnv({ ...kv, VERCEL: "1", VERCEL_ENV: "production" }).redis?.prefix).toBe("wg:production:");
      expect(parseEnv({ ...kv, VERCEL: "1", VERCEL_ENV: "production" }).deployment).toEqual({ vercel: true, environment: "production" });
    });
    it("is optional, but both REST variables must be set together and use https", () => {
      expect(parseEnv({}).redis).toBeNull();
      expect(() => parseEnv({ KV_REST_API_URL: kv.KV_REST_API_URL })).toThrow(/set together/);
      expect(() => parseEnv({ ...kv, KV_REST_API_URL: "http://example.upstash.io" })).toThrow(ConfigError);
    });
    it("reads API budgets with defaults", () => {
      expect(parseEnv({}).limits).toEqual({ apiPerMinute: 30, apiPerDay: 2000 });
      expect(parseEnv({ API_RATE_PER_MINUTE: "10", API_RATE_PER_DAY: "50" }).limits).toEqual({ apiPerMinute: 10, apiPerDay: 50 });
    });
  });

  describe("llm configuration", () => {
    it("is disabled without a key and defaults to a free-tier Flash-Lite model", () => {
      expect(parseEnv({}).llm.provider).toBe("disabled");
      expect(parseEnv({ GEMINI_API_KEY: "k" }).llm).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash-lite", maxOutputTokens: 1200, ratePerMinute: 6 });
    });
    it("validates the configurable model id", () => {
      expect(parseEnv({ GEMINI_API_KEY: "k", LLM_MODEL: "gemini-3.8-flash" }).llm).toMatchObject({ model: "gemini-3.8-flash" });
      expect(() => parseEnv({ GEMINI_API_KEY: "k", LLM_MODEL: "../../etc" })).toThrow(ConfigError);
    });
  });
});
