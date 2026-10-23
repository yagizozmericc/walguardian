# Guardian AI

Memory-powered onchain finance and security copilot for Sui, built for the Tatum hackathon.

- **Tatum** (Sui Testnet, gRPC) provides blockchain data.
- **Walrus Memory** stores user preferences, goals, decisions and feedback (Phase 6).
- An LLM explains findings that deterministic engines compute (Phase 7).

Development is **Testnet-first**. Mainnet is refused unless `ALLOW_MAINNET=true` is set, and that needs explicit approval.

See `docs/IMPLEMENTATION_PLAN.md` for phase status, verified integration findings, risks, and open questions.

## Setup

```bash
npm install
cp .env.example .env.local   # then set TATUM_API_KEY to your Tatum Sui *Testnet* key
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and start |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests. These use labelled fixtures and make no network calls |
| `npm run check:tatum -- 0xADDRESS` | Live smoke test against Tatum Sui Testnet: prints chain, balances and recent activity |
| `npm run check:protect -- 0xADDRESS` | Live Protect run: security status, behavioral baseline, and the top-scored transactions with their signals |
| `npm run demo:protect` | Runs the scoring engine on **labelled fixture** scenarios (synthetic data) to demonstrate each rule |

## Integration notes

- Tatum serves Sui Testnet over **gRPC only** (`sui-testnet-grpc.gateway.tatum.io:443`, `x-api-key` header). The protocol definitions are vendored under `proto/` from `MystenLabs/sui-apis`.
- Address history comes from `LedgerService/ListTransactions` with an `affected_address` filter. When a provider fails, the UI shows the error. It never substitutes placeholder data.
- Testnet assets have no market price, so balances are shown in token units and fiat valuation is marked unavailable.
- Address analysis is **watch-only**. It does not prove wallet ownership.
- **Protect** scores each sent transaction against the wallet's own earlier history using deterministic rules (`src/modules/security/rules.config.ts`). Anomalies are deviations, not proof of malicious activity. Analysis is historical with manual refresh. Guardian does not monitor in real time and cannot block transactions.
