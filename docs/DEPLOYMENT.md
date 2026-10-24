# Deployment

Walguardian is designed for a **local demo or a single long-running Node.js server**. It is a hackathon MVP. This document states what that deployment needs and what it does not guarantee.

## Supported targets

| Target | Status | Notes |
|---|---|---|
| Local (`npm run build && npm start`) | **Supported**, used for the demo | Mock memory persists to a local file |
| One persistent Node server (VM, container with a volume, Railway/Render/Fly with one instance) | **Supported** | Mount a persistent volume for `MOCK_MEMORY_FILE`. Run exactly one instance |
| Serverless or multiple instances (e.g. Vercel) | **Not supported with mock memory** | No writable persistent disk, and in-process caches and rate limits are per instance. The landing page and read-only Tatum views work, but memory does not persist |
| Production with real users | **Not ready** | Needs live Walrus (blocked), shared rate limiting, and a privacy review. See [Blockers](#blockers) |

## Runtime requirements

- **Node.js 20 or later** (developed on Node 24). All API routes run in the Node.js runtime, not Edge.
- **gRPC**: Tatum serves Sui Testnet over gRPC only. `@grpc/grpc-js` and `@grpc/proto-loader` are kept external (`serverExternalPackages`), and the vendored `proto/` directory is loaded from disk at runtime. `outputFileTracingIncludes` ships `proto/**` with every `/api/**` route. If you package the app yourself (Docker, `output: "standalone"`), copy `proto/` alongside the server.
- Outbound HTTPS/gRPC to `sui-testnet-grpc.gateway.tatum.io:443`, and optionally `generativelanguage.googleapis.com` (Gemini).

## Environment

All variables are **server-side only**. None are prefixed `NEXT_PUBLIC_`, and none reach the browser. Never commit real values. `.env*` files are git-ignored, and `.env.example` documents every variable.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TATUM_API_KEY` | **Yes** | — | Tatum Sui **Testnet** key (`x-api-key`) |
| `SUI_NETWORK` | No | `testnet` | `mainnet` is refused unless `ALLOW_MAINNET=true` (needs owner approval) |
| `ALLOW_MAINNET` | No | unset | Keep unset |
| `TATUM_SUI_GRPC_ENDPOINT` | No | `sui-testnet-grpc.gateway.tatum.io:443` | Override endpoint |
| `TATUM_MAX_RPS` | No | `3` | Client-side request spacing to stay under the Tatum plan |
| `MEMORY_PROVIDER` | For memory features | unset (memory disabled) | `mock` (development mock, not Walrus) or `walrus` |
| `SESSION_SECRET` | With any memory provider | — | Signs the anonymous session cookie. 32+ random bytes, hex (`openssl rand -hex 32`) |
| `MEMWAL_NAMESPACE_PREFIX` | No | `guardian-demo` | Namespace prefix: `prefix-principal-category` |
| `MOCK_MEMORY_FILE` | No | `.data/mock-memory.json` | Mock store file. Must be on persistent, writable disk |
| `MOCK_MEMORY_TTL_DAYS` | No | `28` | Simulated expiry |
| `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID` | With `walrus` | — | Delegate key (never the owner key) and account object |
| `MEMWAL_SERVER_URL` | With `walrus` | staging relayer | Currently fails TLS. Any non-Testnet relayer needs `ALLOW_WALRUS_MAINNET=true` and owner approval |
| `ALLOW_WALRUS_MAINNET` | No | unset | Keep unset unless approved |
| `GEMINI_API_KEY` | No | unset | Without it, the copilot and explanations return deterministic summaries |
| `LLM_MODEL` | No | `gemini-3.5-flash-lite` | Free-tier model |
| `LLM_MAX_OUTPUT_TOKENS` | No | `1200` | |
| `COPILOT_RATE_PER_MINUTE` / `_PER_DAY` | No | `6` / `100` | Per-client copilot budget |
| `API_RATE_PER_MINUTE` / `_PER_DAY` | No | `30` / `2000` | Per-client budget for Tatum-backed routes |
| `DEMO_WALLET_ADDRESS` | No | `0x059e…d94f` | Read-only third-party demo wallet. Validated as a Sui address |
| `SITE_URL` | No | Vercel URL, or `http://localhost:3000` | Origin for Open Graph, canonical and sitemap URLs |

**Build-time values.** The landing page is static. `DEMO_WALLET_ADDRESS` and `SITE_URL` are read when it is prerendered, so set them **before `npm run build`**. Changing them later requires a rebuild. The app pages read them at request time.

## Security posture

- **Headers** (`next.config.ts`): Content-Security-Policy (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` in production), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, and HSTS in production. `X-Powered-By` is disabled. `script-src` allows `'unsafe-inline'`, which Next.js inline bootstrapping needs. Nonce-based CSP is a possible hardening step.
- **Request bodies**: JSON only (`Content-Type: application/json`), size-capped, Zod-validated.
- **Rate limits**: per client (hash of the session cookie, otherwise the first `X-Forwarded-For` address) on every route that calls Tatum or Gemini. Limits are **in-process**: they reset on restart and are not shared between instances. Deploy behind a proxy that sets `X-Forwarded-For` correctly. A client that reaches the server directly can spoof it.
- **Sessions**: a signed, `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) carries a random principal ID. Memory namespaces are derived server-side from it, never from the request or a wallet address. A wallet address is watch-only and is not identity.
- **Secrets** are never logged or returned. Provider errors are mapped to typed codes without echoing credentials.
- **Transactions**: none. The app never signs, sends or executes anything. Transfer check is a simulation.

## Memory storage caveats

- **`mock` is a development mock, not Walrus and not production storage.** It is a JSON file written by one process. There is no locking across processes, no backup, no encryption at rest, and data is lost if the disk is ephemeral. Every UI surface labels it as such.
- Records are scoped to a browser session cookie. Clearing cookies loses access to that session's records, but they remain in the file until expiry or deletion.
- **`walrus`** is implemented against `@mysten-incubation/memwal@0.1.9` but has not been verified live (see Blockers). Walrus data should be treated as **not private by default**. Store only synthetic, non-sensitive data. The relayer sees plaintext, the SDK has no delete call, and uploads expire after roughly four weeks unless renewed (see `docs/WALRUS_INTEGRATION.md`).

## Single-instance assumptions

Each of these lives in process memory and is correct only with **one** server instance:

- Tatum request spacing (`TATUM_MAX_RPS`)
- API and copilot rate limiters
- The address-history and coin-metadata caches
- Mock memory writes: each operation reads and atomically rewrites the whole file, with no locking across processes, so two instances sharing one file can lose writes

Scaling out would need a shared store (e.g. Redis) for limits and caches, and live Walrus for memory.

## Pre-deployment checklist

1. Set `TATUM_API_KEY` (Testnet), `SESSION_SECRET` and `MEMORY_PROVIDER`. Leave `ALLOW_MAINNET` and `ALLOW_WALRUS_MAINNET` unset.
2. Set `SITE_URL` and, if needed, `DEMO_WALLET_ADDRESS` **before building**.
3. With `mock`, point `MOCK_MEMORY_FILE` at a persistent volume and run one instance.
4. Run `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
5. Run read-only smoke tests: `npm run check:tatum -- <address>`, `npm run check:walrus`, `npm run check:llm`.
6. Start with `npm start` (or `next start -p $PORT`) behind an HTTPS proxy that sets `X-Forwarded-For`.
7. Verify that `curl -I https://<host>/` shows the CSP and HSTS headers, and that `/dashboard?address=<demo>` loads live data.

## Blockers

| Blocker | Impact | Status |
|---|---|---|
| Walrus Testnet relayer and dashboard serve a `*.up.railway.app` certificate | Live Walrus Memory cannot be verified on Testnet. The demo runs on the mock | Re-checked 2026-10-25. Issue drafted at `docs/issues/walrus-staging-tls.md` (not filed) |
| Walrus network decision | An earlier owner decision allowed the Mainnet relayer with synthetic data. The current instruction is mock-only, with no Walrus writes or network switch without approval | Awaiting owner confirmation |
| Gemini free tier | Per-minute and per-day quotas. Free-tier content may be used by Google. Send synthetic data only | The copilot falls back to deterministic summaries and labels them |
| Tatum free tier | Rate limits and monthly credits. Large histories are paginated and capped | Errors are surfaced explicitly. Spacing is configurable |
