export type IntegrationState = "connected" | "configured" | "not_configured" | "error" | "mock";

export interface IntegrationStatusItem {
  id: "tatum" | "walrus" | "llm" | "redis";
  label: string;
  state: IntegrationState;
  detail: string;
  checkedAt: string;
}

export interface IntegrationStatusResponse {
  network: "testnet" | "mainnet";
  demo: { walletAddress: string; label: string; syntheticDataAvailable: boolean };
  /** What users can save in this deployment (see memory.policy). */
  memoryWrites: { enabled: boolean; structuredOnly: boolean; detail: string | null };
  integrations: IntegrationStatusItem[];
}
