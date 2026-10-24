export type IntegrationState = "connected" | "configured" | "not_configured" | "error" | "mock";

export interface IntegrationStatusItem {
  id: "tatum" | "walrus" | "llm";
  label: string;
  state: IntegrationState;
  detail: string;
  checkedAt: string;
}

export interface IntegrationStatusResponse {
  network: "testnet" | "mainnet";
  integrations: IntegrationStatusItem[];
}
