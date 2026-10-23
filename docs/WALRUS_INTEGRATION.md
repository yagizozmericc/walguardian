# Walrus Memory: Mainnet relayer integration plan

**Status:** Prepared 2026-10-24. **No Mainnet writes have been made.** The only requests sent to the relayer so far are the unauthenticated `GET /health`, `/version`, and `/config`.

**Authorization (from the project owner):**
- The Walrus Memory **Mainnet hosted relayer** may be used for development and demos, with **non-sensitive synthetic data only**.
- Tatum and every other blockchain data operation stay on Sui **Testnet**.
- Any Mainnet transaction or payment needs separate approval.

## 1. Verified facts

Sources: docs.wal.app/walrus-memory, the MystenLabs/MemWal source, the installed `@mysten-incubation/memwal@0.1.9` source, and the live relayer endpoints.

| Topic | Finding |
|---|---|
| Relayer | `https://relayer.memory.walrus.xyz`. `/health` reports `mode: production`, `write_ready: true`, `apiVersion 1.0.0`. `/config` reports `network: mainnet`, `packageId 0xe7c1…d7f5`, and `rateLimitDisabled: false`. |
| SDK compatibility | 0.1.9 supports API major 1 (`minSupportedSdk.typescript 0.0.4`), so it is compatible. |
| Credentials | A **delegate** Ed25519 private key plus a `MemWalAccount` object ID. The server URL defaults to the Mainnet relayer. The registry and package IDs are needed only for the account and manual helpers. |
| Account creation | Done on the dashboard at https://memory.walrus.xyz, signing in with Google (Enoki zkLogin) or a Sui wallet. It runs **two Mainnet Sui transactions**: `create_account` and `add_delegate_key`. In the MemWal source, gas is **sponsored** (Enoki through the relayer), so no SUI or WAL balance is needed. *Unverified:* that sponsorship is active on production today. The source read was the `dev` branch. |
| Writes | The relayer pays the WAL storage fees and SUI gas for every `remember`, so the account holder pays nothing. There are usage limits (HTTP 429 with `Retry-After`), but no numeric quota is published. |
| SDK network use | In relayer mode the SDK dynamically imports `@mysten/seal` and `@mysten/sui`. To build a SEAL session it makes **one read-only `getObject` call** against a **Sui Mainnet fullnode** (`mysten-rpc.mainnet.sui.io`) and signs a personal message locally. It sends **no transactions**. |
| Request auth | Each request is signed over the timestamp, method, path, body hash, nonce, and account ID. Clock skew must stay within 300 s, and each nonce can be used only once. |
| Write semantics | `remember` → job states `pending`, `running`, `uploaded`, `done`, or `failed`. `done` means the record is stored on Walrus and indexed, and returns `{ id, blob_id, owner, namespace }`. Jobs can run for a long time under congestion; on timeout, poll the same `job_id` rather than resubmitting. Explicit idempotency keys prevent duplicates. |
| Read semantics | `recall({ query, namespace, limit, sort: "recent" })` → `{ blob_id, text, distance, created_at }`. `listMemories` returns metadata only (`memory_id`, `blob_id`, `created_at`, `status`, `expires_at`, …). |
| Retention | The relayer's default upload lifetime is **about 2 epochs (~4 weeks) on Mainnet**. Expired blobs cannot be recovered. *Unverified:* whether the managed relayer renews blobs automatically. |
| Deletion | The SDK has no delete call. A separate Security Delete flow requires an owner-wallet signature and is permanent. |
| Privacy | Blobs on Walrus are SEAL-encrypted. The **relayer sees plaintext** and the embeddings. One delegate key can read every namespace in the account. Namespaces organise data; they are not a security boundary. |

## 2. Steps for the owner (requires your action and approval)

| # | Step | Transaction? |
|---|---|---|
| 1 | Open https://memory.walrus.xyz and sign in (Google, or a Sui wallet with no funds). | No |
| 2 | Generate the delegate key in the setup wizard, and copy the **private key** right away (the wizard keeps it only for the session). | No |
| 3 | Create the account (`create_account`). | **Yes, a Mainnet Sui transaction.** Gas is sponsored according to the source. **Stop if the wallet asks you to pay.** |
| 4 | Register the delegate key (`add_delegate_key`). | **Yes, a Mainnet Sui transaction**, sponsored the same way. |
| 5 | Put the values below into `.env` (never commit them). | No |
| 6 | Tell me the values are set. I will then run read-only checks (`health`, `listMemories`) before any write. | No |

Steps 3 and 4 are Mainnet transactions in your account. Please confirm you accept them. If anything asks for payment, stop; per your instruction I will not proceed in that case.

## 3. Environment variables

| Variable | Value | Notes |
|---|---|---|
| `MEMWAL_PRIVATE_KEY` | Delegate private key (hex, or `suiprivkey1…`) | Server-only. **Never the owner wallet key.** |
| `MEMWAL_ACCOUNT_ID` | `0x…` MemWalAccount object ID | This is not your wallet address. |
| `MEMWAL_SERVER_URL` | `https://relayer.memory.walrus.xyz` | Explicit, so the network is never implicit. |
| `MEMWAL_NAMESPACE_PREFIX` | `guardian-demo` | Prefix for every namespace this app writes. |
| `ALLOW_WALRUS_MAINNET` | `true` | New guard: the app refuses the Mainnet relayer unless this is set. It is separate from `ALLOW_MAINNET`, which still blocks Tatum on Mainnet. |
| `SESSION_SECRET` | 32+ random bytes (hex) | Signs the watch-only session cookie that scopes memories (see §4). |

These are kept separate from the Tatum configuration and validated by Zod in `lib/env.ts`.

## 4. Implementation plan (Phase 6, after approval)

1. **Dependencies:** pin `@mysten/seal` as a direct dependency, matched to `@mysten/sui@2.37.0`. It is currently installed only implicitly as a peer dependency.
2. **Configuration guard:** a `walrus` section in `env.ts` that enforces `ALLOW_WALRUS_MAINNET=true` for the Mainnet URL, plus a data-class guard. Only synthetic, non-sensitive content is accepted, and the codec rejects anything that looks like a private key, seed phrase, or credential.
3. **Identity and namespaces:** a signed, httpOnly session cookie carries a random principal ID. The namespace is `guardian-demo-<principalId>-<category>`, derived **server-side only** and never taken from the request. Public wallet addresses are never used as the key. Optional wallet-signature verification follows later.
4. **Adapter (`walrus.adapter.ts`):**
   - `write` → `rememberAndWait`, with an explicit idempotency key, a 120 s budget, and polling of the same `job_id`.
   - `retrieve` → `recall`, with `sort: "recent"` and `maxDistance`.
   - `history` → `listMemories`, which also exposes `expires_at`.
   - `health`.
   - Typed `ProviderError`s for 401, 429, timeout, and failed jobs.
5. **Codec:** a human-readable sentence plus a `<<guardian:{json}>>` envelope (version, category, source user/system/ai, entityId, supersedes, createdAt, network). Recalled text is Zod-validated and treated as untrusted data.
6. **Repositories:** `WalrusGoalRepository` and a Walrus-backed strategy settings store replace the temporary stores through the existing interfaces. Security feedback is persisted, and the test that feedback cannot suppress critical signals is added.
7. **Verification script:** `scripts/check-walrus.ts`, run against your account only:
   - health (read-only)
   - write one synthetic record
   - wait for `done`
   - recall it
   - list it, printing `blob_id` and `expires_at`

   **This is the first Mainnet write and will run only with your go-ahead.**
8. **UI:** the Financial Memory page lists each record with its category, source, timestamp, `blob_id`, and expiry, alongside a disclosure of the plaintext and retention limits.

## 5. Risks and open points

- Sponsorship on production is unverified until step 3. If gas is requested, stop.
- The ~4-week retention may drop demo memories before judging. Record `expires_at`, show it in the UI, and re-seed if needed.
- Usage limits are unpublished. Writes need backoff and idempotency, and the app must avoid tight polling loops.
- There is no SLA. Relayer outages surface as explicit integration errors and never fall back to local storage.
- The SDK's Mainnet fullnode read (SEAL session) is a Mainnet *read* inside the Walrus authorization. No Tatum or other blockchain data flows through Mainnet.
