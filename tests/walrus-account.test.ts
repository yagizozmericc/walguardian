import { describe, expect, it } from "vitest";
import { classifyAccountId, describeDiagnosis, lookupAccountId, type AccountLookup } from "@/modules/memory/walrus.account";

const hex = (h: string) => "0x" + h.padStart(64, "0");
const PKG = hex("e7c1");
const OWNER = hex("60fb");
const ACCOUNT = hex("1c11");
const KEY = Buffer.alloc(32, 7).toString("base64");
const accountObject = (json: Record<string, unknown> = {}, pkg = PKG): AccountLookup["object"] => ({
  type: `${pkg}::account::MemWalAccount`,
  json: { owner: OWNER, active: true, admin_quarantined: false, delegate_keys: [{ public_key: KEY, label: "Web App" }], ...json },
});

describe("classifyAccountId", () => {
  it("accepts a MemWalAccount whose delegate key is registered", () => {
    const d = classifyAccountId({ object: accountObject(), createdAccounts: [] }, { packageId: PKG, delegatePublicKeyB64: KEY });
    expect(d).toEqual({ kind: "ok", owner: OWNER, delegateKeys: 1 });
  });

  it("detects the owner's wallet address and names the account object to use (masked)", () => {
    const d = classifyAccountId({ object: null, createdAccounts: [ACCOUNT] });
    expect(d).toEqual({ kind: "owner_address", accounts: [ACCOUNT] });
    const msg = describeDiagnosis(d);
    expect(msg).toMatch(/owner's wallet address, not the MemWalAccount object ID/);
    expect(msg).toContain("0x0000…1c11");
    expect(msg).not.toContain(ACCOUNT); // full IDs are not printed
  });

  it("reports unknown IDs, other objects, wrong package, inactive, quarantined and unregistered keys", () => {
    expect(classifyAccountId({ object: null, createdAccounts: [] }).kind).toBe("not_found");
    expect(classifyAccountId({ object: { type: `${hex("2")}::coin::Coin<${hex("2")}::sui::SUI>`, json: {} }, createdAccounts: [] }).kind).toBe("other_object");
    expect(classifyAccountId({ object: accountObject({}, hex("abcd")), createdAccounts: [] }, { packageId: PKG }).kind).toBe("wrong_package");
    expect(classifyAccountId({ object: accountObject({ active: false }), createdAccounts: [] }).kind).toBe("inactive");
    expect(classifyAccountId({ object: accountObject({ admin_quarantined: true }), createdAccounts: [] }).kind).toBe("quarantined");
    const other = Buffer.alloc(32, 9).toString("base64");
    expect(classifyAccountId({ object: accountObject(), createdAccounts: [] }, { delegatePublicKeyB64: other })).toEqual({ kind: "key_not_registered", delegateKeys: 1 });
  });
});

describe("lookupAccountId (read-only Sui GraphQL)", () => {
  const respond = (data: unknown) => (async () => new Response(JSON.stringify({ data }), { status: 200 })) as unknown as typeof fetch;

  it("finds MemWalAccounts created by transactions the ID sent", async () => {
    const data = {
      object: null,
      address: {
        transactions: {
          nodes: [
            { sender: { address: OWNER }, effects: { objectChanges: { nodes: [
              { address: ACCOUNT, idCreated: true, outputState: { asMoveObject: { contents: { type: { repr: `${PKG}::account::MemWalAccount` } } } } },
              { address: hex("a1"), idCreated: true, outputState: { asMoveObject: { contents: { type: { repr: `${hex("2")}::dynamic_field::Field<address,${hex("2")}::object::ID>` } } } } },
            ] } } },
            // A transaction someone else sent that merely touched this address is ignored.
            { sender: { address: hex("99") }, effects: { objectChanges: { nodes: [
              { address: hex("bad"), idCreated: true, outputState: { asMoveObject: { contents: { type: { repr: `${PKG}::account::MemWalAccount` } } } } },
            ] } } },
          ],
        },
      },
    };
    const lookup = await lookupAccountId(OWNER, "mainnet", respond(data));
    expect(lookup).toEqual({ object: null, createdAccounts: [ACCOUNT] });
    expect(classifyAccountId(lookup).kind).toBe("owner_address");
  });

  it("returns the object when the ID is an account", async () => {
    const data = { object: { asMoveObject: { contents: { type: { repr: `${PKG}::account::MemWalAccount` }, json: { owner: OWNER, active: true } } } }, address: { transactions: { nodes: [] } } };
    expect((await lookupAccountId(ACCOUNT, "mainnet", respond(data))).object?.type).toBe(`${PKG}::account::MemWalAccount`);
  });

  it("throws on GraphQL errors so the caller can continue without the diagnosis", async () => {
    const failing = (async () => new Response(JSON.stringify({ errors: [{ message: "x" }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(lookupAccountId(OWNER, "mainnet", failing)).rejects.toThrow(/GraphQL/);
  });
});
