# Protected external staging access — ACTIVE

Status: **ACTIVE and verified on 2026-11-16.** The protected staging URL is
<https://staging-remote.naijadeals.com>. It is a Cloudflare-proxied hostname
backed by the named tunnel `naijadeals-staging-remote` to the loopback staging
app on `http://127.0.0.1:3200`.

Cloudflare Access is the outer gate. The application has one **Allow** policy
containing exactly the three approved tester addresses, with **One-time PIN**
(email) as the login method. There is no domain-wide rule, no `Everyone` rule,
no bypass and no service-token policy. After Access, the NaijaDeals application
still performs its own login, session and role checks.

## DNS and private services

`naijadeals.com` is delegated to Cloudflare nameservers
`armando.ns.cloudflare.com` and `nucum.ns.cloudflare.com` (zone active). All
existing website and email records are preserved **DNS-only**; the only proxied
record is `staging-remote`, which points at the tunnel.

| Public hostname | Local service | Notes |
| --- | --- | --- |
| `staging-remote.naijadeals.com` | `http://127.0.0.1:3200` | the only public entry point |
| anything else on this tunnel | `http_status:404` | catch-all |

Never add to ingress: n8n `5680`, PostgreSQL `55432`, or development previews
`3047` / `3107` / `3109`. They remain loopback-only and unpublished. Current
listeners on `3200`, `5680` and `55432` were verified on `127.0.0.1`.

## Current verified state

- Zone `naijadeals.com`: **active**.
- DNS: 17 user records; `staging-remote` is the only `proxied=true` record and
  is a CNAME to `*.cfargotunnel.com`.
- Public A, `www` CNAME, MX, SPF, DMARC and all three Hostinger DKIM CNAMEs
  resolve correctly after the nameserver change.
- Access: one Allow policy, exactly three email rules, no non-Allow policies;
  the only configured identity provider is `onetimepin`.
- Tunnel: `healthy`, four connections.
- Unauthenticated request: redirected to the Cloudflare Access login.
- Approved tester observed: Access email sign-in, NaijaDeals app login,
  `/admin/support` HTTP 200, and `/api/admin/payouts` HTTP 403.
- n8n `5680` and PostgreSQL `55432`: loopback-only; not in tunnel ingress.

Rollback is to restore the Hostinger nameservers
`athena.dns-parking.com` / `apollo.dns-parking.com` at the registrar and stop
the tunnel. The authoritative Hostinger zone export remains at
`C:\NaijaDeals-Staging\backups\hostinger-naijadeals-zone-2026-11-16.txt`.
See `docs/automation/dns-migration-plan.md` for the preflight reconciliation,
inventory and full rollback procedure.

## Files and operations

| File | Purpose | Committed? |
| --- | --- | --- |
| `config.yml` | Named-tunnel ingress with placeholders | yes (placeholders only) |
| `configure-staging-access.mjs` | Ensures the One-time PIN provider, Access app, exact allowlist and one Allow policy | yes |
| `start-tunnel.ps1` | Refuses unless the zone is active and the Access app exists; starts `cloudflared` with the token in the child environment only | yes |
| `stop-tunnel.ps1` / `status-tunnel.ps1` | Stop and read-only status | yes |
| `preflight.ps1` | Read-only checks: binary, config shape, ingress surface, origin and private ports | yes |
| `audit-local-runtime.py` | Read-only n8n binding and secret-leak audit (counts only) | yes |
| `.gitignore` | Blocks `*.json`, `*.pem`, `*.key`, `config.local.yml`, logs | yes |
| `config.local.yml` | Optional local override (real UUID) | **never** |
| `C:\Users\User\.cloudflared\<UUID>.json` | Tunnel credential material | **never**, outside the repo by design |

The scripts load credentials from protected local files, never from Git. Do not
print, copy or commit the tunnel token, API token, credential JSON or Access
cookies.

Read-only checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\preflight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\status-tunnel.ps1
```

Start and stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\start-tunnel.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\stop-tunnel.ps1
```

`start-tunnel.ps1` refuses to run if the zone is not active or the Access app is
missing, so a hostname cannot be published without its gate. The tunnel token is
passed to the child process through its environment and is never written to the
repository.

## Safety rules

- Do not create an `Allow Everyone`, domain-wide, bypass or service-token rule.
- Do not add `staging.naijadeals.com`, n8n, PostgreSQL or preview ports to this
  tunnel.
- Do not publish `staging-remote` from a machine that has not verified the
  Access policy.
- Do not commit `cert.pem`, `<UUID>.json`, tokens or copied credential material.
- Do not change the n8n encryption key or owner password as part of tunnel or
  Access work.
