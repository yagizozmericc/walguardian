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

  it("rejects unknown networks", () => {
    expect(() => parseEnv({ SUI_NETWORK: "devnet" })).toThrow(ConfigError);
  });
});
