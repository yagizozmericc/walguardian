# Demo script

A reproducible 6–8 minute walkthrough showing that Tatum supplies onchain data, memory supplies persistent context, and Walguardian combines them. Every step below runs against live Sui **Testnet** data. Nothing is signed, sent or executed.

## What is real and what is not

| Part | Source | Label in the UI |
|---|---|---|
| Balances, transactions, behavioral baseline | **Live**, Tatum Sui Testnet (gRPC) | "Testnet" network badge, data timestamps |
| Demo wallet | A **third-party** public Testnet address. Read-only; we do not own it | "Third-party demo wallet" |
| Goals, strategy, liquidity note | **Synthetic demo data** loaded on request | "Synthetic" tag, `[Synthetic demo]` prefix |
| Reviews, decisions, notes you add during the demo | Your input, stored in memory | Provenance and timestamp on each record |
| Memory store | **Development mock** (`MemWalMock` + local file), not Walrus. See [Known limitations](#known-limitations) | "Development mock (not Walrus)" banners |
| Reference prices | User assumptions. Testnet assets have no market price | "At your reference prices (assumptions)" |
| AI explanations | Gemini free tier, restating deterministic results with citations | "Gemini, grounded in the findings above". Deterministic fallback without a key |

## Setup

```bash
npm install
cp .env.example .env.local
# .env.local:
#   TATUM_API_KEY=<Tatum Sui Testnet key>
#   MEMORY_PROVIDER=mock
#   SESSION_SECRET=<64 hex chars>      # openssl rand -hex 32
#   GEMINI_API_KEY=<optional, free tier>
#   DEMO_WALLET_ADDRESS=<optional; defaults to 0x059e…d94f>
npm run build && npm start             # http://localhost:3000
```

Pre-flight (all read-only):

```bash
npm run check:tatum -- 0x059e21c19f9a8233f4fcbc11fba713c022dcf9d3632961b7ac7836a9ffa8d94f
npm run check:walrus      # with MEMORY_PROVIDER=mock: reports the mock, lists records
npm run check:llm         # optional
```

To start from a clean slate, use a fresh browser profile (new session cookie) or click **Reset synthetic data** on the Memory page. Reset removes only synthetic records. Your own reviews and decisions stay.

## Walkthrough

### 1. Landing page → demo wallet (live Tatum data)

1. Open `/`. Point out the headline and that claims are bounded: watch-only, historical analysis, no blocking, no guaranteed returns.
2. Click **Try it with a read-only demo wallet**. This opens `/dashboard?address=0x059e…` (also reachable via **Use demo wallet** in the address bar).
3. Show the header: **Watch-only** badge and the **Third-party demo wallet** badge. Entering an address never proves ownership.
4. The Overview shows live balances and recent activity from Tatum Sui Testnet.

### 2. Load synthetic goals and strategy

1. On the Overview, click **Load synthetic demo data** (also on the Memory page). It is only available with `MEMORY_PROVIDER=mock`.
2. It creates four labelled records:
   - Emergency reserve: 500 SUI, earmarked in full.
   - Validator stake fund: 5,000 SUI by a date about 150 days out, 400 SUI/month, 1,200 SUI earmarked.
   - Strategy: 60% SUI / 40% stablecoins / 0% other, ±5 band, SUI at $1.50, USDC at $1.00, $1,000 minimum stablecoins, 5 SUI gas reserve.
   - Note: "I keep at least 500 SUI liquid for validator operations."
3. Click again: **Nothing to change**. Seeding is idempotent and never overwrites a strategy you saved yourself.
4. The command center cards now show security status, goal progress, allocation against targets, and the memory record count.

### 3. Protect: a behavioral anomaly, explained

1. Open **Security**. Every sent transaction is scored by deterministic rules against the wallet's own earlier history (`protect-rules/2`).
2. Pick the highest-scored transaction in **Flagged** and open it. Show the signals (for example a new recipient or an unusual amount), the evidence values, and the baseline they were compared with.
3. Stress the wording: these are **deviations, not proof of malice**, and the analysis is historical with a manual refresh.
4. Under **Your assessment**, add a short note and click **Suspicious**. Show the saved line with its date and memory ID: "Saved to development mock memory (not Walrus)".
5. Copy that transaction's recipient address for the next step.

### 4. Transfer check: memory changes the next assessment

1. Open **Transfer check** (`/assess`). Paste the recipient from step 3, choose SUI, and enter a small amount (or **Max**, the conservative estimated available amount).
2. Click **Check this transfer**. Walk through the four panels:
   - **Protect**: pre-execution signals from onchain evidence.
   - **Save**: before → after, with gas shown as a *historical median estimate*. **Max** excludes the 1,700 SUI earmarked for goals and the 5 SUI gas reserve.
   - **Invest**: allocation before and after, at your reference prices.
   - **Memory**: **"You previously marked this recipient as suspicious"**, with your note and date. The verdict becomes **Review carefully before sending**. This is your own earlier assessment, not confirmed fraud.
3. Point out the finding groups: Confirmed facts / Historical patterns / Your preferences and decisions / Unknowns.
4. Optional: click **Explain with AI**. The explanation cites findings by ID and never changes the verdict.

### 5. Record a decision and recall it

1. Under **Your decision**, add a note and click **I would not proceed**.
2. Run **Check this transfer** again. The Memory panel now also shows **"You checked this recipient before"** with that decision. This is the memory loop: input stored → retrieved → output changed.
3. Open **Memory** to show each record's source, timestamp, identifiers, expiry and the Synthetic tag.

### 6. Copilot cites memory

1. Open the Copilot panel and ask: *"Should I send more SUI to that recipient, and does it affect my emergency reserve?"*
2. The answer cites context IDs (`O…` onchain, `C…` computed, `P…` preferences, `M…` memory). The `M…` citations point at your suspicious review and decision. Uncited claims and figures not found in the data are flagged.
3. Without `GEMINI_API_KEY`, or if the free-tier quota is exhausted, a deterministic summary is returned and labelled as such.

### 7. Save and Invest (if time allows)

- **Savings**: progress, the funding pace needed to reach the target date, the earmark ledger, and the "how this is calculated" section. Wallet balances are never counted toward a goal automatically.
- **Strategy**: drift against the 60/40 target, constraint checks (stablecoins below minimum), and an illustrative rebalancing scenario. Click **Accept** or **Reject** to store the decision in memory. Nothing is traded, and it is not a recommendation to buy or sell.

## Reset after the demo

- Memory page → **Reset synthetic data** removes only the four synthetic records.
- To remove everything from a local mock run, delete the file at `MOCK_MEMORY_FILE` (default `.data/mock-memory.json`) while the server is stopped.

## Known limitations

- **The local scripted demo runs on the development mock, not Walrus.** Walrus Mainnet read access is verified (authentication, listing, recall), but writing is not enabled, so no demo record is stored on Walrus. Do not describe demo records as stored on Walrus.
- The mock persists to a local file and simulates the 28-day expiry. It assumes one long-running Node process (see `docs/DEPLOYMENT.md`).
- Testnet assets have no market price. All fiat figures use reference prices the user enters.
- Protect is historical analysis with manual refresh. It does not monitor in real time and cannot block transactions in external wallets.
- Transfer check is a simulation. Gas is a historical estimate, not a dry run.
- The demo wallet belongs to a third party. Its activity can change between rehearsal and demo, so the flagged transactions may differ.
- Free tiers: Tatum rate limits (`TATUM_MAX_RPS`, default 3) and Gemini quotas can slow or degrade the demo. Errors are shown explicitly, never replaced with placeholder data.
