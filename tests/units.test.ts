import { describe, expect, it } from "vitest";
import { formatUnits, toBigInt } from "@/lib/units";

describe("formatUnits", () => {
  it("formats exactly without floating point", () => {
    expect(formatUnits("1500000000", 9)).toBe("1.5");
    expect(formatUnits("1", 9)).toBe("0.000000001");
    expect(formatUnits("123456789012345678901234567890", 9)).toBe("123456789012345678901.23456789");
    expect(formatUnits("-2500000000", 9)).toBe("-2.5");
    expect(formatUnits("0", 6)).toBe("0");
    expect(formatUnits("42", 0)).toBe("42");
  });

  it("rejects non-integer input", () => {
    expect(() => toBigInt("1.5")).toThrow(RangeError);
    expect(() => toBigInt(0.1)).toThrow(RangeError);
  });
});
