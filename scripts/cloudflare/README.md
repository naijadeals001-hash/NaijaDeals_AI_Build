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
record is `staging-remote`, which points at the tunnel. `staging.naijadeals.com`
remains a pre-existing A record to the VPS and is **not** this protected staging
host; do not treat it as the tester entry point.

| Public hostname | Local service | Notes |
| --- | --- | --- |
| `staging-remote.naijadeals.com` | `http://127.0.0.1:3200` | the only public entry point |
| anything else on this tunnel | `http_status:404` | catch-all |

Never add to ingress: n8n `5680`, PostgreSQL `55432`, or development previews
`3047` / `3107` / `3109`. The staging app, n8n and PostgreSQL listeners were
verified on `127.0.0.1`. The previews are **not** loopback-only: on 2026-11-16,
`3047` and `3107` listened on `::` (all IPv6 interfaces), and `3109` was not
listening. They are not internet-reachable through this tunnel, but other
devices on the local network may reach them. This is a pre-existing preview
binding; do not add it to ingress and do not change it without the preview
owner's decision.

## Current verified state

- Zone `naijadeals.com`: **active**.
- DNS: 17 user records; `staging-remote` is the only `proxied=true` record and
  is a CNAME to `*.cfargotunnel.com`.
- Public A, `www` CNAME, MX, SPF, DMARC and all three Hostinger DKIM CNAMEs
  resolve correctly after the nameserver change.
- Apex HTTP returns `200`; apex HTTPS currently fails certificate principal
  validation because the pre-existing VPS certificate does not match the domain.
  This origin/certificate issue predates the DNS cutover and is not fixed here;
  `staging.naijadeals.com` returned `200`.
- Access: one Allow policy, exactly three email rules, no non-Allow policies;
  the only configured identity provider is `onetimepin`. The allowlist is
  pinned by `approved-testers.sha256` without tracking the addresses.
- Tunnel: `healthy`, four connections. The live API configuration contains
  exactly `staging-remote -> http://127.0.0.1:3200` plus
  `(catch-all) -> http_status:404`; `status-tunnel.ps1` asserts this and fails
  on any extra ingress.
- `start-tunnel.ps1` repeats the zone, app, OTP, exact-policy and ingress
  assertions before starting; it is not only a count check.
- Unauthenticated request: `302` to the Cloudflare Access login.
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
| `config.yml` | Reference ingress contract for the remotely managed tunnel; it is not the applied config | yes (placeholders only) |
| `approved-testers.sha256` | Pins the exact three-address allowlist without tracking the addresses | yes |
| `configure-staging-access.mjs` | Ensures the One-time PIN provider, Access app, exact allowlist and exactly one Allow policy | yes |
| `start-tunnel.ps1` | Refuses unless the live zone, app, OTP binding, exact policy and ingress all match; starts `cloudflared` with the token in the child environment only | yes |
| `stop-tunnel.ps1` / `status-tunnel.ps1` | PID-scoped stop and read-only status; status asserts the same live contract | yes |
| `preflight.ps1` | Read-only checks: binary, config shape, ingress surface, origin and private ports | yes |
| `audit-local-runtime.py` | Read-only n8n binding and secret-leak audit (counts only) | yes |
| `.gitignore` | Blocks `*.json`, `*.pem`, `*.key`, `config.local.yml`, logs | yes |
| `config.local.yml` | Optional local override (real UUID) | **never** |
| `C:\Users\User\.cloudflared\<UUID>.json` | Tunnel credential material | **never**, outside the repo by design |

The scripts load credentials from protected local files, never from Git. Do not
print, copy or commit the tunnel token, API token, credential JSON or Access
cookies. The approved email list is deliberately untracked; its protected
location is `C:\NaijaDeals-Staging\secrets\cloudflare-access-allowlist.json`
and its canonical sorted-address SHA-256 is pinned in
`approved-testers.sha256`. Changing either file requires a reviewed change to
the other.

The API token is used for zone read, Access application/identity-provider
read/write and tunnel read; its dashboard scope is not represented in Git.
Review and rotate it in Cloudflare rather than assuming it is least-privilege.
The tunnel token is separate and is passed only through the child process
environment.

Read-only checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\preflight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\status-tunnel.ps1
```

Start and stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\start-tunnel.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\start-tunnel.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\stop-tunnel.ps1
```

`-CheckOnly` runs the same zone/Access/policy/ingress/origin gate without
starting a process.

`start-tunnel.ps1` refuses to run unless the zone is active, the Access app is
present and bound to One-time PIN, the policy is exactly the pinned allowlist,
and the live ingress is exactly the staging hostname plus the 404 catch-all. It
starts `cloudflared` with `--no-autoupdate` and records the child PID in
`C:\NaijaDeals-Staging\run\cloudflared.pid`. `stop-tunnel.ps1` stops only that
PID; if the PID file is absent it stops nothing rather than killing another
tunnel. The tunnel token is passed through the child environment and is never
written to the repository.

## Safety rules

- If the Access application or its policy is deleted while the tunnel is
  running, the hostname can reach the origin without Access. This is not
  monitored continuously: stop the tunnel first, run `status-tunnel.ps1` to
  detect the mismatch, restore the app/policy, and only then restart. The
  rollback procedure stops the tunnel before deleting Access.
- Do not create an `Allow Everyone`, domain-wide, bypass or service-token rule.
- Do not add `staging.naijadeals.com`, n8n, PostgreSQL or preview ports to this
  tunnel.
- Do not publish `staging-remote` from a machine that has not verified the
  Access policy.
- Do not commit `cert.pem`, `<UUID>.json`, tokens or copied credential material.
- Do not change the n8n encryption key or owner password as part of tunnel or
  Access work.
