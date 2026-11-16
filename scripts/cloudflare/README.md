# Protected external tester access — prepared, NOT active

Status: **PREPARED; NAMESERVER MIGRATION APPROVAL REQUIRED.** Hostinger remains
authoritative. The Cloudflare zone `naijadeals.com` is created and **pending**;
a named tunnel is created **inactive** with ingress only to
`127.0.0.1:3200`; the Access organization is enabled. Cloudflare refuses the
Access application while the zone is pending (`domain does not belong to zone`),
so no hostname is exposed. The staging origin stays private on
`127.0.0.1:3200`.

The complete record inventory, migration steps and rollback are in
`docs/automation/dns-migration-plan.md`. Do not change registrar nameservers
without owner approval.

Current state re-verified on 2026-11-16:

- `staging-remote.naijadeals.com` now exists as an **A record to
  `187.127.252.23`** on Hostinger nameservers. It does **not** point at a
  Cloudflare tunnel. Replacing it would change the existing name and conflict
  with the owner instruction to preserve it.
- The Cloudflare token is account-scoped (`/zones` returns 0) and lives in the
  project `.env`; it can read tunnels but cannot create a DNS route or an
  Access application.
- The approved local configuration contains **no tester email addresses**, so no
  allow policy or staging account can be created without guessing.
- No tunnel process, tunnel credential or Access application exists.

Two independent blockers remain:

| # | Blocker | Exact sanitized evidence |
| --- | --- | --- |
| B1 | Cloudflare Zero Trust Access is not enabled on the account | `GET /accounts/<id>/access/apps` → HTTP 403, `9999 access.api.error.not_enabled: Access is not enabled. Visit the Access dashboard at https://dash.cloudflare.com/ and click the 'Enable Access' button.` (same for `/access/policies`, `/access/identity_providers`, `/access/organizations`) |
| B2 | `naijadeals.com` is **not** delegated to Cloudflare, and the requested hostname is an A record to the existing VPS | Public DNS: `NS naijadeals.com` → `athena.dns-parking.com`, `apollo.dns-parking.com`; `staging-remote` → `A 187.127.252.23`. Cloudflare Access/self-hosted apps and tunnel DNS routes require an **active zone in the account**. Replacing the A record needs an explicit owner decision because it is an existing name |

Additional capability limits of the account-scoped bearer token in the project
`.env` (account `6c92d6684237e9c82f3531f9599f3d7e`; value never printed):

| Call | Result |
| --- | --- |
| `GET /zones` | HTTP 200, `count: 0` — the token has no zone scope, so it cannot read or create DNS records |
| `GET /accounts/<id>/cfd_tunnel` | HTTP 200, `result: []` — tunnel read works, 0 tunnels exist |
| `GET /accounts/<id>/access/*` | HTTP 403 `9999 access.api.error.not_enabled` |
| `GET /user/tokens/verify` | HTTP 401 `1000 Invalid API Token` — expected: this is an OAuth bearer token, not a user API token |

`staging-remote.naijadeals.com` and `staging.naijadeals.com` both resolve to
`187.127.252.23`; they were only observed, never touched. No DNS record was
created, changed or deleted.

## Hostname and port contract

| Public hostname | Local service | Notes |
| --- | --- | --- |
| `staging-remote.naijadeals.com` | `http://127.0.0.1:3200` | the only public entry point |
| anything else on this tunnel | `http_status:404` | catch-all |

Never add to ingress: n8n `5680`, PostgreSQL `55432`, development previews
`3047` / `3107` / `3109`. They stay loopback-only and unpublished.

### Observed local exposure (read-only audit, 2026-11-15)

| Port | Observed bind | Note |
| --- | --- | --- |
| `3200` (staging app) | `127.0.0.1` | correct: loopback only |
| `5680` (n8n) | `127.0.0.1` | correct: `N8N_LISTEN_ADDRESS=127.0.0.1` |
| `55432` (PostgreSQL) | `127.0.0.1` | correct |
| `3047` (preview) | `0.0.0.0` + `[::]` | **pre-existing**: reachable from the LAN, not loopback-only |
| `3107` (preview) | `0.0.0.0` + `[::]` | **pre-existing**: reachable from the LAN, not loopback-only |

The two preview bindings were not changed by this work. They are not part of
the tunnel, so they are not internet-reachable through Cloudflare, but they are
reachable by other devices on the local network until someone rebinds them.

## Files

| File | Purpose | Committed? |
| --- | --- | --- |
| `config.yml` | Named-tunnel ingress, placeholders for tunnel UUID and credentials path | yes (placeholders only) |
| `configure-staging-access.mjs` | Applies the exact tester allowlist once the zone is active | yes |
| `start-tunnel.ps1` | Refuses unless the zone is active and the Access app exists; starts cloudflared with the token in the child environment | yes |
| `stop-tunnel.ps1` / `status-tunnel.ps1` | Stop and read-only status | yes |
| `preflight.ps1` | Read-only checks: binary, config shape, ingress surface, hostname unused, origin 200, private ports loopback | yes |
| `audit-local-runtime.py` | Read-only n8n binding and secret-leak audit (counts only) | yes |
| `.gitignore` | Blocks `*.json`, `*.pem`, `*.key`, `config.local.yml`, logs | yes |
| `config.local.yml` | Optional local override (real UUID) | **never** |
| `C:\Users\User\.cloudflared\<UUID>.json` | Tunnel credential material | **never**, outside the repo by design |

Run the read-only checks first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\preflight.ps1
```

## Installed client

| Item | Value |
| --- | --- |
| Path | `C:\cloudflared\cloudflared.exe` |
| Version | `cloudflared version 2026.11.0 (built 2026-11-12T03:21 UTC)` |
| Source | Official GitHub release asset `cloudflared-windows-amd64.exe` for tag `2026.11.0` |
| Integrity | SHA-256 `d5c1d82031da6253dcdcff64c944cd0fe063016edeb2e4fd088075fc9bd52d0a` — matches the digest published by the GitHub Releases API |
| On `PATH`? | No. Call it by absolute path, or add `C:\cloudflared` to the user `PATH` (owner choice) |

`winget install Cloudflare.cloudflared` was attempted first and stalled with no
package registered; it was stopped and the signed release binary was used
instead. No quick tunnel was run and no DNS was published.

## Exact commands — create, run, stop, revoke

Every command below needs the B1/B2 blockers cleared first. `cloudflared tunnel
login` opens a browser and requires an active zone in the account; it will fail
while B2 stands.

### 1. Authenticate the CLI once

```powershell
C:\cloudflared\cloudflared.exe tunnel login
# writes C:\Users\User\.cloudflared\cert.pem (account-wide; keep it private)
```

### 2. Create the named tunnel (no DNS yet)

```powershell
C:\cloudflared\cloudflared.exe tunnel create naijadeals-staging-remote
C:\cloudflared\cloudflared.exe tunnel list
# writes C:\Users\User\.cloudflared\<UUID>.json — the secret credential file
```

Put the UUID into `config.yml` (both `tunnel:` and `credentials-file:`).

### 3. Create the Access application and default-deny policy FIRST

Do this **before** any DNS record. See the dashboard section below. With no
approved tester emails, the app must carry one Block policy covering Everyone
and nothing else, so zero identities are granted.

### 4. Publish the DNS record only after step 3

```powershell
C:\cloudflared\cloudflared.exe tunnel route dns naijadeals-staging-remote staging-remote.naijadeals.com
# creates CNAME staging-remote -> <UUID>.cfargotunnel.com, proxied
```

### 5. Run in the foreground (verification)

```powershell
C:\cloudflared\cloudflared.exe --config .\scripts\cloudflare\config.yml tunnel run
# expect: "Registered tunnel connection"; then
#   curl.exe -I https://staging-remote.naijadeals.com   -> 302 to Access login when signed out
```

### 6. Run as a Windows service (persistent)

```powershell
# Elevated shell. Installs with the config above; runs as LocalSystem.
C:\cloudflared\cloudflared.exe --config "C:\Users\User\Documents\naijadeals.com\scripts\cloudflare\config.yml" service install
Get-Service cloudflared
Start-Service cloudflared
```

The credential JSON must be readable by `SYSTEM`, and the config path must
remain stable. If the "run as LocalSystem" decision is not acceptable, run the
foreground command under a dedicated scheduled task under the user principal
instead — do not widen file permissions on the repository.

### 7. Stop

```powershell
Stop-Service cloudflared            # service mode
Get-Service cloudflared             # confirm Stopped
# foreground mode: Ctrl+C, or stop the process owning the tunnel
C:\cloudflared\cloudflared.exe tunnel cleanup naijadeals-staging-remote
```

### 8. Revoke everything (teardown order matters)

```powershell
# a. stop the connector first
Stop-Service cloudflared
C:\cloudflared\cloudflared.exe service uninstall
C:\cloudflared\cloudflared.exe tunnel cleanup naijadeals-staging-remote

# b. delete the public route (DNS) BEFORE deleting the tunnel, otherwise the
#    CNAME is left pointing at a deleted tunnel (error 1016). cloudflared has no
#    "route delete" subcommand: use the dashboard (DNS > Records > the
#    staging-remote CNAME > Delete) or the API:
#    DELETE /zones/<zone_id>/dns_records/<record_id>
# c. delete the tunnel
C:\cloudflared\cloudflared.exe tunnel delete -f naijadeals-staging-remote

# d. delete the Access application and its policies in the dashboard
#    (Zero Trust > Access controls > Applications > ... > Delete)

# e. remove local credential material
Remove-Item C:\Users\User\.cloudflared\<UUID>.json
#    keep cert.pem only if other tunnels use this account
```

Verify revocation afterwards: `tunnel list` shows no tunnel,
`Resolve-DnsName staging-remote.naijadeals.com` returns NXDOMAIN, and the
Access application list no longer contains the app.

## Default-deny Access policy — exact dashboard fields

Order is mandatory: **application and policy exist before DNS.**

1. `dash.cloudflare.com` → select the `naijadeals.com` account →
   **Zero Trust** → **Access controls** → **Applications**.
   If the dashboard shows an **Enable Access** / onboarding prompt, that is
   blocker B1: complete the Zero Trust account setup first (plan selection
   screen appears — the free tier is sufficient; do not purchase anything).
2. **Create new application** → **Self-hosted and private** →
   **Add public hostname**.
3. **Application name**: `NaijaDeals Staging Remote (testers)`
4. **Session Duration**: `8 hours` (owner may choose shorter; do not use a
   long-lived session for external testers).
5. **Public hostname** fields:
   - **Subdomain**: `staging-remote`
   - **Domain**: `naijadeals.com` (only selectable once the zone is active on
     Cloudflare — blocker B2)
   - **Path**: leave empty (guards the whole host)
6. **Access policies** → **Create new policy**:
   - **Policy name**: `Default deny - no approved testers`
   - **Action**: `Block` (the API decision value for this action is `deny`)
   - **Configure rules** → **Include** → **Selector**: `Everyone` → **Value**:
     `Everyone`
   - Save. This grants nobody access. Do **not** add `Allow` + `Everyone`,
     do **not** use `Bypass`, and do **not** create a `Service Auth` policy for
     human testers.
7. Leave **identity providers** at the account default. Human testers need at
   least one interactive IdP; the built-in **One-time PIN** (email code) is the
   usual choice when no corporate IdP exists. One-time PIN is a login method,
   not a bypass.
8. **Additional settings**: leave CORS, custom block pages and cookie settings
   at defaults. Do not enable **Apply instant authentication** until an IdP is
   deliberately chosen.
9. **Create**.

When tester emails are approved later, add **one Allow policy per group**, and
make sure it is ordered **above** the Block policy (Access evaluates Block and
Allow top-to-bottom and stops at the first match):

| Field | Value |
| --- | --- |
| Policy name | `Allow - approved testers` |
| Action | `Allow` |
| Include → Selector | `Emails` |
| Include → Value | the exact approved addresses, one per row |
| Require (optional) | `Login Methods` → the chosen IdP |

Zero emails are approved today, so **no Allow policy is created**.

### API equivalent (only after B1 and B2 clear)

```powershell
$acc = "<account_id>"; $zone = "<zone_id>"; $app = "<app_id from create>"
$h = @{ Authorization = "Bearer $env:CF_API_TOKEN"; "Content-Type" = "application/json" }

# 1) application with no hostname yet is not supported; create it with the hostname
#    but keep DNS unpublished until the policy exists.
Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/accounts/$acc/access/apps" -Headers $h -Body (@{
  name = "NaijaDeals Staging Remote (testers)"
  domain = "staging-remote.naijadeals.com"
  type = "self_hosted"
  session_duration = "8h"
} | ConvertTo-Json)

# 2) default-deny policy
Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/accounts/$acc/access/apps/$app/policies" -Headers $h -Body (@{
  name = "Default deny - no approved testers"
  decision = "deny"
  include = @(@{ everyone = @{} })
} | ConvertTo-Json -Depth 6)

# 3) only now publish DNS (requires a token with Zone:Read + DNS:Edit)
Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/zones/$zone/dns_records" -Headers $h -Body (@{
  type = "CNAME"; name = "staging-remote"; content = "<UUID>.cfargotunnel.com"; proxied = $true
} | ConvertTo-Json)
```

## Owner dashboard actions still required

1. **Decide the DNS delegation for `naijadeals.com`.** The zone currently uses
   Hostinger nameservers (`athena/apollo.dns-parking.com`) and the apex, `www`
   and `staging` all point at `187.127.252.23`. Cloudflare Tunnel + Access
   requires the zone to be an **active zone on Cloudflare**. Moving the
   delegation is a live site change and needs explicit authorisation and a
   planned cutover; the alternative is to keep DNS at Hostinger and accept that
   Access cannot protect this hostname.
2. **Enable Zero Trust / Access** for the account (blocker B1).
3. **Grant API permissions** if the API path is wanted: `Zone:Read`,
   `DNS:Edit`, `Access: Edit`, `Cloudflare Tunnel: Edit` scoped to
   `naijadeals.com`. The current MCP bearer token has none of the zone scopes.
4. **Approve tester email addresses.** None were provided, so zero grants exist.
5. **Choose the service identity** for the connector (LocalSystem service vs a
   dedicated user scheduled task).

## What must not happen

- Do not publish `staging-remote.naijadeals.com` before the Access application
  and its Block policy exist.
- Do not create an `Allow Everyone` policy or a `Bypass` policy.
- Do not add `staging.naijadeals.com` to this tunnel or overwrite its record.
- Do not add n8n, PostgreSQL or preview ports to ingress.
- Do not commit `cert.pem`, `<UUID>.json` or any copied credential material.
