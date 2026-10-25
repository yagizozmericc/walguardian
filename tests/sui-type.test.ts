import { describe, expect, it } from "vitest";
import { normalizeStructTag } from "@mysten/sui/utils";
import { isCanonicalStructTag } from "@/lib/sui-type";

const A = (hex: string) => "0x" + hex.padStart(64, "0");

describe("isCanonicalStructTag", () => {
  it("accepts canonical coin types, including generic parameters", () => {
    for (const t of [
      `${A("2")}::sui::SUI`,
      `${A("5d")}::lp::LP<${A("2")}::sui::SUI,${A("db")}::usdc::USDC>`,
      `${A("2")}::a::B<${A("2")}::c::D<u64>>`,
      `${A("2")}::coin::Coin<vector<u8>>`,
      `${A("2")}::wrapped::W<address,bool,u256>`,
      `${A("2")}::_m::_T`,
      `${A("2")}::a::B<${A("2")}::b::C<${A("2")}::c::D<${A("2")}::d::E<u8>>>>`, // 4 nested argument lists
    ]) expect(isCanonicalStructTag(t), t).toBe(true);
  });

  it("matches what the app stores (normalizeStructTag output)", () => {
    const raw = "0x5d::lp::LP<0x2::sui::SUI, 0xdb::usdc::USDC>";
    expect(isCanonicalStructTag(normalizeStructTag(raw))).toBe(true);
    expect(isCanonicalStructTag(raw)).toBe(false); // short addresses and spaces are not canonical
  });

  it("rejects free text, malformed tags and abuse of nesting", () => {
    for (const t of [
      `${A("2")}::sui::SUI my notes`,
      `${A("2")}::sui::SUI<>`,
      `${A("2")}::sui::SUI<${A("2")}::a::B`,
      `${A("2")}::sui::SUI<${A("2")}::a::B>>`,
      `${A("2")}::sui::SUI<${A("2")}::a::B, ${A("2")}::c::D>`,
      `${A("2")}::sui`,
      `${A("2")}::9bad::X`,
      `${A("ab").toUpperCase().replace("0X", "0x")}::sui::SUI`,
      `0x2::sui::SUI`,
      `${A("2")}::a::B<u8x>`,
      `${A("2")}::a::B<vector<u8>`,
      `${A("2")}::a::B<${A("2")}::b::C<${A("2")}::c::D<${A("2")}::d::E<${A("2")}::e::F<u8>>>>>`, // 5 nested argument lists (max 4)
      `${A("2")}::a::B<${Array(9).fill("u8").join(",")}>`,
      `${A("2")}::a::${"X".repeat(600)}`,
      "",
    ]) expect(isCanonicalStructTag(t), t).toBe(false);
  });
});
