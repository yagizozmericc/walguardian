/**
 * Read-only diagnostics for MEMWAL_ACCOUNT_ID. A common mistake is to set the
 * account owner's wallet address instead of the MemWalAccount object ID; the
 * relayer then rejects every call with a generic authentication error. This
 * classifies the configured ID from onchain data (Sui GraphQL, no writes) so
 * check:walrus can say exactly what is wrong.
 */

const ACCOUNT_TYPE = /^(0x[0-9a-f]{64})::account::MemWalAccount$/;

export interface AccountLookup {
  /** The object at the configured ID, or null if no object exists there. */
  object: { type: string; json: Record<string, unknown> } | null;
  /** MemWalAccount objects created by transactions this ID sent (when the ID is an address). */
  createdAccounts: string[];
}

export type AccountIdDiagnosis =
  | { kind: "ok"; owner: string; delegateKeys: number }
  | { kind: "owner_address"; accounts: string[] }
  | { kind: "wrong_package"; packageId: string; expected: string }
  | { kind: "inactive" | "quarantined" }
  | { kind: "key_not_registered"; delegateKeys: number }
  | { kind: "other_object"; type: string }
  | { kind: "not_found" };

export function classifyAccountId(lookup: AccountLookup, opts: { packageId?: string; delegatePublicKeyB64?: string } = {}): AccountIdDiagnosis {
  const o = lookup.object;
  if (!o) return lookup.createdAccounts.length ? { kind: "owner_address", accounts: lookup.createdAccounts } : { kind: "not_found" };
  const m = ACCOUNT_TYPE.exec(o.type);
  if (!m) return { kind: "other_object", type: o.type };
  if (opts.packageId && m[1] !== opts.packageId.toLowerCase()) return { kind: "wrong_package", packageId: m[1], expected: opts.packageId.toLowerCase() };
  if (o.json.active === false) return { kind: "inactive" };
  if (o.json.admin_quarantined === true) return { kind: "quarantined" };
  const keys = Array.isArray(o.json.delegate_keys) ? (o.json.delegate_keys as { public_key?: unknown }[]) : [];
  if (opts.delegatePublicKeyB64 && !keys.some((k) => k.public_key === opts.delegatePublicKeyB64)) return { kind: "key_not_registered", delegateKeys: keys.length };
  return { kind: "ok", owner: String(o.json.owner ?? ""), delegateKeys: keys.length };
}

export const maskId = (s: string) => (/^0x[0-9a-f]{64}$/i.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

/** One actionable sentence per diagnosis; IDs are masked. */
export function describeDiagnosis(d: AccountIdDiagnosis): string {
  switch (d.kind) {
    case "ok":
      return `MEMWAL_ACCOUNT_ID is a MemWalAccount object (owner ${maskId(d.owner)}, ${d.delegateKeys} delegate key(s)); the configured delegate key is registered.`;
    case "owner_address":
      return `MEMWAL_ACCOUNT_ID is the account owner's wallet address, not the MemWalAccount object ID. This address created ${d.accounts.map(maskId).join(", ")}. Set MEMWAL_ACCOUNT_ID to that object ID (shown as "Account ID" in the Walrus Memory dashboard).`;
    case "wrong_package":
      return `MEMWAL_ACCOUNT_ID belongs to Walrus Memory package ${maskId(d.packageId)}, but the relayer uses ${maskId(d.expected)}. Create or select an account on the dashboard for this relayer.`;
    case "inactive":
      return "The MemWalAccount is not active. Check the account on the Walrus Memory dashboard.";
    case "quarantined":
      return "The MemWalAccount is quarantined by the Walrus Memory administrators.";
    case "key_not_registered":
      return `MEMWAL_PRIVATE_KEY is not one of the account's ${d.delegateKeys} registered delegate keys. Use a delegate key generated for this account on the dashboard.`;
    case "other_object":
      return `MEMWAL_ACCOUNT_ID points to a ${d.type.replace(/0x[0-9a-f]{64}/g, maskId)} object, not a MemWalAccount.`;
    case "not_found":
      return "MEMWAL_ACCOUNT_ID does not exist on this network, as an object or as an account owner. Copy the Account ID from the Walrus Memory dashboard for this network.";
  }
}

const GRAPHQL = { mainnet: "https://graphql.mainnet.sui.io/graphql", testnet: "https://graphql.testnet.sui.io/graphql" } as const;

/** Read-only onchain lookup via Sui GraphQL. */
export async function lookupAccountId(id: string, network: keyof typeof GRAPHQL, fetchImpl: typeof fetch = fetch): Promise<AccountLookup> {
  const query = `query($id: SuiAddress!) {
    object(address: $id) { asMoveObject { contents { type { repr } json } } }
    address(address: $id) { transactions(first: 20) { nodes { sender { address } effects { objectChanges(first: 50) { nodes { address idCreated outputState { asMoveObject { contents { type { repr } } } } } } } } } }
  }`;
  const res = await fetchImpl(GRAPHQL[network], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sui GraphQL returned HTTP ${res.status}`);
  const body = (await res.json()) as { errors?: unknown; data?: GraphqlData };
  if (body.errors || !body.data) throw new Error("Sui GraphQL returned errors");
  const contents = body.data.object?.asMoveObject?.contents;
  const sent = (body.data.address?.transactions?.nodes ?? []).filter((t) => t.sender?.address?.toLowerCase() === id.toLowerCase());
  const createdAccounts = [
    ...new Set(
      sent.flatMap((t) => t.effects.objectChanges.nodes).filter((c) => c.idCreated && ACCOUNT_TYPE.test(c.outputState?.asMoveObject?.contents?.type?.repr ?? "")).map((c) => c.address),
    ),
  ];
  return { object: contents ? { type: contents.type.repr, json: contents.json ?? {} } : null, createdAccounts };
}

interface GraphqlData {
  object: { asMoveObject: { contents: { type: { repr: string }; json: Record<string, unknown> | null } | null } | null } | null;
  address: {
    transactions: {
      nodes: {
        sender: { address: string } | null;
        effects: { objectChanges: { nodes: { address: string; idCreated: boolean; outputState: { asMoveObject: { contents: { type: { repr: string } } | null } | null } | null }[] } };
      }[];
    };
  } | null;
}
