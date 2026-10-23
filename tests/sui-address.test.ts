import { describe, expect, it } from "vitest";
import { SuiAddressSchema, shortAddress } from "@/lib/sui-address";

describe("SuiAddressSchema", () => {
  it("normalizes short and mixed-case addresses to 0x + 64 lowercase hex", () => {
    expect(SuiAddressSchema.parse("0x2")).toBe(`0x${"0".repeat(63)}2`);
    expect(SuiAddressSchema.parse(` 0x${"AB".repeat(32)} `)).toBe(`0x${"ab".repeat(32)}`);
  });

  it("rejects non-hex, missing prefix and over-long input", () => {
    expect(SuiAddressSchema.safeParse("hello").success).toBe(false);
    expect(SuiAddressSchema.safeParse("ab".repeat(32)).success).toBe(false);
    expect(SuiAddressSchema.safeParse(`0x${"a".repeat(65)}`).success).toBe(false);
    expect(SuiAddressSchema.safeParse("0xzz").success).toBe(false);
  });

  it("shortens for display", () => {
    expect(shortAddress(`0x${"ab".repeat(32)}`)).toBe("0xabab…abab");
  });
});
