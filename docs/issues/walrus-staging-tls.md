<!--
DRAFT — not published. Intended for https://github.com/MystenLabs/MemWal/issues.
Review before filing. Contains no credentials, account IDs or user data.
-->

# Testnet (staging) relayer and dashboard serve a `*.up.railway.app` certificate

## Summary

The Testnet endpoints listed in the Walrus Memory docs fail TLS hostname verification. Both `relayer-staging.memory.walrus.xyz` and `staging.memory.walrus.xyz` present a Let's Encrypt certificate issued for `*.up.railway.app` only, so the TypeScript SDK (and any standard HTTPS client) cannot connect. The Mainnet hosts (`relayer.memory.walrus.xyz`, `memory.walrus.xyz`) are unaffected.

Observed consistently from 2026-10-23 to 2026-10-25.

## Affected hosts

| Host | CNAME | Result |
|---|---|---|
| `relayer-staging.memory.walrus.xyz` | `55ylusua.up.railway.app` | TLS hostname mismatch |
| `staging.memory.walrus.xyz` | `rymumt0h.up.railway.app` | TLS hostname mismatch |
| `relayer.memory.walrus.xyz` | `ankc518e.up.railway.app` | OK (`GET /health` → 200) |
| `memory.walrus.xyz` | `ev0cymg3.up.railway.app` | OK (200) |

Certificate presented by both staging hosts:

```
Subject: CN=*.up.railway.app
SAN:     DNS:*.up.railway.app, DNS:up.railway.app
Issuer:  C=US, O=Let's Encrypt, CN=YE2
Valid:   2026-09-27 03:01:43 GMT → 2026-12-26 03:01:42 GMT
```

## Steps to reproduce

```sh
curl -sS -o /dev/null https://relayer-staging.memory.walrus.xyz/health
# curl: (60) SSL: no alternative certificate subject name matches target host name
#   'relayer-staging.memory.walrus.xyz'

echo | openssl s_client -connect relayer-staging.memory.walrus.xyz:443 \
  -servername relayer-staging.memory.walrus.xyz 2>/dev/null \
  | openssl x509 -noout -subject -text | grep -E 'Subject:|DNS:'
#   Subject: CN=*.up.railway.app
#   DNS:*.up.railway.app, DNS:up.railway.app
```

The same occurs for `staging.memory.walrus.xyz`. With the SDK (`@mysten-incubation/memwal@0.1.9`), `MemWal.create({ serverUrl: "https://relayer-staging.memory.walrus.xyz", ... })` followed by `health()` fails with the underlying fetch TLS error.

Environment: macOS 26 (Darwin 25.4), curl 8.7.1 (SecureTransport), LibreSSL 3.3.6, Node.js `fetch`.

## Expected

The staging hosts serve a certificate covering their own hostnames (e.g. a Railway custom-domain certificate for `*.memory.walrus.xyz` or each host individually), as the Mainnet hosts do.

## Likely cause

The custom domains appear to be attached at the DNS level (CNAME to Railway) but not registered, or not verified, as custom domains on the Railway services, so Railway falls back to its default wildcard certificate.

## Impact

- Testnet onboarding is blocked: the staging dashboard cannot be opened to create an account and delegate key, and the SDK cannot reach the staging relayer.
- The docs still list the staging URLs as the Testnet endpoints, and no alternative Testnet endpoint is documented, so developers who must stay on Testnet have no working option.

## Questions

1. Is the Testnet relayer still supported, and is a fix planned?
2. If staging is deprecated, could the docs say so and name the recommended network for development?
