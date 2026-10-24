# Guardian AI — Implementation Plan

**Last updated:** 2026-10-24
**Status:** Phases 1–8 are complete. Memory runs on the labelled development mock until the Walrus Testnet relayer is available. The copilot and explanations use Gemini free tier (`gemini-3.5-flash-lite`). Phase 9 (demo and hardening) has not been started. See [Progress log](#9-progress-log).
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

### Phase 4: Save (done)
**Depends on:** Phase 1.

**Delivered:**
- **Contracts** (`modules/savings/savings.types.ts`, Zod), with two goal kinds:
  - `target`: an amount by a date
  - `reserve`: a minimum kept aside, with an optional date

  Each goal has an asset, a target, an optional planned monthly contribution, notes, a start date, and dated **allocation events** (earmark or release). Funds count toward a goal only when explicitly earmarked.
- **Engine** (`savings.engine.ts`, pure, integer units throughout):
  - progress, floored to 0.1%
  - remaining amount
  - **required monthly**, rounded up to the smallest unit. A month is 365.2425 / 12 days, computed as an exact rational.
  - straight-line schedule with a 1% tolerance: ahead, on track, behind, overdue, or completed
  - completion projection at the planned contribution
  - monthly shortfall
  - allocation history
- **Wallet coverage.** Earmarks are checked against the live Tatum balance. Reserves are backed first, then targets oldest first. Over-commitment is flagged, and progress uses the backed amount.
- **Deterministic recommendations:** behind schedule (with the amount needed per month), plan too low, wallet holds less than earmarked, reserve below minimum, overdue, and no plan. Every evaluation lists its assumptions.
- **API.** `POST /api/savings/evaluate` validates with Zod and with per-asset decimal checks. It verifies each asset's decimals against Tatum `GetCoinInfo` and rejects mismatches.
- **Savings UI:**
  - coverage band
  - goals table with progress meters
  - goal detail: key figures, schedule, progress chart (earmarked vs. plan, with hover), recommendations, earmark/release log, assumptions
  - create, edit, and delete
  - start dates in the past, so existing savings can be recorded
- **Persistence boundary.** `GoalRepository` is an interface. The only implementation today is a **temporary per-tab store** (`sessionStorage`), labelled on the page as "Temporary demo storage": goals are lost when the tab closes and are not saved to Walrus. The Walrus-backed repository replaces it in Phase 6. No PostgreSQL is used.
- **Pricing.** The `PriceProvider` interface (`modules/pricing`) has one implementation, `NoPriceProvider`. Testnet assets are never priced. A CoinGecko provider for verified Mainnet assets is planned behind the same interface and is not implemented.

**Verification (2026-10-24):**
- 30 savings unit tests with hand-computed values cover: on track, behind, ahead, plan shortfall, sufficient plan, completed, overdue, due today, no plan, floor rounding, 9-decimal exactness, reserves, coverage ordering, over-commitment, a coin no longer held, an unchecked balance, validation, and determinism.
- Live API run against a Testnet wallet holding 99.968 SUI with 140 SUI earmarked:
  - the reserve was fully backed and the target partially backed
  - wrong decimals and over-precision returned 400 errors
- A browser end-to-end run (headless Chrome) covered:
  - creating goals, and the client-side rejection of a target goal without a date
  - recording earmarks
  - persistence across a reload in the same tab, and an empty state in a fresh browser context
  - a backdated goal whose figures match hand calculation (334.805625 SUI per month, estimate 2027-06-04)
  - no page errors

**Not done, by design or blocked:**
- Goal persistence and history depend on Walrus Memory (B1).
- Recommendations triggered by changed liquidity preferences or new user context need Memory (Phase 6).
- Percentage-of-portfolio goals ("keep 40% in stablecoins") need valuation and are handled in Phase 5.
- The Overview page does not yet show savings progress, because goals exist only in the temporary store.

### Phase 5: Invest (done)
**Depends on:** Phase 2. Pricing decision: Testnet assets use **user-defined reference prices**, explicitly labelled as assumptions. CoinGecko is reserved for verified Mainnet assets later. Valuation stays behind the provider-neutral `PriceProvider` interface.

**Delivered:**
- **Pricing:**
  - `PriceQuote.basis` is either `market` or `user_reference`.
  - `ReferencePriceProvider` serves the prices you enter.
  - `resolvePrices` tries the market provider first, then your reference prices, and every result keeps its basis.
  - On Testnet there is no market provider, so every price is user-provided.
- **Strategy contracts** (`modules/strategy/strategy.types.ts`):
  - optional class targets (SUI, stablecoins, other) that must total exactly 100%
  - a drift band
  - reference prices (positive, at most 8 decimals, dated)
  - explicit exclusions
  - a minimum stablecoin reserve in USD and a SUI gas reserve
  - risk tolerance and horizon, recorded as context only; they change no number
- **Engine** (`allocation.engine.ts`, pure):
  - USD values are 1e-8 integers. Percentages use the largest-remainder method, so they always sum to exactly 100.00%.
  - **If any analysed asset has no reference price or no published decimals, no cross-asset figures are produced at all**: the status is `incomplete`, with a named list of what is missing.
  - Excluding an asset is an explicit user action and is reported in every result.
- **Drift.** Current vs. target per class, flagged when outside the band.
- **Rebalancing scenario.** It is illustrative only and nothing is executed.
  - It never sells savings earmarks (passed in from Save) or the gas reserve.
  - It respects the stablecoin minimum.
  - When constrained, purchases are scaled down to the available proceeds.
  - Value is conserved.
  - It names the default purchase asset (USDC, SUI) for classes the wallet does not hold.
  - Every constraint applied and every assumption is listed.
- **Liquidity checks.** Gas reserve, earmarks above balance, stablecoin minimum, and exclusions. The first two work even without prices.
- **API and UI.**
  - `POST /api/strategy/evaluate`, with Zod validation and decimals from Tatum.
  - The Strategy page shows:
    - the assumption and temporary-storage notices
    - an allocation table with current-vs-target dumbbells and the tolerance band
    - the checks
    - the scenario
    - reference price entry with include/exclude
    - a targets and constraints form
  - Settings live in a labelled temporary per-tab store until Walrus.

**Verification (2026-10-24):**
- 27 strategy and pricing unit tests cover:
  - allocation, largest remainder, drift inside and outside the band
  - missing prices and missing decimals
  - exclusions, empty results, zero balances, and the no-targets mode
  - unconstrained rebalancing, plus earmark/gas-locked and stable-reserve-limited cases
  - a default purchase asset, both priced and unpriced, and value-only purchases
  - value conservation, schema validation, and determinism
- Live API runs against Testnet wallets:
  - With no price, the result is incomplete and no percentages are shown.
  - The vault-token wallet stays incomplete because its tokens have no published decimals.
  - A SUI wallet priced at $1.50 produced a constrained scenario: 29.878 SUI reduced and 44.817171 USDC added, because 70 SUI was locked by a 60 SUI earmark plus a 10 SUI gas reserve.
- A browser end-to-end run covered:
  - an unavailable result before prices
  - a complete result after prices
  - a scenario with the constraints after targets were set
  - no page or server errors

### Phase 6: Walrus Memory (done on the development mock; live Walrus pending)
**Network decision (2026-10-24):**
- Testnet first. The Walrus Memory Testnet relayer and dashboard still fail TLS verification: they serve a certificate for `*.up.railway.app`.
- The configured `MEMWAL_ACCOUNT_ID` exists as an object on neither Testnet nor Mainnet. This was checked read-only.
- The project owner approved developing Phase 6 against the **SDK mock**. There are **no Mainnet writes, no blockchain transactions, and no real memories**.

**Delivered (provider-independent, built against the official SDK interface):**
- **Explicit provider selection.** `MEMORY_PROVIDER=walrus|mock`; unset means disabled. There is no fallback between providers. Any non-Testnet relayer requires `ALLOW_WALRUS_MAINNET=true`, which is separate from `ALLOW_MAINNET`.
- **Adapters behind one `MemoryClient` interface.** The interface mirrors the `MemWal` methods `rememberAndWait`, `recall`, `listMemories`, and `health`.
  - `walrus.adapter.ts` uses `MemWal.create(...)` with typed error mapping (401, 429, unavailable). A write counts only when it returns a `blob_id`.
  - `mock.adapter.ts` wraps the SDK's `MemWalMock` and adds:
    - a local git-ignored JSON file, so restarts can be exercised
    - idempotency across restarts
    - **simulated** expiry (default 28 days ≈ two Mainnet epochs): expired records stop being recalled but remain listed
- **Codec.**
  - Each record is a one-line summary plus a `<<guardian:{json}>>` envelope on the last line, holding version, id, principal tag, category, source, entity, wallet, network, timestamps, supersedes, and tombstone flag.
  - It is Zod-validated on read, treated as untrusted data, and capped at 16 KB.
  - It **refuses** private keys, seed phrases, PEM keys, and bearer tokens.
- **Identity and isolation.**
  - An anonymous signed httpOnly session cookie (`SESSION_SECRET`, HMAC-SHA256) holds a random principal. **A wallet address is never treated as identity.**
  - Namespaces `prefix-principal-category` are derived on the server only. Each envelope also carries a principal tag, re-checked on decode.
- **Memory service.**
  - Writes are confirmed only once the provider returns a blob id.
  - Category listing joins recall with `listMemories` for expiry, so expired records are excluded and counted.
  - Newest-wins supersession per entity, with tombstones for deletion (Walrus cannot delete early).
  - Full history with statuses: current, superseded, deleted, expired.
  - Relevance retrieval across categories for assessments and the future copilot.
  - Records that fail validation are counted as unreadable, never silently dropped.
- **Persistence through memory:**
  - savings goals, including earmarks and contribution history (`goal`)
  - investment preferences, reference prices, targets, and constraints (`profile`)
  - Protect reviews (`security_decision`), where the server derives the context (recipients, packages, score, critical flag) from its own assessment
  - investment decisions (`investment_decision`)
- **Memory changes outcomes:**
  - **Protect** (`protect-rules/2`), applied to transactions *after* a reviewed one:
    - recipients you reviewed as *expected* are no longer scored as new
    - packages in expected transactions count as known
    - recipients you reviewed as *suspicious* add a **critical** `USER_FLAGGED_RECIPIENT` signal
    - reviewed non-critical transactions leave the open counts
  - **Critical signals are fixed before feedback and can never be cleared by it.** Reviewed critical transactions stay open and are marked "still flagged".
  - **Strategy.** A new scenario that matches a past decision shows "You rejected this kind of change on … because …".
- **UI:**
  - a memory banner on every memory-backed page that names the actual provider; the mock is never presented as Walrus
  - Security Center feedback with a note, review badges, and a memory status line
  - Savings and Strategy load from memory, with explicit loading, error, expired, unreadable, and truncated states
  - Financial Memory page: type, summary, source, saved time, status, record and blob ids, and expiry (marked "simulated" on the mock)
  - a sidebar "Mock" state
- **APIs.** `/api/memory/{goals,goals/[id],strategy,feedback,decisions,records,relevant}`. Reads never create a session; writes do.
- **`npm run check:walrus`.** Read-only by default (configuration, health, list). One synthetic test write runs only with `--write-test` **and** `CONFIRM_WALRUS_TEST_WRITE=yes`.
- **Removed:** the temporary `sessionStorage` stores and the client-side `GoalRepository`.
- **Fixed:** `handle()` now re-throws Next.js control-flow errors (`unstable_rethrow`). Read routes call `connection()`.

**Verification (2026-10-24):**
- 166 unit tests. Phase 6 added:
  - codec round-trip, injection, and key refusal
  - persistence across restart, idempotency, supersession, tombstones, and wallet scoping
  - principal isolation, including a forged envelope inside another namespace
  - simulated expiry
  - relevance retrieval
  - provider-failure propagation
  - session signing and tampering
  - savings and strategy restoration through the repositories, and feedback persistence
  - feedback influence: expected, suspicious, unsure, and the temporal rules
  - **critical signals unaffected by feedback**
- End-to-end on the running app (mock provider enabled only for the test process, live Tatum Testnet data):
  - **One "suspicious" review on a real faucet transfer turned all 63 later transfers to that recipient into high, critical findings.** A second session without the cookie saw no change.
  - A goal, reference prices, targets, and a rejected scenario survived a **server restart** in the browser.
  - The decision was recalled on the matching scenario.
  - The Memory page listed 4 records (3 current, 1 superseded), and a fresh browser session saw none.
- With memory disabled (the current `.env`), memory features report "not configured", Protect scoring still runs, and the status shows "Not set".

**Requires a live Walrus connection (not yet verified):**
- Real persistence, recall, and `listMemories` on a relayer, and real `expires_at` values instead of simulated ones.
- Relayer semantics: job latency, rate limits, the effective recall limit, and SEAL session behavior.
- Real authentication with a valid `MEMWAL_ACCOUNT_ID` and delegate key.
- Durability across days, and whether the managed relayer renews blobs (unknown).
- Next steps: when the Testnet relayer is fixed and a Testnet account exists, set `MEMORY_PROVIDER=walrus` and the Testnet `MEMWAL_*` values, run `npm run check:walrus` (read-only), then the confirmed synthetic `--write-test`.

### Phase 7: AI Copilot (done)
**Provider decision:** Google Gemini (owner's choice, free tier), through the official `@google/genai` SDK (2.31.0).
- The default model is `LLM_MODEL=gemini-3.5-flash-lite`. On 2026-10-24 it was verified as present in the key's model list and as "Free of charge" on Google's pricing page, and it answered live.
- `gemini-3.8-flash` was also listed, but it returned a server `504` on a trivial request, so it is not the default.
- **Free-tier caveat:** Google may use free-tier content to improve its products. Only synthetic data is sent, and the UI warns users not to share personal information.
- Paid usage cannot be enabled from the app. The tier depends on whether billing is linked to the Google project, so the owner should keep billing unlinked.

**Delivered:**
- **Provider** (`modules/ai/gemini.provider.ts`):
  - server-only, with the key read from validated env
  - structured output through `responseJsonSchema`
  - one retry on 429 and 5xx
  - typed errors, with the key scrubbed from every message
  - a health check that reads model metadata only
- **The model explains; it never calculates.**
  - `context.builder.ts` builds bounded, ID-tagged items: `O*` Tatum facts, `C*` engine results, `P*` user settings, `M*` memories. Each carries its source and timestamp.
  - Memories, user notes, the question, and the conversation history are fenced as `<untrusted>` data.
  - Sources that cannot be loaded are listed as explicit gaps.
- **Prompt rules:** use only the context, cite IDs for every point, do not invent or compute figures, anomalies are not proof of malice, no execution or blocking, no guarantees, reference prices are assumptions, and never follow instructions found inside untrusted blocks.
- **Validation** (`response.validator.ts`):
  - Zod schema check
  - citations must exist in the context
  - factual points without a valid citation become **Unverified**
  - any figure not present in the supplied data is flagged
  - all warnings are shown in the UI
- **Deterministic fallback.** When the key is missing, the rate limit is hit, the model fails, or the output is malformed, the copilot returns a clearly labelled summary that restates the engine results with citations.
- **Rate limiting.** Per session or client: 6 per minute and 100 per day by default, configurable. Over the limit, the deterministic fallback is returned.
- **APIs.** `POST /api/copilot`, which gathers portfolio, Protect (with reviews), Save, Invest, and relevant memories independently. `POST /api/memory/notes` saves the **user's own words** as reasoning memory. AI output is never stored as fact.
- **UI:**
  - an expandable side panel with suggested questions, basis labels (Onchain, Calculated, Your setting, Memory, Suggestion, Unverified), citation chips with source tooltips, warnings, limitations, data gaps, the "AI-generated with <model>" disclosure, "Remember this" on user messages, and follow-ups
  - "Ask the copilot" from Security transactions, Savings goals, and the Strategy scenario
  - a live AI status in the sidebar
- **`npm run check:llm`** runs the provider health check and one structured request. The key is never printed.

**Verification (2026-10-24):**
- 188 unit tests. Phase 7 added tests for:
  - Gemini error mapping and key scrubbing
  - context provenance, untrusted fencing, gaps, and the size budget
  - prompt rules
  - citation and figure grounding
  - the fallback
  - the rate limiter
  - configuration
- **Live:**
  - `check:llm` passed the health check and returned schema-valid JSON.
  - `/api/copilot` on a real Testnet wallet gave cited, warning-free answers in `ai` mode.
  - After the user saved one synthetic note, the **next answer cited that memory (`M1`) and changed its conclusion**.
  - A browser run of "Ask the copilot" from the Security Center rendered the cited answer with no page errors.
- The key was confirmed absent from the script output, logs, staged diffs, and git history.

**Limits:**
- Free-tier quotas are unpublished and set per project. When they are hit, the fallback is used.
- Small models can still phrase things imperfectly. The grounding checks flag uncited claims and unknown figures, but they cannot prove that wording is correct.
- The conversation is kept only in the browser tab. Memory is saved only when the user chooses "Remember this".
- Without memory configured, the copilot works with on-chain data and engine results only, and says so.

### Phase 8: Pre-transaction intelligence (done)
**Simulation only.** Nothing is built, signed, dry-run or broadcast. A static test checks that the assessment module contains no signing or execution calls.

**Approved design, with the owner's adjustments:**
- **Input.** A recipient address, an asset (held, or verified SUI/USDC), and an exact amount. Validated with Zod and the asset's on-chain decimals. Unknown assets and assets without published decimals are rejected with clear errors.
- **Gas.**
  - The estimate is the **median net gas fee of the wallet's past successful transactions**. It is always labelled as an estimate, never a quote.
  - SUI gas is checked for **every** transfer, including USDC and other tokens.
  - "Insufficient balance for this simulation" and "Insufficient estimated SUI gas for this simulation" are separate verdicts.
- **Conservative Max.** The estimated available amount is the balance minus savings earmarks, minus the configured SUI gas reserve, minus a gas buffer of 2× the median estimate, minus the minimum stablecoin reserve converted at the reference price (or a note when it cannot be converted). The UI shows the total balance next to the estimated available amount, with an itemised breakdown.
- **Protect (pre-execution adapter).**
  - Only rules that apply before execution are used: unusual amount, new recipient, frequency (including the hypothetical send), large outflow, and new asset.
  - First-time package use is listed as not applicable.
  - **User feedback is never passed into the onchain evidence.** A recipient you flagged produces a separate strong warning ("your own earlier assessment, not confirmed evidence of fraud"). A trusted recipient produces an informational note, and the onchain signals stay unchanged.
  - Critical onchain findings, both in the simulation and still open on the wallet, are preserved.
- **Recipient lookup.** One read-only Tatum query for recent activity:
  - cached for 5 minutes (failures for about 30 seconds), with a 6-second timeout, through the shared rate spacer
  - it never throws: "unavailable" or "no activity" become unknowns
  - "no activity" is never presented as evidence of safety
- **Save.** Before and after balances; unallocated funds; earmarked funds used; each goal's backed amount and progress before and after; reserves falling below their minimum. All of this reuses the savings engine. When the amount exceeds the balance, these figures are marked "not calculated".
- **Invest.** The transfer value at your reference price (or unknown), allocation before and after through the allocation engine, new drift-band breaches, and new stablecoin or gas reserve breaches. Without prices or preferences, it reports "unavailable" and shows no percentages.
- **Memory.** Your past reviews of the recipient, earlier checks of the recipient with your decisions, investment decisions, and relevant notes.
  - Recording "I would / would not proceed" saves a `reasoning` memory (`transfer-check:*`).
  - It is recalled in later checks: "On … you said you would not proceed …".
- **Combined result.** Every finding is categorised as one of:
  - **confirmed fact**
  - **historical pattern**
  - **your preference or decision**
  - **unknown**

  The verdict follows a fixed precedence: insufficient balance, then insufficient gas, then review carefully, then proceed with caution, then **"No issues found in the available data"** (with "this does not mean the transfer or recipient is safe"). A disclaimer is always shown.
- **AI explanation.** `POST /api/assessments/transfer/explain` **recomputes** the assessment on the server and builds a context from its findings only, with memory fenced as untrusted. It runs through the shared grounded Gemini step (citation and figure validation, rate limit, deterministic fallback) with extra simulation rules. The AI never changes the verdict.
- **APIs.** `POST /api/assessments/{transfer, spendable, transfer/explain, transfer/decision}`.
- **UI.** A "Transfer check" page with:
  - a simulation-only notice
  - the form, with the total and estimated available amounts and the Max breakdown
  - the verdict band
  - findings grouped by the four categories
  - Protect, Save, Invest, and Memory panels
  - "Explain with AI"
  - "Your decision"

**Verification (2026-10-24):**
- 223 unit tests. Phase 8 added 35, covering:
  - the gas median
  - a normal transfer ("no issues found", never "safe")
  - insufficient balance
  - **a USDC transfer that still needs SUI gas**, and sending all SUI
  - unknown gas
  - **the conservative Max**: earmarks, gas reserve and buffer, stablecoin reserve with and without a price, never negative
  - **pre-execution-only Protect signals**, flagged and trusted recipients kept separate from evidence, and preserved criticals
  - open wallet criticals and thin history
  - **recipient lookup**: active, no activity, error, timeout, cache, and retry
  - earmark and reserve impact, Invest before/after and band breach, missing prices
  - memory recall and memory-not-consulted
  - self-transfers and system addresses
  - a wording guard (no "safe", "guarantee" or "blocked")
  - a static simulation-only check
  - explanation context and fallback
- Live on Testnet, with mock memory and Gemini:
  - 1 SUI to a previously paid recipient: no signals, gas covered (median of 200 transactions).
  - 500 SUI to a fresh recipient: critical amount signal, "Review carefully", and "no recipient activity" reported as an unknown.
  - USDC not held: "Insufficient balance for this simulation".
  - An invalid recipient was rejected with a 400.
  - The decision was recorded and recalled in the next check.
  - The Gemini explanation was fully cited with no grounding warnings.
- A browser end-to-end run covered Max filling the conservative amount, the verdict, the AI explanation, and decision recall, with no page or server errors.

**Limits:**
- Gas is a historical estimate. Real costs depend on the transaction that is eventually built.
- The recipient lookup sees only the node's available history (checkpoint 314,252,673 onward).
- Stablecoin reserves apply to the single asset being sent.
- Memory remains the development mock until Walrus Testnet is available.

### Landing page (done)
A public marketing page at `/`. It sits outside the dashboard shell and loads none of its providers.

**Routing:**
- `/` is the landing page, in the `src/app/(marketing)` route group with its own layout.
- `/dashboard` is the Overview, moved from `(dashboard)/page.tsx`. All other app routes (`/security`, `/savings`, `/strategy`, `/assess`, `/memory`) and every `/api/*` route are unchanged.
- `/?address=0x…` redirects to `/dashboard?address=0x…` (`next.config.ts`), so shared watch links keep working.

**Implementation:**
- Components are in `src/components/marketing/`, one per section. Static product previews are in `previews/`; they reuse the app's tokens and copy (verdict titles, finding categories, basis labels, disclaimer) so they match the product.
- All preview figures come from one synthetic scenario (`scenario.ts`) and every preview frame is labelled *Illustrative*.
- Server-rendered and prerendered as static. The only client components are the mobile menu and the Copilot question switcher.
- Scroll reveals use CSS scroll-driven animations (no JavaScript; content stays visible where they are unsupported). All motion is disabled under `prefers-reduced-motion`.
- The theme is scoped to `.marketing` in `(marketing)/marketing.css`, so the dashboard palette is unchanged.
- SEO: page metadata, canonical URL, Open Graph and Twitter tags, `robots.txt`, `sitemap.xml`, and an SVG icon. The social preview is a static `public/og-image.png` (1200×630), regenerated with `npm run og:image`.
- Absolute URLs come from `SITE_URL`, falling back to Vercel's injected URLs (branch URL on previews, `VERCEL_PROJECT_PRODUCTION_URL` in production) and then to localhost. An earlier deploy without `SITE_URL` pointed `og:image` at localhost, so X showed no image.

**Claims policy.** Walrus Memory is described as the intended persistence layer, integrated through the official SDK. The demo runs on the labelled development mock, and live persistence is shown as not yet verified. Transfer check is described as simulation-only. The technology section states that no partnership or endorsement is implied.

**Verification (2026-10-24):**
- Typecheck, lint, unit tests and a production build pass.
- Checked in headless Chrome at 1440 px and at 390 px with mobile emulation. There is no horizontal overflow, and the mobile menu and Copilot tabs work.
- Lighthouse, mobile: Performance 94, Accessibility 100, Best Practices 100, SEO 100. Desktop: 100 in all four.

### Phase 9: Demo and hardening
- Seed script, README, end-to-end demo script, and a UI polish pass at desktop and mobile widths.

---

## 5. Environment variables

| Variable | Phase | Notes |
|---|---|---|
| `SITE_URL` | Landing | Optional public origin for Open Graph, canonical and sitemap URLs. On Vercel it defaults to the deployment's own URL; locally to `http://localhost:3000`. |
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
| **B1** | Walrus Memory Testnet relayer and dashboard have a broken TLS certificate (still broken on 2026-10-24). | **Resolved by decision** | The owner authorized the **Walrus Memory Mainnet hosted relayer** for development and demos, with non-sensitive synthetic data only. Tatum stays on Testnet. Setup steps, required transactions, and env vars are in `docs/WALRUS_INTEGRATION.md`. |
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
2. ~~**Q2.**~~ Resolved: use the Walrus Memory Mainnet hosted relayer with synthetic data only. Account setup involves two sponsored Mainnet transactions that need the owner's confirmation (see `docs/WALRUS_INTEGRATION.md` §2).
3. **Q3 (partly resolved).** CoinGecko will be used for verified Mainnet assets later, and Testnet prices are never invented. Still open for Phase 5: how Testnet allocation percentages should be shown. Options are (a) token-unit allocation only, with no cross-asset percentages, (b) user-entered reference prices labelled as assumptions, or (c) defer cross-asset allocation to Mainnet.
4. **Q4.** Please confirm the hackathon rules, in particular whether ≥10 Walrus memory records are required and any mandatory Tatum products.
5. ~~**Q5.**~~ Resolved: Google Gemini, free tier (`GEMINI_API_KEY`, `LLM_MODEL`).
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
| 2026-10-24 | 4 Save | Done | The engine, evaluate API, and Savings UI are complete, with 101 unit tests passing. The live API and a browser end-to-end run were verified. Persistence is a labelled temporary per-tab store behind `GoalRepository` because of B1. The `PriceProvider` abstraction was added. |
| 2026-10-24 | 5 Invest | Done | The allocation engine, reference-price pricing, strategy API, and Strategy UI are complete, with 128 unit tests passing. The live API and a browser end-to-end run were verified. |
| 2026-10-24 | 6 Walrus prep | Prepared | Read-only research covered the SDK, account setup, authentication, write/read flow, and retention. No Mainnet writes were made. See `docs/WALRUS_INTEGRATION.md`. |
| 2026-10-24 | 6 Memory | Done on mock | The memory layer, sessions, isolation, persistence for goals, strategy, reviews, and decisions, memory-driven Protect personalization, and the Financial Memory page are complete, with 166 tests passing. End-to-end verified with the mock provider plus live Tatum data. A live Walrus connection is still pending (see the Phase 6 section). |
| 2026-10-24 | 7 Copilot | Done | The Gemini provider (verified live), grounded context, citation and figure validation, deterministic fallback, rate limiting, copilot panel, and "Remember this" notes are complete, with 188 tests passing. Memory changing the AI's answer was verified live. |
| 2026-10-24 | 8 Transfer check | Done | The simulation-only four-pillar assessment, pre-execution Protect adapter, gas and conservative Max, recipient lookup, decision recall, and grounded explanation are complete, with 223 tests passing. Live and browser runs were verified. |
| 2026-10-24 | Landing page | Done | Public landing page at `/`; the Overview moved to `/dashboard`, with a redirect for `/?address=` links. Typecheck, lint, tests and build pass. Verified in a browser at desktop and mobile sizes; Lighthouse results are in the Landing page section. |
