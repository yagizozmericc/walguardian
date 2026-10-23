# Guardian AI — Implementation Plan

**Last updated:** 2026-10-24
**Status:** Phases 1–3 are complete. Phase 2 was verified against live Tatum Sui Testnet data, and Protect was exercised on live data and fixtures. Phase 4 has not been started. See [Progress log](#9-progress-log).
**Network policy:** Testnet first. No Mainnet credentials, reads, or writes without explicit approval from the project owner.

This plan follows `docs/PRD.md` and `docs/ARCHITECTURE.md`. It records what was verified against official documentation on 2026-10-24, and it changes the architecture where the docs required it.

---

## 1. Verified integration findings

### 1.1 Tatum: Sui Testnet

Sources: [Tatum Sui reference](https://docs.tatum.io/reference/rpc-sui.md), [Tatum Sui gRPC](https://docs.tatum.io/reference/sui-grpc.md), [Tatum JSON-RPC to gRPC migration](https://docs.tatum.io/docs/sui-migration-guide-from-json-rpc-to-grpc.md), [Tatum authentication](https://docs.tatum.io/docs/authentication.md), [MystenLabs/sui-apis protos](https://github.com/MystenLabs/sui-apis).

| Finding | Detail | Impact |
|---|---|---|
| Testnet interface | Tatum's Sui page lists **gRPC only** for Testnet (`sui-testnet-grpc.gateway.tatum.io:443`). JSON-RPC (`sui-mainnet.gateway.tatum.io`) is listed for Mainnet only. | Use gRPC as the Testnet transport. |
| JSON-RPC status | Sui deprecated JSON-RPC. Public Testnet fullnodes now return `-32601 Method not found ... JSON-RPC on public fullnodes has been deprecated`. | Do not build on `suix_queryTransactionBlocks`. |
| Authentication | API key in the `x-api-key` header, sent as gRPC metadata. Free accounts include separate Mainnet and Testnet keys. | `TATUM_API_KEY` must be the **Testnet** key, and it stays server-side. |
| Balances | `StateService/ListBalances`, `StateService/GetBalance`, `StateService/GetCoinInfo` (symbol and decimals). | Portfolio balances and metadata. |
| Transaction history | `LedgerService/ListTransactions` (server-streaming, stable in sui-apis since 2026-07-20) accepts a `TransactionFilter` with `sender` and `affected_address` predicates, cursor pagination (`QueryOptions.after`/`before`), and ordering. | **Verified 2026-10-24 on Tatum Testnet.** The `affected_address` filter, descending order, and `before`-cursor pagination all work (two pages of 30 equal one page of 60, with no gaps or duplicates). History is served from checkpoint 314,252,673 onward; older activity is pruned. |
| Transaction detail | `LedgerService/GetTransaction`, `BatchGetTransactions` with `read_mask`. | Detail view and balance changes. |
| Health and network check | `LedgerService/GetServiceInfo` returns the chain identity and checkpoint height. | Confirms we are connected to Testnet before any query. |
| Error semantics | gRPC code 16 = bad key, 5 = pruned or not found, 14 = unavailable. Numbers come back as strings (use `BigInt`). | Typed provider errors and decimal-safe parsing. |

#### Live verification (2026-10-24, Tatum Sui Testnet, real key)

- **Network identity.** `GetServiceInfo` returns `chain: "testnet"`, so the network assertion holds.
- **Balances.** `ListBalances` and `GetCoinInfo` work. Testnet USDC metadata is confirmed as symbol `USDC` with 6 decimals. Coin types without registered `CoinMetadata` (for example vault and PT tokens) return `NOT_FOUND`, and the app shows them in raw units, never with guessed decimals.
- **Transactions.** Three real addresses were checked: an oracle bot, a faucet-style sender, and a BTC-bridge relayer. Net gas is computed as computation + storage − rebate, and it equals the sender's balance change on gas-only transactions. The transferred SUI amount excludes gas. Inflows identify the payer. Move calls are extracted, for example `pyth_lazer::parse_and_verify_le_ecdsa_update` and `deposit::confirm_deposit`.
- **Integrity.** For 8 of 8 sampled digests, the list result is identical to `GetTransaction`. None of the 120 checked transactions is missing a timestamp, sender, gas, or status.
- **Classification note.** Transactions in which the watched address only pays gas while a contract mints or moves value to third parties (bridge relayers) are classified as `none` ("Interaction") for that address. This is correct, because no value left the watched wallet.
- **Rate limits.** The gateway returns **HTTP 429**, which grpc-js surfaces as `UNAVAILABLE`, when more than a few requests per second are sent. These are now mapped to `PROVIDER_RATE_LIMITED`. A client-side request spacer (`TATUM_MAX_RPS`, default 3) and exponential backoff keep calls within the plan's limit.
- **Endpoint format.** Tatum's docs show the URL form `https://sui-testnet-grpc.gateway.tatum.io`. `env.ts` normalises it to `host:443` and rejects non-TLS schemes.

Decision: implement the Tatum adapter with `@grpc/grpc-js` and `@grpc/proto-loader`, which Tatum documents. Protos are vendored from `MystenLabs/sui-apis` at commit `aa9ba2c` (Apache-2.0) under `proto/`.

### 1.2 Walrus Memory

Sources: [SDK overview](https://docs.wal.app/walrus-memory/sdk/overview), [Quick start](https://docs.wal.app/walrus-memory/sdk/quick-start), [Public relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer.md), [Security model](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model.md), [Ownership](https://docs.wal.app/walrus-memory/fundamentals/concepts/ownership-and-access.md), [Multi-tenant cookbook](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant.md). The installed type definitions of `@mysten-incubation/memwal@0.1.9` were also inspected.

| Finding | Detail |
|---|---|
| Package | `@mysten-incubation/memwal` 0.1.9. Relayer mode needs the `@mysten/sui` and `@mysten/seal` peer dependencies, because the SDK builds a SEAL SessionKey on the client. |
| Testnet support | Yes, on paper: the Testnet relayer is `https://relayer-staging.memory.walrus.xyz` and the dashboard is `staging.memory.walrus.xyz`. |
| **Testnet availability (2026-10-24)** | **Broken.** Both staging hosts serve a TLS certificate for `*.up.railway.app`, and the hostname does not match. Every SDK call fails TLS verification. The Mainnet relayer `relayer.memory.walrus.xyz/health` returns `ok`. **This is blocker B1.** |
| Auth | Ed25519 **delegate key** (`MEMWAL_PRIVATE_KEY`) plus a `MemWalAccount` object ID (`MEMWAL_ACCOUNT_ID`). Every request is signed with a 5-minute timestamp window and a nonce. |
| Write | `remember(text, namespace)` accepts the write as an async job. `rememberAndWait` / `waitForRememberJob` resolves to `{ id, blob_id, owner, namespace }`. Idempotency keys are supported. A write counts as successful only when the job reaches `done` with a `blob_id`. |
| Read | `recall({ query, namespace, limit ≤ 100, sort: "relevance" | "recent", maxDistance })` returns `{ blob_id, text, distance, created_at }` in decrypted plaintext. |
| List | `listMemories({ namespace, cursor })` returns metadata only (`memory_id`, `blob_id`, `created_at`, `status`, `expires_at`), with no content. |
| Delete | **The SDK has no delete method.** Walrus blobs are immutable until they expire. |
| Data model | Memories are **unstructured text with semantic recall**. Fields such as category, source, and supersession are not native. We encode them in the text as a structured envelope (see §3.3). |
| Privacy | Content is Seal-encrypted at rest on Walrus. **The managed relayer sees plaintext** while it embeds, encrypts, and recalls. Namespaces organise data but are not a security boundary: one delegate key can read every namespace in the account, so the server must enforce the mapping from user to namespace. |
| Cost | The managed relayer sponsors WAL and SUI for writes. It has usage limits and no SLA. |
| Mock | The SDK ships a `MemWalMock`. **It is never used in the app.** At most it may appear in clearly labelled unit tests. |

### 1.3 Hackathon

No public listing for a "Tatum Total Recall" hackathon was found. The closest public events are Tatum × Walrus hackathons, which require Tatum Sui RPC plus a meaningful Walrus integration. The "≥10 memory records" requirement in PRD §12 is therefore **unverified** (question Q4).

---

## 2. Architecture adjustments

These changes to `ARCHITECTURE.md` follow from §1. `ARCHITECTURE.md` §19 has been updated to match.

1. **Blockchain transport is gRPC, not JSON-RPC.** The `BlockchainProvider` interface is unchanged, and `tatum.client.ts` is a gRPC client.
2. **No PostgreSQL in the MVP.** Walrus is the store of record for preferences, goals, decisions, and feedback. "Current state" is derived from the newest non-superseded memory per entity. Postgres is added only if the Walrus read model turns out too slow or too lossy (risk R4).
3. **Memory namespaces per principal and category**, for example `guardian:v1:<principalId>:goal`. Recall inside a small, single-category namespace (`limit: 100`, `sort: "recent"`) approximates a complete listing. `listMemories` gives counts and verifies writes.
4. **Identity.** Memories are never keyed by a public wallet address alone. A principal is either:
   - **Watch-only session**: a random ID in a signed, httpOnly cookie (HMAC with `SESSION_SECRET`). The principal is not the address, so knowing an address does not reveal its memories.
   - **Verified wallet** (Phase 6, optional): the user signs a Sui personal message, the server verifies it with `@mysten/sui`, and the principal becomes the verified address.
5. **Pricing.** Testnet tokens have no market price. Phase 2 shows token-denominated balances only, labelled "valuation unavailable". Allocation across assets needs a common unit, which is question Q3.

---

## 3. Module layout

```text
proto/                          vendored sui-apis protos (pinned)
src/
  app/
    (dashboard)/                overview, security, savings, strategy, memory
    api/                        route handlers (Node runtime)
  components/{ui,layout,portfolio,security,savings,strategy,copilot,memory}
  modules/
    blockchain/   tatum.client.ts (gRPC), sui.adapter.ts (normalisation), blockchain.types.ts
    portfolio/    portfolio.service.ts, assets.ts (explicit coin registry), portfolio.types.ts
    security/     baseline.service.ts, anomaly.engine.ts, risk.engine.ts, security.types.ts
    savings/      savings.engine.ts, savings.types.ts
    strategy/     allocation.engine.ts, strategy.types.ts
    memory/       walrus.adapter.ts, memory.service.ts, memory.codec.ts, memory.types.ts
    ai/           context.builder.ts, agent.service.ts, prompt.templates.ts, ai.types.ts
    session/      session.ts (signed-cookie principal)
  lib/            env.ts, errors.ts, logger.ts, decimal.ts, http.ts
tests/            vitest unit tests; tests/integration/* run only with real credentials
scripts/          check-tatum.ts, check-walrus.ts, seed-demo.ts
```

### 3.1 Data contracts (Zod)

- `SuiAddress`: normalised to 64 hex characters with a `0x` prefix and validated with `@mysten/sui/utils`.
- `TokenBalance { coinType, symbol, decimals, rawBalance (string), amount (decimal string), metadataSource }`.
- `NormalizedTransaction { digest, timestampMs, checkpoint, sender, status, gasUsedMist, balanceChanges[], moveCalls[{package,module,function}], recipients[], direction }`.

### 3.2 Determinism

All amounts use `decimal.js` or `BigInt` over raw integer units. Anomaly scores, savings maths, and allocations are pure functions with unit tests. The LLM receives the computed results and never computes them.

### 3.3 Memory envelope

Each memory is stored as text: a short natural-language sentence (which embeds well for recall) followed by a JSON line:

```
Guardian memory: User marked transfer 9xK… as EXPECTED: "Monthly rent to landlord."
<<guardian:{"v":1,"id":"…","category":"security_decision","source":"user","entityId":"tx:9xK…","supersedes":null,"createdAt":"…","wallet":"0x…","network":"testnet"}>>
```

The codec parses, validates (Zod), and rejects malformed envelopes. Recalled text is treated as untrusted data: it is never placed in the LLM system prompt as instructions.

---

## 4. Phases

The order follows the project owner's brief. Each phase ends with type-check, lint, and tests, plus a commit.

### Phase 1: Foundation
**Depends on:** none.
- Next.js 16 App Router, strict TypeScript, Tailwind v4, shadcn/ui, Lucide, Vitest.
- Design system: tokens, typography (Inter and JetBrains Mono, tabular numbers), table, stat, badge, and empty, error, and loading primitives.
- App shell: sidebar navigation (Overview, Security, Savings, Strategy, Memory), top bar with network badge and address context, and a collapsible copilot side panel placeholder.
- `lib/env.ts` (Zod-validated, server-only, Mainnet guard), `lib/errors.ts`, `lib/logger.ts` (structured JSON, secret redaction), `.env.example`.

**Acceptance:**
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
- The shell renders at desktop and mobile widths.
- Setting `SUI_NETWORK=mainnet` without `ALLOW_MAINNET=true` fails fast.

### Phase 2: Tatum Sui Testnet integration
**Depends on:** Phase 1 and a Tatum Testnet API key.
- gRPC client: TLS, `x-api-key` metadata, deadlines, retry with backoff on `UNAVAILABLE`/`RESOURCE_EXHAUSTED`, typed `ProviderError`.
- Calls: `GetServiceInfo` (network assertion), `ListBalances`, `GetCoinInfo`, `ListTransactions` (filter `affected_address`, descending, paginated, bounded to N most recent), `GetTransaction`.
- Normalisation into `TokenBalance` and `NormalizedTransaction`.
- `GET /api/portfolio/[address]`: validated address, balances plus recent activity, with `fetchedAt` and `source: "tatum-grpc:sui-testnet"`.
- Address entry, a portfolio holdings table, and an activity table on Overview, with loading, empty (new address, no history), and error (bad key, rate limit, unavailable) states.
- `scripts/check-tatum.ts`: live smoke test that prints the chain and checkpoint and lists balances for a given address.

**Acceptance:**
- A real Testnet address shows balances and transactions that match Suiscan Testnet.
- If Tatum is unreachable or rejects the key, the UI shows an explicit integration error, never fabricated data.
- Normalisation unit tests pass on recorded fixtures, which are labelled.

### Phase 3: Protect (done)
**Depends on:** Phase 2.

**Delivered:**
- Point-in-time baselines (`modules/security/baseline.service.ts`). Each sent transaction is scored only against transactions strictly before it, so it never contributes to its own baseline. The baseline records:
  - per-coin median, p75, p90, p95, and max (nearest-rank percentiles on exact integers)
  - known recipients and the wallet's own new-recipient rate
  - non-framework Move packages, counted per transaction
  - sends per day (mean and σ, only when the window spans 3 days or more)
- Rules `protect-rules/1` (`rules.config.ts`, `anomaly.engine.ts`):

  | Rule | Requires | Points |
  |---|---|---|
  | Unusual amount vs. that coin's p95 | ≥ 5 prior transfers of the coin | 15 / 25 / 35 above 1× / 2× / 5× p95 |
  | New recipient | ≥ 5 prior transfers with recipients | Up to 20, scaled by (1 − the wallet's novelty rate) |
  | Frequency spike (24 h count vs. daily baseline) | ≥ 3 days of prior history | 10 at z ≥ 2.5, 20 at z ≥ 4 |
  | First-time Move package | ≥ 5 prior sent transactions | 15 |
  | Large outflow vs. reconstructed balance before the transaction | A consistent balance walk | 15 at ≥ 25%, 30 at ≥ 50%, 40 (critical) at ≥ 80% |
  | First outgoing transfer of an asset | ≥ 5 prior transfers | 10 |

- Scoring (`risk.engine.ts`):
  - The score is the sum of rule points, capped at 100.
  - Severity is high at ≥ 60, medium at ≥ 30, and low above 0.
  - **A critical signal forces high severity.** Two cases are critical: ≥ 80% outflow, and an amount above 5× p95 sent to a never-paid recipient.
  - Confidence comes from the number of prior transfers: fewer than 5 is insufficient, fewer than 15 low, fewer than 40 medium, otherwise high.
- Explanations come from deterministic templates. Every signal carries evidence (statistics, values, and digests). Rules that cannot be evaluated return a **limitation**. Rules that were evaluated but scored zero by design return a **note**.
- The wallet status is "attention required", "review recommended", "no significant deviations" (never "safe"), or "insufficient history". The last is used when fewer than 5 value transfers exist and nothing high fired.
- `GET /api/security/[address]` and the Security Center page:
  - status band
  - flagged and all transaction lists
  - per-transaction score breakdown
  - behavioral profile
  - methodology notes
  - feedback controls, shown disabled until Phase 6
- `npm run check:protect -- 0x…` runs on live Testnet data. `npm run demo:protect` runs on labelled fixtures.

**Acceptance (met):**
- Scoring is deterministic. 28 Protect unit tests cover the normal, large-amount, new-recipient, frequency-spike, large-outflow, insufficient-history, and multiple-signal cases, plus novelty weighting, the point-in-time baseline, and wording that never says "malicious" or "attack".
- Real-data check on 2026-10-24 against three Testnet wallets:
  - The faucet-style sender produced 36 low new-recipient signals, down-weighted because 25% of its transfers go to new recipients.
  - The BTC-bridge relayer was correctly reported as insufficient history, with 0 value transfers out of 180 sent.
  - The oracle bot produced no transfer signals.
  - **No medium or high anomalies were present in the real data**, so the higher tiers are demonstrated with labelled fixtures.
- **Carried to Phase 6:** feedback persistence, and the test that feedback cannot suppress critical signals. The engine already marks critical signals so that rule can be enforced.

### Phase 4: Save
**Depends on:** Phase 1.
- Goal model, progress, remaining amount, required monthly contribution, schedule status (ahead / on track / behind), and estimated completion. Every assumption is shown.
- Explicit asset allocation per goal: wallet balances are not counted toward a goal automatically.
- Until Phase 6, goals live in a `GoalRepository` interface with a browser-local implementation labelled "Not yet saved to Walrus".

**Acceptance:** savings maths is unit-tested, covering edge cases such as a past target date, zero contribution, and overfunding.

### Phase 5: Invest
**Depends on:** Phase 2 and Q3 (pricing).
- Current vs. target allocation, drift, a liquidity and stablecoin-reserve check, and illustrative rebalancing amounts. No price is ever fabricated.

**Acceptance:** allocation maths is unit-tested, and a missing price produces an explicit "unavailable" state.

### Phase 6: Walrus Memory
**Depends on:** B1 resolved (or an approved alternative), Walrus credentials, and Phases 3–5.
- Adapter around `MemWal` (`rememberAndWait`, `recall`, `listMemories`, `health`), the codec, the memory service (write, retrieve by category or query, newest-wins supersession, history), and session principals.
- Persist onboarding preferences, goals, security feedback, and investment decisions.
- The Memory page lists records with category, source (user / system / AI), timestamp, `blob_id`, and the supersession chain.
- `scripts/check-walrus.ts` writes, waits for `done`, then recalls and prints `blob_id`.

**Acceptance:**
- A write is reported successful only after the job reaches `done`.
- A record written in one session is recalled after a server restart.
- Relayer failures surface as explicit errors.

### Phase 7: AI Copilot
**Depends on:** Phase 6, an LLM key, and Q5.
- Context builder (onchain facts, calculated metrics, user preferences, memories with provenance, all bounded), server-side Claude call, Zod-validated structured output, rate limiting, and a deterministic fallback when the LLM is unavailable.
- Side-panel copilot that labels each claim by provenance.

### Phase 8: Unified transaction assessment
**Depends on:** Phases 3–7.
- `POST /api/assessments/transfer`: Protect, Save, Invest, and Memory findings, an overall recommendation, and the IDs of the memories used.
- The demo flow shows the before and after of a memory change.

### Phase 9: Demo and hardening
- Seed script, README, end-to-end demo script, and a UI polish pass at desktop and mobile widths.

---

## 5. Environment variables

| Variable | Phase | Notes |
|---|---|---|
| `SUI_NETWORK` | 1 | `testnet` (default). `mainnet` is rejected unless `ALLOW_MAINNET=true`. |
| `ALLOW_MAINNET` | 1 | Leave unset. Requires the project owner's explicit approval. |
| `TATUM_API_KEY` | 2 | Tatum **Testnet** key. Server-only. |
| `TATUM_SUI_GRPC_ENDPOINT` | 2 | Default `sui-testnet-grpc.gateway.tatum.io:443`. |
| `MEMWAL_PRIVATE_KEY` | 6 | Delegate key (hex). Never the owner key. Server-only. |
| `MEMWAL_ACCOUNT_ID` | 6 | `MemWalAccount` object ID. |
| `MEMWAL_SERVER_URL` | 6 | Default `https://relayer-staging.memory.walrus.xyz` (Testnet). |
| `MEMWAL_NAMESPACE_PREFIX` | 6 | Default `guardian`. |
| `SESSION_SECRET` | 6 | 32+ random bytes for signing session cookies. |
| `ANTHROPIC_API_KEY` | 7 | LLM provider key. Server-only. |
| `LLM_MODEL` | 7 | Default chosen in Phase 7 from the current Claude model list. |

---

## 6. Risks and blockers

| ID | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **B1** | Walrus Memory Testnet relayer and dashboard have a broken TLS certificate, so no Testnet account can be created and no call can be made. | Confirmed 2026-10-24 | Recheck before Phase 6. Alternatives in §7. TLS verification will never be disabled. |
| R1 | ~~Tatum's Testnet gRPC node may not serve the indexed `ListTransactions` API.~~ | **Resolved** | Verified working on 2026-10-24. |
| R7 | The Tatum free-tier rate limit (HTTP 429 at a few requests per second) constrains history depth and refresh frequency. | Certain | Request spacer, backoff, bounded history (≤ 200 transactions for profiling), and short server-side caching. |
| R8 | The node prunes history below checkpoint 314,252,673, so baselines only cover recent history. | Certain | Show the analysed window and lower confidence when it is short. |
| R2 | The Testnet wallet used for the demo needs enough organic history for a meaningful baseline. | Medium | Seed a Testnet wallet with a deliberate pattern of Testnet transfers (faucet funds only), then one outlier. Only real onchain transactions, no fixtures in the live path. |
| R3 | The managed relayer sees plaintext, and Walrus data cannot be deleted before expiry. | Certain | Disclose in the UI and README. Store only non-sensitive demo data. A future option is `MemWalManual` for client-side encryption. |
| R4 | Semantic recall used as a read model can miss records once a namespace grows beyond 100. | Low for the MVP | Use per-category namespaces and `listMemories` counts to detect gaps. Add Postgres references if needed. |
| R5 | Rate limits on the Tatum free tier and the managed relayer. | Medium | Per-request caching (short TTL), bounded history depth, and backoff. |
| R6 | The JSON-RPC deprecation means Sui docs and examples on the web are often stale. | Certain | Rely only on the vendored protos. |

---

## 7. Open questions for the project owner

1. ~~**Q1.** Tatum Testnet API key.~~ Resolved: the key is configured in `.env`.
2. **Q2 (B1, needed for Phase 6).** If the Walrus Memory Testnet relayer is still broken at Phase 6, which option do you prefer?
   - (a) Wait or report it to Walrus. This is recommended first.
   - (b) Self-host the relayer on Testnet. It needs Postgres with pgvector, Redis, an OpenAI embeddings key (a paid cost), and Testnet WAL and SUI.
   - (c) Use the **Mainnet** managed relayer for memory only, with sponsored writes and non-sensitive demo data. **This requires your explicit approval.**
3. **Q3 (Phase 5).** What should the pricing source be for allocation percentages? Options are: a documented public price API applied to Testnet balances and labelled "illustrative Mainnet reference price"; user-entered reference prices labelled as assumptions; or token-unit allocations only.
4. **Q4.** Please confirm the hackathon rules, in particular whether ≥10 Walrus memory records are required and any mandatory Tatum products.
5. **Q5 (Phase 7).** Is Anthropic Claude acceptable as the LLM provider? It needs an `ANTHROPIC_API_KEY`.
6. **Q6.** Is a Sui wallet connection (dApp Kit) for verified ownership in scope, or are signed-cookie watch-only sessions enough for the demo?

---

## 8. End-to-end demo scenario (target)

All steps run on Sui Testnet.

1. **Wallet analysis.** Enter the demo Testnet address. Balances and recent transactions load through Tatum gRPC, with the source and `fetchedAt` shown.
2. **Onboarding.** Set the goal to Saving and risk to Balanced, a 40% stablecoin target, and a savings goal of "Emergency reserve, 1,000 USDC by 2027-04-30". This writes 4 or more memories to Walrus, and each shows its `blob_id`.
3. **Security detection.** The Security Center flags the seeded outlier transfer (for example, 6× the p90 amount to a new recipient). It shows the score, the signals, and the evidence digests.
4. **Feedback.** Mark the alert "Expected" with the note "Quarterly transfer to my cold wallet 0xabc…". This is written to Walrus and confirmed `done`.
5. **Transfer assessment.** Assess a hypothetical transfer of the same size to the same recipient. The new-recipient signal is now down-weighted, citing the memory ID. The amount signal remains, because critical signals are never suppressed. The Save finding shows the impact on the emergency reserve.
6. **Memory demonstration.** Restart the server, reload, and re-run the assessment. The recalled feedback produces the same personalised result. The Memory page lists 10 or more records with provenance.

Demo fixtures (recorded responses used only in unit tests) live in `tests/fixtures/` and are labelled `FIXTURE`.

---

## 9. Progress log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-10-24 | Validation | Done | Findings in §1. B1 and R1 raised. |
| 2026-10-24 | Plan | Done | This document. |
| 2026-10-24 | 1 Foundation | Done | The shell, design tokens, env guard, errors, logger, and `/api/status` are in place. Typecheck, lint, tests, and build pass. The `frontend-design` skill is not installed in this environment, so DESIGN.md was followed directly. |
| 2026-10-24 | 2 Tatum | Done (verified live) | All acceptance checks pass against real Testnet data; see §1.1 Live verification. Fixes from verification: HTTP 429 mapped to a rate-limit error, request spacer and backoff, normalisation of the URL-form endpoint, and `check:tatum` now also reads `.env`. |
| 2026-10-24 | 3 Protect | Done | The engine, API, and Security Center are complete, with 71 unit tests passing. Live runs covered three Testnet wallets. Limitations: the real data has no strong anomalies, so the higher tiers are shown only on fixtures. Analysis covers at most the 200 most recent transactions, because of the free-tier rate limit and node pruning below checkpoint 314,252,673. High-throughput wallets often span less than 3 days, so the frequency rule is skipped and reported for them. Feedback persistence waits on Phase 6 and B1. |
