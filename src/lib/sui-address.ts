import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * A Sui account address, normalized to lowercase 0x + 64 hex characters.
 * Accepts short-form input (e.g. "0x2") and pads it, matching Sui semantics.
 * Shared by client and server; it performs no network access.
 */
export const SuiAddressSchema = z
  .string()
  .trim()
  .regex(HEX_ADDRESS, "Enter a 0x-prefixed hexadecimal Sui address.")
  .transform((v) => normalizeSuiAddress(v.toLowerCase()))
  .refine((v) => isValidSuiAddress(v), "Not a valid Sui address.");

export type SuiAddress = z.infer<typeof SuiAddressSchema>;

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
