# Deployment

Walguardian is a hackathon MVP. It runs on **Vercel** (the public demo) or locally. This document states what each deployment needs, how shared state works, and what is not guaranteed.

## Supported targets

| Target | Status | Memory |
|---|---|---|
| **Vercel + Upstash Redis** | **Supported** (public demo) | Disabled, or Walrus Memory (read-only by default; see [Memory on Vercel](#memory-on-vercel)) |
| Local (`npm run build && npm start`) | Supported (development and demo rehearsal) | Development mock (local file), or Walrus |
| Other single Node server | Works; not the documented path | As local |
| Production with real users | **Not ready** | Walrus records expire, the hosted relayer has no SLA, and there is no privacy review |

The file-based **mock is disabled automatically on Vercel** (`VERCEL` is set): functions have no persistent, shared disk, so it would silently lose records.

## Runtime requirements

- **Node.js 20 or later** (developed on Node 24). All API routes run in the Node.js runtime, not Edge.
- **gRPC**: Tatum serves Sui Testnet over gRPC only. `@grpc/grpc-js` and `@grpc/proto-loader` are external packages, and `outputFileTracingIncludes` ships the vendored `proto/**` with every `/api/**` route.
- Outbound HTTPS/gRPC to `sui-testnet-grpc.gateway.tatum.io:443`, the Upstash REST endpoint, and optionally `generativelanguage.googleapis.com` and the Walrus Memory relayer.

## Environment

All variables are **server-side only** (none use `NEXT_PUBLIC_`). Mark secrets as **Sensitive** in Vercel. Variables apply to new builds only, so redeploy after changing them. Never commit real values. `.env.example` documents every variable.

| Variable | Production | Preview | Default | Notes |
|---|---|---|---|---|
| `TATUM_API_KEY` | **Required** | **Required** | — | Tatum Sui **Testnet** key. Sensitive |
| `SUI_NETWORK` | `testnet` | `testnet` | `testnet` | `mainnet` is refused unless `ALLOW_MAINNET=true` |
| `SESSION_SECRET` | **Required** | **Required** | — | `openssl rand -hex 32`. Different per environment. Rotating it ends every session and access to that session's records. Sensitive |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **Required** | **Required** | — | Upstash Redis REST. Both or neither. Sensitive (token) |
| `GEMINI_API_KEY` | Optional | Optional | — | Free tier. Without it, the copilot answers deterministically. Sensitive |
| `DEMO_WALLET_ADDRESS` | Optional | Optional | `0x059e…d94f` | Read-only third-party demo wallet. Read at build time |
| `SITE_URL` | Custom domain only | Unset | Vercel URL | Read at build time |
| `API_RATE_PER_MINUTE` / `_PER_DAY` | Optional | Optional | `30` / `2000` | Per session; 5× per IP |
| `COPILOT_RATE_PER_MINUTE` / `_PER_DAY` | Optional | Optional | `6` / `100` | Per session; 5× per IP |
| `TATUM_MAX_RPS` | Optional | Optional | `3` | Global budget across all instances (with Redis) |
| `MEMORY_PROVIDER` | **Unset** | Unset until approved | unset | `walrus` only after the Walrus safety checks and owner approval |
| `MEMWAL_*`, `ALLOW_WALRUS_MAINNET` | Unset | Unset until approved | — | See [Memory on Vercel](#memory-on-vercel) |
| `MEMORY_WRITES_ENABLED` | Unset | Unset until approved | `false` for Walrus | Mainnet writes need explicit owner approval |
| `MEMORY_WRITES_PER_SESSION_DAY` / `MEMORY_WRITES_GLOBAL_DAY` | Optional | Optional | `20` / `300` | Write quotas |
| `ALLOW_MAINNET` | **Never** | **Never** | unset | Governs Sui data (Tatum), not Walrus |
| `MOCK_MEMORY_FILE`, `MOCK_MEMORY_TTL_DAYS` | — | — | — | Local only |

## Shared state (Upstash Redis)

Redis holds only counters and short-lived caches. **It never stores memory content**; Walrus Memory remains the only memory store. One free database serves both environments, separated by key prefix:

| Environment | Prefix |
|---|---|
| Vercel Production | `wg:production:` |
| Vercel Preview | `wg:preview:` |
| `vercel dev` | `wg:development:` |
| Local | `wg:local:` |
| Integration tests | `wg:test:<random>:` (deleted after the run) |

| Use | Keys | TTL |
|---|---|---|
| API and copilot rate limits (fixed windows, per verified session and per IP) | `rl:<bucket>:<id>:m:<minute>`, `…:d:<day>` | 2 min / 25 h |
| Global Tatum budget (requests per second, all instances) | `tatum:rps:<second>` | 5 s |
| Memory write quotas (per session and global, per day) | `rl:memwrite:…` | 25 h |
| Address history cache (gzip, ~26 KB for 200 transactions) | `hist:v1:<address>:<max>` | 30 s |
| Coin metadata cache | `meta:v1:<coinType>` | 1 day |

Client identity for limits: the session counts only if its cookie signature verifies (forged cookies cannot mint budgets), and the IP comes from Vercel's `X-Forwarded-For`. Budgets per IP are 5× wider because several people can share one address.

### Redis outage behaviour

Every Redis call has a 1.5 s timeout and one retry.

| Operation | If Redis fails |
|---|---|
| Tatum-backed reads | **Degrade**: each instance applies a third of the normal budget; the per-instance Tatum spacer still applies |
| Global Tatum budget | Skipped; the per-instance spacer remains the limit |
| Copilot (Gemini) | **Denied**: answers fall back to the labelled deterministic summary; no paid call without an enforced budget |
| Memory writes (Walrus) | **Fail closed** (503, "Nothing was saved"). Walrus writes also require Redis to be configured at all |
| Caches | Bypassed; data is fetched from Tatum |

`/api/status` reports Redis as connected, not configured, or unreachable.

### Free-tier budget

Upstash Free: 500K commands/month, 256 MB, 10 GB bandwidth, 1 database. A typical page view costs tens of commands (one per Tatum call for the global budget, a few for limits, one or two for caches), so the free tier covers several thousand demo page views per month. Watch the Upstash dashboard during public events.

## Memory on Vercel

**Current state: memory is disabled on Vercel** (`MEMORY_PROVIDER` unset). Pages show that memory is not configured; nothing pretends to persist.

Walrus Memory (Mainnet hosted relayer, synthetic data only) is prepared but gated:

1. **Read-only (Preview first):** `MEMORY_PROVIDER=walrus`, `MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz`, `ALLOW_WALRUS_MAINNET=true`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_NAMESPACE_PREFIX=walguardian-preview`. With `MEMORY_WRITES_ENABLED` unset, every write is refused before it reaches the relayer. Requires owner approval (C).
2. **Writes:** `MEMORY_WRITES_ENABLED=true`, only after the owner approves Mainnet writes (D). Production needs a separate approval.

Controls enforced in `MemoryService.write` (`src/modules/memory/memory.policy.ts`), so no route can bypass them:

- **Write switch**: Walrus is read-only unless enabled.
- **Structured-only policy**: only security review verdicts, transfer decisions (would / would not proceed) and rebalancing decisions (accept / reject), validated with strict schemas over server-derived context. Notes, reasons, goals, strategy settings, copilot notes and synthetic seeding are refused, including free text hidden in otherwise allowed fields. The UI hides inputs that would be refused.
- **Quotas**: per session per day, global per day, and a per-minute burst ceiling.

### Storage lifetime (not permanent)

Verified from the Walrus Memory docs and the relayer source (MystenLabs/MemWal `df2c300`, 2026-10-24); the hosted deployment's actual settings are confirmed only per record:

- A record lives for the storage epochs paid at upload. A Mainnet epoch is about 2 weeks. The relayer source defaults to **3 epochs (~6 weeks)** on Mainnet, configurable by the operator up to 15. Each record's `expires_at` is shown on the Memory page.
- The relayer source has **no automatic renewal** for SDK writes. Console uploads renew automatically; SDK writes are not console uploads.
- After upload, the blob object is transferred to the **account owner's address**. Only the owner can extend it, with an owner-signed transaction that pays WAL and SUI. We do not plan to renew.
- **Expired records cannot be recovered.** The demo must be re-seeded (with approval) before judging if records lapse.
- The relayer operator sees plaintext; deletion is permanent and needs an owner signature.

## Security posture

- **Headers** (`next.config.ts`): CSP (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` in production), `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP, HSTS in production; `X-Powered-By` disabled. `script-src` allows `'unsafe-inline'` for Next.js bootstrapping.
- **Request bodies**: JSON only, size-capped, Zod-validated.
- **Sessions**: signed, `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) with a random principal. Memory namespaces are derived server-side. A wallet address is watch-only and is not identity. All visitors share one Walrus account and delegate key; the server is the isolation boundary.
- **Secrets** are never logged or returned.
- **Transactions**: none. Transfer check is a simulation.

## Pre-deployment checklist (Vercel)

1. Set the Production and Preview variables above. Leave `MEMORY_PROVIDER`, `MEMWAL_*`, `ALLOW_WALRUS_MAINNET`, `MEMORY_WRITES_ENABLED` and `ALLOW_MAINNET` unset.
2. Locally: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
3. With the KV variables in `.env.local`: `npm run test:integration` (live Redis, isolated test prefix, cleaned up).
4. Deploy a **Preview** first. Check `/api/status`: Tatum connected, Redis connected, memory not configured.
5. Open `/dashboard?address=<demo wallet>` and confirm live Testnet data; refresh twice and confirm the second load is served from the shared cache (faster, same `fetchedAt`).
6. `curl -I https://<host>/` shows CSP and HSTS.
7. Promote to Production only with the owner's approval.

## Blockers and open items

| Item | Impact | Status |
|---|---|---|
| Production env vars unset | The deployed app cannot load wallet data | Owner configures (approved A) |
| Walrus Mainnet account | Needed for read-only verification | Owner creates via the dashboard (approved B) |
| Walrus on Preview | Read-only check, then writes | C approved in principle after verification; D (writes) not yet approved |
| Walrus Testnet relayer TLS | Testnet unusable | Handled by the owner separately; draft kept in `docs/issues/` |
| Walrus record expiry | Demo records lapse after the paid period (~6 weeks by default) | Documented; re-seed before judging if needed |
| Relayer usage limits | Undisclosed; no SLA | Our quotas keep usage low |
| Gemini and Tatum free tiers | Quotas and rate limits | Shared budgets; deterministic fallback |
