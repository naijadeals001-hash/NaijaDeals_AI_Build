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
listening. Both preview listeners used `C:\Program Files\nodejs\node.exe`; the
active Ethernet network category was **Public**, and enabled inbound **Allow**
rules exist for that executable on TCP/UDP any port for the Public profile. The
host firewall therefore permits local-network inbound connections to those
ports; reachability from another device also depends on the access point/client
isolation and was **not** tested from a second device. They are not
internet-reachable through this tunnel, are not in its ingress, and are not part
of the protected staging contract.

Exact rebind commands, to be run only by the owning workstream after
coordinating the restart (a restart does not modify the preview database or
source inputs; it does interrupt active sessions):

```powershell
# 3047: verify and coordinate with the current owner, then stop that tree and
# re-run the launcher; its committed last line now uses -H 127.0.0.1.
Get-NetTCPConnection -State Listen -LocalPort 3047 | Select-Object LocalAddress,OwningProcess
cmd /c "scripts\start-review-preview.cmd"
Get-NetTCPConnection -State Listen -LocalPort 3047

# 3107: no committed launcher was found; it is an ad hoc next dev session.
# Stop the current tree after coordinating with its owner, then:
npx next dev -H 127.0.0.1 -p 3107
Get-NetTCPConnection -State Listen -LocalPort 3107
```

The current listeners are PID 53864 (3047) and PID 23476 (3107); verify them
again before stopping anything. The 3047 launcher was updated to bind loopback
for future starts, but the running process predates that change. Both previews
remain LAN-reachable on `::` until the preview owners perform the coordinated
restart. A restart interrupts active preview sessions; an owner-approved
inbound firewall restriction is the alternative that avoids a restart, but it
was not changed here.

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
  the application is bound only to the `onetimepin` provider, which is the only
  account-level provider currently configured. The allowlist is pinned by
  `approved-testers.sha256` without tracking the addresses.
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
- Watchdog: `watchdog.ps1 -CheckOnly` returned `0` on 2026-11-16 against the
  live configuration. It decoded the tunnel token locally without printing it
  and confirmed the token's account tag and tunnel ID match the protected
  configuration (64-byte secret). The full contract is listed in
  `docs/automation/security-watchdog.md`. The isolated failure-path suite
  passed **127/127**; the live connector PID and start time were unchanged
  before and after the suite.

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
| `watchdog.ps1` | Periodic Access/tunnel/ingress/token verification; stop-on-drift, hold and local alert; `-CheckOnly`, `-Loop`, `-ClearHold`, isolated `-Fixture` mode | yes |
| `security-state.ps1` | Shared hold/PID/state/alert helpers and the revalidating stop primitive | yes |
| `watchdog-tests.ps1` | Isolated failure-path suite with a mock connector and synthetic fixtures | yes |
| `.gitignore` | Blocks `*.json`, `*.pem`, `*.key`, `config.local.yml`, logs | yes |
| `config.local.yml` | Optional local override (real UUID) | **never** |
| `C:\Users\User\.cloudflared\<UUID>.json` | Tunnel credential material | **never**, outside the repo by design |

The scripts load credentials from protected local files, never from Git. Do not
print, copy or commit the tunnel token, API token, credential JSON or Access
cookies. The approved email list is deliberately untracked; its protected
location is `C:\NaijaDeals-Staging\secrets\cloudflare-access-allowlist.json`
and its canonical sorted-address SHA-256 is pinned in
`approved-testers.sha256`. Canonical form: trim, lowercase, exactly three
addresses, ordinal sort, newline join, SHA-256. Node `.sort()` and PowerShell
`[StringComparer]::Ordinal` are the same ordering. Changing either file requires
a reviewed change to the other.

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
starting a process, and reports a watchdog security hold as a blocked start.

`start-tunnel.ps1` refuses to run unless the zone is active, the Access app is
present and bound to One-time PIN, the policy is exactly the pinned allowlist,
and the live ingress is exactly the staging hostname plus the 404 catch-all. It
also refuses while `watchdog.ps1` has written the security hold. It starts
`cloudflared` with `--no-autoupdate` and records the child PID in
`C:\NaijaDeals-Staging\run\cloudflared.pid`. `stop-tunnel.ps1` stops only that
PID; if the PID file is absent it stops nothing rather than killing another
tunnel. The tunnel token is passed through the child environment and is never
written to the repository.

## Security watchdog

`watchdog.ps1` re-verifies the protection contract while the tunnel is running
and stops only the PID-file connector on drift. It never creates or edits an
Access application, policy, DNS record or ingress rule; every Cloudflare call
is a GET.

- Checks: zone active; exactly one Access application covers the hostname and
  is the configured application; exact domain(s), `8h` session, HttpOnly and
  Lax cookies, preflight bypass off, enabled; exactly one One-time PIN provider
  and OTP-only binding; exactly one Allow policy with three email-only rules
  whose canonical SHA-256 matches `approved-testers.sha256`; configured tunnel
  ID, remote config source; exact ingress
  (`staging-remote.naijadeals.com -> http://127.0.0.1:3200` plus
  `http_status:404`); no preview, n8n or PostgreSQL port anywhere in ingress;
  WARP routing off; tunnel-token account/ID association; a trusted tracked
  cloudflared PID whenever the tunnel has live connections.
- Interval and retry: 60 s default loop interval (minimum 15 s), 3 API attempts
  per cycle with 5 s between attempts and a 10 s per-request timeout. The
  worst-case verification budget is 40 s; the stop wait plus residual check is
  up to 13 s. Worst-case detection-to-containment is about two minutes; it is
  not instantaneous.
- Fail closed: on confirmed drift or exhausted retries it writes
  `C:\NaijaDeals-Staging\run\security-hold.json`, stops only the validated
  tracked PID, removes the PID file only after confirmed exit, checks for
  residual connections and writes a local alert.
  `C:\NaijaDeals-Staging\logs\security\watchdog-alert.json` is the latest alert,
  `watchdog-log.jsonl` records transitions and
  `C:\NaijaDeals-Staging\run\watchdog-state.json` records the last cycle. No
  email, SMS or pager is sent.
- Restart interlock: `start-tunnel.ps1` refuses while the hold exists, and its
  `-CheckOnly` reports the block. `watchdog.ps1 -ClearHold` runs a fresh live
  verification and removes the hold only on a full pass; it does not start the
  tunnel. The watchdog does not clear a hold automatically.
- `-CheckOnly` is read-only, takes no lock and writes no state. `-Fixture` is an
  isolated test mode; it requires state and log roots outside
  `C:\NaijaDeals-Staging` and cannot target the live PID file.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -Loop -IntervalSeconds 60
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -ClearHold
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog-tests.ps1
```

Exit codes: `0` PASS, `1` DRIFT (fail-closed action ran), `2` UNVERIFIABLE
(bounded retries exhausted, fail-closed action ran), `3` refused/busy/invalid
invocation. The full contract, detection window, limitations and test evidence
are in `docs/automation/security-watchdog.md`.

## Safety rules

- If the Access application or its policy is deleted or weakened while the
  tunnel is running, Cloudflare can pass traffic to the origin. `watchdog.ps1`
  detects this on its next cycle and stops the tracked connector, but the
  window is bounded, not instantaneous: 60 s default interval, 40 s retry
  budget and up to 13 s of stop/residual checks (about two minutes worst case).
  If the watchdog is not running or scheduled, there is no monitoring. Restore
  the app/policy, run `watchdog.ps1 -ClearHold` and only then restart. The
  rollback procedure stops the tunnel before deleting Access.
- Do not kill an untracked or invalid cloudflared process by hand without
  identifying it. The watchdog never does; it reports `untracked_connector` or
  `residual_connections` and leaves the investigation to an operator.
- The coordinator registered the per-minute Windows Scheduled Task
  `NaijaDeals-Staging-Access-Watchdog` on 2026-11-16 and exercised it once
  (`LastTaskResult=0`, state `PASS`, hold absent). Inspect it with
  `Get-ScheduledTask` and `Get-ScheduledTaskInfo`; do not also run a
  long-running `-Loop` process.
- Do not create an `Allow Everyone`, domain-wide, bypass or service-token rule.
- Do not add `staging.naijadeals.com`, n8n, PostgreSQL or preview ports to this
  tunnel.
- Do not publish `staging-remote` from a machine that has not verified the
  Access policy.
- Do not commit `cert.pem`, `<UUID>.json`, tokens or copied credential material.
- Do not change the n8n encryption key or owner password as part of tunnel or
  Access work.
