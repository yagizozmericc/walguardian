import { SuiAddressSchema } from "./sui-address";

/**
 * Read-only demonstration wallet. Defaults to an active public Sui Testnet
 * address owned by a third party (watched only; it is not ours and nothing is
 * ever signed for it). Override with DEMO_WALLET_ADDRESS.
 */
export const DEFAULT_DEMO_WALLET = "0x059e21c19f9a8233f4fcbc11fba713c022dcf9d3632961b7ac7836a9ffa8d94f";

export function demoWalletAddress(): string {
  const parsed = SuiAddressSchema.safeParse(process.env.DEMO_WALLET_ADDRESS ?? DEFAULT_DEMO_WALLET);
  return parsed.success ? parsed.data : DEFAULT_DEMO_WALLET;
}

export const DEMO_WALLET_LABEL = "Third-party demonstration wallet (read-only)";
