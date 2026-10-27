# Guardian AI — Technical Architecture

**Status:** Proposed Architecture  
**Project:** Guardian AI — Memory-Powered Onchain Finance & Security Copilot  
**Target:** Tatum Total Recall Hackathon MVP

## 1. Architecture Overview

Guardian AI is a standalone web application that provides personalized onchain security monitoring, savings planning, and investment strategy guidance.

The system has three core product domains:

- **Protect:** Behavioral anomaly detection and transaction risk assessment.
- **Save:** Savings goals, financial planning, and progress tracking.
- **Invest:** Portfolio allocation analysis and strategy guidance.

These domains share a common intelligence layer powered by Tatum blockchain data, Walrus Memory, and an LLM.

### Architecture Principles

1. Build a modular monolith rather than microservices.
2. Keep blockchain integrations provider-specific but expose normalized internal interfaces.
3. Keep financial calculations and anomaly scoring deterministic.
4. Use AI for interpretation, explanation, and contextual recommendations.
5. Treat Walrus Memory as persistent contextual memory, not the source of truth for current blockchain state.
6. Use a database for application state when needed, not as a replacement for Walrus Memory.
7. Support watch-only wallet analysis without requiring wallet signatures.
8. Prioritize working, verifiable integrations over architectural complexity.

## 2. High-Level System Architecture

```text
                       ┌───────────────────────────┐
                       │        Guardian AI        │
                       │       Next.js Web App     │
                       │                           │
                       │  Overview / Protect       │
                       │  Save / Invest / Copilot  │
                       └─────────────┬─────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │    Backend API Layer      │
                       │  Next.js Route Handlers   │
                       │                           │
                       │  Validation / Auth        │
                       │  Rate Limiting / Logging  │
                       └─────────────┬─────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
       │ Portfolio      │  │ Security       │  │ Financial      │
       │ Service        │  │ Engine         │  │ Planning       │
       │                │  │                │  │ Engine         │
       │ Balances       │  │ Baselines      │  │ Savings        │
       │ Transactions   │  │ Anomalies      │  │ Allocations    │
       │ Asset Data     │  │ Risk Scoring   │  │ Strategies     │
       └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
               │                   │                   │
               └───────────────────┼───────────────────┘
                                   ▼
                       ┌───────────────────────────┐
                       │     AI Orchestrator       │
                       │                           │
                       │ Context Assembly          │
                       │ Memory Retrieval          │
                       │ Recommendation Generation │
                       │ Explanation Generation    │
                       └─────────────┬─────────────┘
                                     │
                         ┌───────────┴───────────┐
                         ▼                       ▼
                ┌────────────────┐     ┌────────────────┐
                │ Walrus Memory  │     │ LLM Provider   │
                │                │     │                │
                │ Goals          │     │ Explanations   │
                │ Preferences    │     │ Recommendations│
                │ Decisions      │     │ Conversation   │
                │ Feedback       │     │                │
                └────────────────┘     └────────────────┘

       External blockchain data:
       Portfolio Service → Tatum Sui RPC → Sui Blockchain

       Application state:
       Backend Services → PostgreSQL
```

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Lucide |
| Backend | Next.js Route Handlers and server-side services |
| Validation | Zod |
| Blockchain Data | Tatum Sui RPC |
| Persistent AI Memory | Walrus Memory |
| AI | Configurable LLM provider |
| Application Database | PostgreSQL + Drizzle ORM |
| Charts | Recharts or equivalent |
| Testing | Vitest |
| Deployment | Vercel or compatible Node.js hosting |

Use environment variables for external credentials and service configuration.

Before implementation, verify current Tatum and Walrus API capabilities and adapt the interfaces accordingly.

## 4. Project Structure

```text
guardian-ai/
├── CLAUDE.md
├── docs/
│   ├── PRD.md
│   ├── DESIGN.md
│   └── ARCHITECTURE.md
│
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── overview/
│   │   │   ├── security/
│   │   │   ├── savings/
│   │   │   ├── strategy/
│   │   │   └── copilot/
│   │   │
│   │   └── api/
│   │       ├── portfolio/
│   │       ├── security/
│   │       ├── goals/
│   │       ├── memory/
│   │       ├── recommendations/
│   │       └── copilot/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── portfolio/
│   │   ├── security/
│   │   ├── savings/
│   │   ├── strategy/
│   │   └── copilot/
│   │
│   ├── modules/
│   │   ├── blockchain/
│   │   │   ├── tatum.client.ts
│   │   │   ├── sui.adapter.ts
│   │   │   └── blockchain.types.ts
│   │   │
│   │   ├── portfolio/
│   │   │   ├── portfolio.service.ts
│   │   │   └── portfolio.types.ts
│   │   │
│   │   ├── security/
│   │   │   ├── baseline.service.ts
│   │   │   ├── anomaly.engine.ts
│   │   │   ├── risk.engine.ts
│   │   │   └── security.types.ts
│   │   │
│   │   ├── savings/
│   │   │   ├── goals.service.ts
│   │   │   ├── savings.engine.ts
│   │   │   └── savings.types.ts
│   │   │
│   │   ├── strategy/
│   │   │   ├── allocation.engine.ts
│   │   │   ├── strategy.service.ts
│   │   │   └── strategy.types.ts
│   │   │
│   │   ├── memory/
│   │   │   ├── walrus.adapter.ts
│   │   │   ├── memory.service.ts
│   │   │   └── memory.types.ts
│   │   │
│   │   └── ai/
│   │       ├── agent.service.ts
│   │       ├── context.builder.ts
│   │       ├── prompt.templates.ts
│   │       └── ai.types.ts
│   │
│   ├── db/
│   │   ├── schema.ts
│   │   └── client.ts
│   │
│   └── lib/
│       ├── env.ts
│       ├── errors.ts
│       └── logger.ts
│
├── tests/
├── scripts/
├── .env.example
└── package.json
```

## 5. Blockchain Data Layer — Tatum

### Responsibility

The blockchain module retrieves and normalizes Sui blockchain information through Tatum.

### Required Capabilities

- Validate Sui addresses.
- Retrieve wallet balances.
- Retrieve transaction history.
- Retrieve transaction details.
- Extract transfer information.
- Identify relevant Move package interactions.
- Support pagination and rate-limit handling.

### Internal Interface

```typescript
interface BlockchainProvider {
  getBalances(address: string): Promise<TokenBalance[]>;

  getTransactions(
    address: string,
    cursor?: string
  ): Promise<PaginatedTransactions>;

  getTransactionDetails(
    digest: string
  ): Promise<NormalizedTransaction>;
}
```

The implementation must map actual Tatum responses into these internal models.

Do not assume that every Sui RPC endpoint directly provides address-indexed transaction history. Verify supported query methods, pagination behavior, and transaction-effect structures.

### Data Ownership

Tatum is the source for current and historical onchain observations.

Walrus must not be used as a substitute for live blockchain data.

## 6. Portfolio Service

The Portfolio Service converts blockchain balances and transactions into user-facing financial information.

### Responsibilities

- Aggregate token balances.
- Classify supported assets.
- Calculate portfolio allocations.
- Identify historical inflows and outflows.
- Provide normalized data to Security and Strategy modules.

### Asset Classification

Use explicit token metadata and trusted asset identifiers.

Do not classify a token as a stablecoin based solely on its symbol.

### Pricing

Use a documented external pricing source when available.

If prices are unavailable, return token-denominated balances without fabricated USD valuations.

Include valuation timestamps and source information.

## 7. Security Engine

The Security Engine detects deviations from a wallet's historical behavior.

### Behavioral Baseline

Calculate:

- Median transfer amount.
- Transfer amount percentiles.
- Known recipient addresses.
- Typical transaction frequency.
- Previously interacted Move packages.
- Recent outgoing transfer patterns.

### Anomaly Detection

Use deterministic scoring rules.

Example risk signals:

| Signal | Example |
|---|---|
| Unusual amount | Transfer exceeds historical percentile |
| New recipient | Recipient absent from known history |
| Unusual frequency | Sudden increase in transactions |
| New contract | First interaction with a Move package |
| Large outflow | Significant reduction in portfolio holdings |

### Risk Model

Return:

```typescript
interface SecurityAssessment {
  transactionId?: string;
  score: number;
  severity: "low" | "medium" | "high";
  signals: RiskSignal[];
  explanation?: string;
  confidence: "low" | "medium" | "high";
}
```

Scores must be reproducible and explainable.

Avoid presenting anomalies as confirmed malicious activity.

When history is insufficient, explicitly report low confidence.

### Implemented model (protect-rules/1, 2026-10-24)

- **Point-in-time evaluation.** Each historical transaction sent by the wallet is a `Candidate`, scored against a baseline built only from strictly earlier transactions. The same `Candidate` shape will score hypothetical transfers in the unified assessment.
- **Input data.**
  - Up to the 200 most recent contiguous transactions from the Tatum `ListTransactions` `affected_address` query, plus current balances.
  - Balances immediately before each transaction are reconstructed by walking backwards from the current balances. If the walk ever goes negative, it is marked unreliable from that point on, and the large-outflow rule reports a limitation instead of guessing.
  - The history loader re-checks the newest digest after fetching balances, so both describe the same moment.
- **Assessment output.** `SecurityAssessment` adds `limitations` (rules that could not be evaluated, with the reason), `notes` (evaluated but intentionally scored zero), `baselineSize`, and `critical` on each signal. Severity includes `none`. Confidence includes `insufficient`.
- **Scope.** Only successful transactions sent by the wallet are assessed. Incoming transfers and failed transactions are excluded, and the Security Center states this.
- **No LLM in scoring.** Explanations are deterministic templates. Phase 7 may add LLM explanations, but they must cite these signals and must not change scores.
- **Known limitations.**
  - Pruned history: the node serves only from checkpoint 314,252,673 onward.
  - High-throughput wallets often span less than 3 days within 200 transactions, so the frequency rule is skipped for them.
  - DEX swaps against shared-object pools have no recipient address, so the new-recipient rule does not apply to them.
  - Monitoring is historical with manual refresh. Nothing runs in real time, and nothing blocks transactions.

### Feedback

Users may classify an alert as:

- Expected
- Suspicious
- Unsure

Feedback is written to Walrus Memory and may influence future assessments.

Do not allow user feedback to disable mandatory safety checks.

## 8. Savings Engine

### Responsibilities

- Create and update savings goals.
- Calculate progress.
- Calculate remaining required contributions.
- Identify deviations from planned progress.
- Generate savings-related signals for the AI agent.

### Savings Goal Model

```typescript
interface SavingsGoal {
  id: string;
  ownerId: string;
  name: string;
  asset: string;
  targetAmount: string;
  targetDate: string;
  monthlyContribution?: string;
  createdAt: string;
}
```

Use decimal-safe arithmetic for financial calculations.

Goal progress must use explicitly allocated balances or a clearly defined tracking methodology.

### Implemented model (2026-10-24)

- **Goals.** A goal is a `target` (an amount by a date) or a `reserve` (a minimum set aside). Progress comes from **dated allocation events**, which earmark or release funds. The wallet balance is never counted toward a goal automatically.
- **Coverage.** Earmarks are checked against the live Tatum balance. When an asset is over-committed, reserves are backed first and then targets oldest first. Progress uses the backed amount.
- **Arithmetic.** All calculations use integer smallest units. The required monthly amount is rounded up. A month is 365.2425 / 12 days. The evaluation date is passed in, never read from the clock. The schedule compares against a straight-line plan from 0 on the start date to the target on the target date.
- **Persistence.** Persistence is behind `GoalRepository`. Until Walrus Memory is available (blocker B1), the only implementation is a labelled temporary per-tab `sessionStorage` store. It is not durable, and the UI says so.

### Pricing

Valuation goes through a provider-independent `PriceProvider` interface. Every quote carries its source and timestamp, and a missing price is an explicit `unavailable` result, never an estimate. The only implementation today, `NoPriceProvider`, returns "unavailable", because Testnet assets have no market price. A CoinGecko provider is planned for verified Mainnet assets, matched by full coin type, never by symbol.

## 9. Investment Strategy Engine

### Responsibilities

- Calculate current asset allocation.
- Compare current allocation against user targets.
- Detect allocation drift.
- Calculate illustrative rebalancing scenarios.
- Apply user-defined liquidity constraints.

### Example Output

```typescript
interface AllocationAssessment {
  currentAllocation: Record<string, number>;
  targetAllocation: Record<string, number>;
  deviations: Record<string, number>;
  liquidityWarnings: string[];
  suggestedAdjustments: SuggestedAdjustment[];
}
```

The engine produces calculations and scenarios, not guaranteed investment outcomes.

## 10. Walrus Memory Layer

### Responsibility

Persist and retrieve user-specific context that improves future financial and security decisions.

### Memory Categories

- `profile`
- `goal`
- `behavior`
- `security_decision`
- `investment_decision`
- `reasoning`

### Internal Interface

```typescript
interface MemoryProvider {
  write(memory: MemoryInput): Promise<MemoryRecord>;

  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>;

  list(ownerId: string): Promise<MemoryRecord[]>;
}
```

These are internal application interfaces, not claims about native Walrus SDK methods.

Implement the adapter against the verified Walrus Memory API.

### Memory Record

```typescript
interface MemoryRecord {
  id: string;
  ownerId: string;
  walletAddress?: string;
  category: string;
  content: string;
  createdAt: string;
  source: "user" | "system" | "ai";
  metadata?: Record<string, unknown>;
}
```

### Memory Write Flow

1. User performs an action or provides feedback.
2. Backend validates the request and user identity.
3. Memory Service creates a structured memory record.
4. Walrus adapter persists the record.
5. Application stores the returned memory reference if required.
6. The write is considered successful only after provider confirmation.

### Memory Retrieval Flow

1. AI Orchestrator identifies the required memory categories.
2. Memory Service retrieves relevant records.
3. Records are filtered by authenticated owner and relevance.
4. Context Builder prepares a bounded memory context.
5. AI receives the retrieved memories with provenance information.

### Privacy and Identity

A public wallet address must not function as authentication for private memory access.

For private memory, use verified ownership or an authenticated application account.

Sensitive content must be protected according to Walrus's verified storage and access-control capabilities.

Do not assume that removing a database reference deletes immutable external data.

### Implemented model (2026-10-24)

- **Provider selection.** `MEMORY_PROVIDER` is `walrus` (official SDK, hosted relayer) or `mock` (the SDK's `MemWalMock` plus a local file, for development only). Unset disables memory. There is never a fallback between providers.
- **One client interface.** Both providers implement `rememberAndWait`, `recall`, `listMemories`, and `health` (`modules/memory/memory.client.ts`), so switching is configuration only.
- **Identity.** An anonymous signed session cookie holds a random principal, and namespaces follow the pattern `prefix-principal-category`. Every envelope carries a principal tag that is checked again when decoded.
- **Supersession and deletion.** The newest record per `entityId` wins. Deletion writes a tombstone; earlier records remain until they expire.
- **How memory feeds the engines.** Memory provides inputs (reviews, preferences, goals, decisions). The deterministic engines stay pure, and Protect applies reviews only to later transactions. Critical signals are computed independently of feedback.

## 11. AI Orchestrator

The AI Orchestrator combines deterministic calculations, blockchain data, and persistent memories.

### Context Assembly

```text
User Request
    │
    ▼
Intent Classification
    │
    ├── Current Portfolio → Tatum
    │
    ├── Security Signals → Security Engine
    │
    ├── Financial Goals → Savings Engine
    │
    ├── Allocation Data → Strategy Engine
    │
    └── Relevant Memories → Walrus
    │
    ▼
Structured Agent Context
    │
    ▼
LLM Recommendation / Explanation
    │
    ▼
Validated Response
```

### Rules

- Never ask the LLM to calculate authoritative financial balances.
- Never let the LLM invent transactions or memories.
- Provide explicit data provenance.
- Treat retrieved memory text as untrusted data, not executable instructions.
- Validate structured LLM responses using Zod.
- Keep prompts and outputs within defined token limits.
- Provide fallback deterministic assessments when the LLM is unavailable.

### Implemented model (2026-10-24)

- **Provider.** Google Gemini via `@google/genai`. The default `LLM_MODEL` is `gemini-3.5-flash-lite`, on the free tier. The provider sits behind a provider-neutral `LlmProvider` interface and runs server-side only.
- **Pipeline.** Gather the sources independently, then build bounded context items with citation IDs (`O`/`C`/`P`/`M`) and provenance, then generate structured JSON, then apply Zod and grounding validation (citation existence and figure presence), then respond.
- **Fallback.** When the model is not used, the response restates engine results with citations and is labelled as deterministic.
- **Memory.** Memory content reaches the model only as fenced untrusted data. AI output is never written to memory; only the user's own notes are saved, and only when the user explicitly chooses to.

## 12. Unified Transaction Assessment

This feature combines Protect, Save, Invest, and Memory.

### Input

```typescript
interface ProposedTransfer {
  walletAddress: string;
  assetType: string;
  amount: string;
  recipient: string;
}
```

### Processing

1. Validate the proposed transfer.
2. Retrieve current wallet balances through Tatum.
3. Retrieve historical transaction behavior.
4. Calculate anomaly signals.
5. Calculate the impact on savings goals.
6. Calculate the impact on portfolio allocation.
7. Retrieve relevant previous decisions from Walrus.
8. Generate a consolidated explanation.

### Output

```typescript
interface UnifiedAssessment {
  security: SecurityAssessment;
  savingsImpact: SavingsImpact;
  allocationImpact: AllocationAssessment;
  relevantMemoryIds: string[];
  recommendation: string;
  warnings: string[];
}
```

For MVP, this is a planning and assessment feature.

It does not automatically execute transactions or block transactions initiated in external wallets.

### Implemented model (2026-10-24)

- **Modules.** `modules/assessment/` contains `transfer.engine.ts` (pure), `transfer.service.ts` (data gathering), `recipient.ts` (a cached, time-boxed read-only lookup), and `explain.ts` (the AI context).
- **Protect before execution.** Protect uses an allow-list of rules that apply before execution. User feedback is reported as a separate memory finding and never enters the onchain score.
- **Gas.** The gas figure is the wallet's historical median net fee, labelled as an estimate. SUI gas is checked for every asset.
- **Max.** The conservative "Max" deducts earmarks, the configured reserves, and a 2× gas buffer.
- **Findings and verdict.** Each finding is categorised as a fact, historical pattern, preference/decision, or unknown. The verdict follows a fixed precedence, and its wording never claims safety or success.
- **Explanation.** The explanation recomputes the assessment on the server and reuses the grounded LLM step. It cannot alter the verdict.

### Wallet-signed execution (2026-10-27)

When the analysed address is the connected wallet's account, the transfer check becomes a real pre-signing check.

1. **Prepare** (`POST /api/transactions/transfer/prepare`). The server runs the unified assessment, then builds the transfer with `@mysten/sui` (`coinWithBalance` + `transferObjects`) and simulates it with `SimulateTransaction`. Both go through Tatum's gRPC gateway. Tatum rejects grpc-web, so `modules/blockchain/sui.sdk.ts` gives `SuiGrpcClient` a `@grpc/grpc-js` transport (`@protobuf-ts/grpc-transport`) that shares the read adapter's spacer, shared budget and retries.
2. **Interpret** (`modules/execution/simulation.ts`, pure and tested). The simulated balance changes must be exactly the request: the recipient gains the amount, the sender loses the amount plus net gas (gas in SUI only), and nothing else moves. The signing policy blocks on insufficient balance, build or simulation failure, a mocked gas coin, or an intent mismatch. Critical findings, a `review_carefully` verdict, or high Protect severity require an explicit acknowledgement. Memory and feedback never remove that acknowledgement. A successful node simulation supersedes the historical gas estimate.
3. **Sign.** The browser passes the built BCS bytes to the wallet through the Wallet Standard (`@mysten/wallet-standard`, `sui:signTransaction`), so the wallet cannot re-resolve gas or inputs. If the wallet returns different bytes, nothing is sent.
4. **Execute** (`POST /api/transactions/execute`). Prepare issues an HMAC ticket (`modules/execution/ticket.ts`, keyed with the Tatum API key, 10-minute TTL) that binds the digest to the sender. Execute recomputes the digest from the submitted bytes, checks the sender and the ticket, then calls `ExecuteTransaction` through Tatum. The endpoint therefore broadcasts only transactions Guardian assessed and is not a general relay.

Verified live on Tatum Testnet on 2026-10-27: build, simulation (node gas and balance changes), and `ExecuteTransaction` routing, with an invalid signature rejected by the node. A real broadcast was not run, because the public faucet refuses scripted requests and no funded test key was available.

Limits: only plain single-asset transfers are built. Connecting a wallet does not change memory access, which is still keyed to the signed session cookie. Transfers made in the wallet itself or in other dApps are not seen.

## 13. Application Database

Use PostgreSQL for operational application state when needed.

Suggested tables:

- `users`
- `wallets`
- `savings_goals`
- `allocation_targets`
- `security_assessments`
- `recommendations`
- `memory_references`

### Storage Separation

**PostgreSQL**

- User authentication and ownership
- Application configuration
- Current goal definitions
- Assessment history
- Memory identifiers and references

**Walrus Memory**

- Historical user decisions
- Preference changes
- Explanations and feedback
- Long-lived contextual knowledge

**Tatum**

- Current blockchain balances
- Transaction records
- Onchain activity

Avoid maintaining conflicting authoritative copies of the same data.

## 14. API Design

Suggested endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/portfolio/:address` | Portfolio overview |
| GET | `/api/security/:address` | Security assessment |
| POST | `/api/security/feedback` | Security feedback |
| GET | `/api/goals` | List savings goals |
| POST | `/api/goals` | Create savings goal |
| PATCH | `/api/goals/:id` | Update savings goal |
| GET | `/api/strategy` | Allocation assessment |
| POST | `/api/assessments/transfer` | Unified transaction assessment |
| POST | `/api/transactions/transfer/prepare` | Assess, build and simulate a transfer for a connected wallet |
| POST | `/api/transactions/execute` | Broadcast wallet-signed bytes Guardian prepared |
| POST | `/api/copilot` | AI conversation |
| GET | `/api/memory` | Authorized memory history |

All user-specific endpoints must enforce ownership and authorization.

Public blockchain queries may be supported in watch-only mode, with appropriate rate limits.

## 15. Error Handling and Observability

Implement:

- Structured server-side logging.
- Request IDs.
- External provider timeout handling.
- Tatum rate-limit handling.
- Walrus read/write failure handling.
- AI provider error handling.
- Input validation errors.
- User-friendly frontend error states.

Never silently return fabricated successful results when external providers fail.

## 16. Testing Strategy

### Unit Tests

- Transaction normalization.
- Behavioral baseline calculations.
- Anomaly scoring.
- Savings calculations.
- Portfolio allocation calculations.
- Unified assessment logic.

### Integration Tests

- Tatum provider adapter.
- Walrus persistence and retrieval.
- Database operations.
- AI structured output validation.

### End-to-End Demo Test

1. Load a real Sui address through Tatum.
2. Display its portfolio and historical activity.
3. Generate an explainable anomaly.
4. Create a savings goal.
5. Submit user feedback.
6. Persist feedback through Walrus.
7. Retrieve feedback in a subsequent assessment.
8. Demonstrate changed personalized guidance.

## 17. Implementation Phases

### Phase 1 — Foundation

- Initialize Next.js.
- Configure TypeScript, Tailwind, and shadcn/ui.
- Create application shell.
- Configure environment validation.

### Phase 2 — Blockchain and Portfolio

- Implement Tatum adapter.
- Retrieve balances and transaction history.
- Normalize transaction data.
- Build portfolio dashboard.

### Phase 3 — Protect

- Behavioral baseline.
- Anomaly detection.
- Risk scoring.
- Security Center.

### Phase 4 — Save and Invest

- Savings goals.
- Portfolio allocation.
- Strategy calculations.
- Financial dashboard components.

### Phase 5 — Walrus Memory

- Implement memory adapter.
- Store user preferences and feedback.
- Retrieve relevant memories.
- Verify real persistence.

### Phase 6 — AI Intelligence

- Implement context assembly.
- Integrate LLM.
- Generate memory-aware recommendations.
- Build AI Copilot.

### Phase 7 — Unified Assessment

- Combine Protect, Save, Invest, and Memory.
- Build proposed transfer assessment.
- Implement feedback loop.

### Phase 8 — Demo and Quality

- Integration testing.
- Demo scenarios.
- UI polish.
- README and deployment.
- Verify hackathon submission requirements.

## 18. Architecture Decisions

**ADR-001: Modular Monolith**

Use a single Next.js application with modular backend services to minimize operational complexity.

**ADR-002: Tatum as Blockchain Data Provider**

Use Tatum Sui RPC for blockchain reads. Do not build a custom blockchain indexer unless required by documented API limitations.

**ADR-003: Walrus as Persistent Contextual Memory**

Use Walrus for historical context and personalized reasoning, not for live financial balances.

**ADR-004: Deterministic Risk and Financial Engines**

Use explicit algorithms for numerical calculations and the LLM for interpretation.

**ADR-005: Watch-Only First**

Allow public wallet analysis without requiring signatures. Require authenticated ownership for private financial memories.

**ADR-006: Human-Authorized Financial Actions**

No autonomous transaction execution in the MVP.

**ADR-007: Evidence-Based Recommendations**

Every security finding and financial recommendation must be traceable to current blockchain data, deterministic calculations, or retrieved user memories.

**ADR-008: User-Signed Execution Through Guardian-Built Transactions**

Guardian may build and broadcast a transaction only when the user's own wallet signs the exact bytes Guardian simulated and assessed. Guardian holds no keys, never signs, and does not claim to intercept transactions initiated elsewhere. This refines ADR-006: execution is always human-authorized.

## 19. Open Technical Questions

Resolve these against current official documentation before implementation:

1. Which Tatum Sui RPC methods support address transaction discovery and historical pagination?
2. How should Sui programmable transactions and balance changes be normalized?
3. What are the current Walrus Memory SDK methods, authentication requirements, and retrieval semantics?
4. What privacy and access-control guarantees does Walrus provide?
5. Which price data source should be used for token valuation?
6. What authentication method should protect user-specific goals and memories?
7. Does the hackathon require specific Walrus Memory record counts or integration demonstrations?

Record verified answers and update this document accordingly.

### Verified answers (2026-10-24)

Full detail and sources are in `docs/IMPLEMENTATION_PLAN.md` §1.

1. **Tatum transaction discovery.** Tatum exposes Sui Testnet over **gRPC only** (`sui-testnet-grpc.gateway.tatum.io:443`, with an `x-api-key` metadata header). JSON-RPC is deprecated on Sui, and public fullnodes reject it. Address history uses `LedgerService/ListTransactions` with a `TransactionFilter` (`affected_address` / `sender`) and cursor pagination through `QueryOptions`. This was verified live on Tatum Testnet on 2026-10-24. History is served from checkpoint 314,252,673 onward, and the free tier rate-limits at a few requests per second (HTTP 429), so the client spaces its requests.
2. **Normalisation.** `ExecutedTransaction` (with `read_mask`) provides balance changes, effects, and the programmable transaction commands. Move calls are taken from the `MoveCall` commands, and amounts from `balance_changes`. These are mapped in `sui.adapter.ts`.
3. **Walrus Memory SDK.** `@mysten-incubation/memwal` provides `remember` / `rememberAndWait` (async job ending in a `blob_id`), `recall` (semantic, `limit` ≤ 100, `sort: "recent"`), `listMemories` (metadata only), `restore`, and `health`. There is no delete method. Auth uses an Ed25519 delegate key plus a `MemWalAccount` ID. The Testnet relayer was `relayer-staging.memory.walrus.xyz` (retired; on 2026-10-24 it was serving an invalid TLS certificate); since 2026-10-27 it is `relayer.dev.memwal.ai`, and the integration targets the Mainnet relayer `relayer.memory.walrus.xyz` (blocker B1).
4. **Privacy.** Content is Seal-encrypted on Walrus, which is public and immutable. The managed relayer sees plaintext. Namespaces are not a security boundary, so the server must enforce the mapping from principal to namespace.
5. **Price source.** None is available for Testnet assets. Balances are token-denominated until the price source is decided (open question Q3).
6. **Authentication.** Memories are keyed to a signed-cookie session principal, or to a verified wallet (signed personal message). They are never keyed to a bare public address.
7. **Hackathon requirements.** No public rules were found under the name "Total Recall", so this is still open (Q4).

**Resulting changes:**
- The blockchain adapter is gRPC.
- PostgreSQL is deferred, and Walrus is the store of record for goals, preferences, and decisions, read with newest-wins supersession.
- Memory namespaces follow the pattern `guardian:v1:<principal>:<category>`.

## 20. Definition of Done

The architecture is successfully implemented when:

- Real Tatum blockchain data is retrieved and normalized.
- The security engine detects and explains anomalies.
- Savings and investment calculations are reproducible.
- Walrus persists and retrieves meaningful memories.
- Retrieved memories change subsequent recommendations.
- Private data access is properly authorized.
- AI responses are grounded in verifiable context.
- The UI presents a cohesive Protect, Save, and Invest experience.
- The demo is reproducible and documented.

**Architecture goal:** Build a reliable, explainable financial intelligence system in which Tatum supplies blockchain observations, Walrus supplies persistent personal context, and Guardian AI turns both into actionable security and financial guidance.