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

import { ceilDiv, parseUnits } from "@/lib/units";

describe("parseUnits", () => {
  it("parses exactly into smallest units", () => {
    expect(parseUnits("1.5", 9)).toBe(1_500_000_000n);
    expect(parseUnits("2000", 6)).toBe(2_000_000_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(parseUnits("-3.25", 2)).toBe(-325n);
  });
  it("rejects excess precision and malformed input rather than rounding", () => {
    expect(() => parseUnits("0.0000001", 6)).toThrow(RangeError);
    expect(() => parseUnits("1e5", 6)).toThrow(RangeError);
    expect(() => parseUnits("1,000", 6)).toThrow(RangeError);
  });
});

describe("ceilDiv", () => {
  it("rounds up so planned amounts are sufficient", () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(0n, 3n)).toBe(0n);
  });
});
