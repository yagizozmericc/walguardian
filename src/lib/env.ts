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
});

export type SuiNetwork = "testnet" | "mainnet";

export interface ServerEnv {
  network: SuiNetwork;
  tatum: { apiKey: string | undefined; grpcEndpoint: string };
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

  const grpcEndpoint =
    e.TATUM_SUI_GRPC_ENDPOINT ??
    (e.SUI_NETWORK === "mainnet" ? MAINNET_TATUM_GRPC : TESTNET_TATUM_GRPC);

  if (e.SUI_NETWORK === "testnet" && grpcEndpoint.includes("mainnet")) {
    throw new ConfigError(
      "TATUM_SUI_GRPC_ENDPOINT points at Mainnet while SUI_NETWORK=testnet.",
    );
  }

  return {
    network: e.SUI_NETWORK,
    tatum: { apiKey: e.TATUM_API_KEY, grpcEndpoint },
  };
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
