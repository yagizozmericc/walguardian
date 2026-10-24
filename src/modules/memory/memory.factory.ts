import "server-only";
import { ConfigError } from "@/lib/errors";
import { env } from "@/lib/env";
import type { MemoryClient } from "./memory.client";
import { MemoryService } from "./memory.service";
import { MockMemoryClient } from "./mock.adapter";
import { createWalrusClient } from "./walrus.adapter";

let client: MemoryClient | null = null;

/** The configured provider. There is no fallback: a disabled or failing provider surfaces as an error. */
export function getMemoryClient(): MemoryClient {
  if (client) return client;
  const cfg = env().memory;
  if (cfg.provider === "disabled") throw new ConfigError(`Memory storage is not configured. ${cfg.reason}`, "CONFIG_MISSING");
  client =
    cfg.provider === "mock"
      ? new MockMemoryClient(cfg.file, cfg.ttlDays)
      : createWalrusClient({ key: cfg.key, accountId: cfg.accountId, serverUrl: cfg.serverUrl });
  return client;
}

export function getMemoryService(principalId: string): MemoryService {
  const cfg = env().memory;
  if (cfg.provider === "disabled") throw new ConfigError(`Memory storage is not configured. ${cfg.reason}`, "CONFIG_MISSING");
  // Records are tagged with the data network (Tatum), which stays Testnet.
  return new MemoryService(getMemoryClient(), { namespacePrefix: cfg.namespacePrefix, network: env().network }, principalId);
}

export interface MemoryProviderInfo {
  provider: "walrus" | "mock" | "disabled";
  label: string;
  detail: string;
}

export function memoryProviderInfo(): MemoryProviderInfo {
  const cfg = env().memory;
  if (cfg.provider === "disabled") return { provider: "disabled", label: "Not configured", detail: cfg.reason };
  if (cfg.provider === "mock") {
    return {
      provider: "mock",
      label: "Development mock",
      detail: `Records are kept in a local file (${cfg.file}) by the SDK's MemWalMock. They are not stored on Walrus, and expiry after ${cfg.ttlDays} days is simulated.`,
    };
  }
  return { provider: "walrus", label: `Walrus Memory (${cfg.network})`, detail: `Relayer ${cfg.serverUrl}` };
}
