# Protected staging security watchdog

Status: **implemented and tested locally on 2026-11-16**. Live verification was
read-only (`-CheckOnly`); all failure and stop paths were exercised against
isolated mocks. No live Access policy, DNS record, tunnel ingress or connector
was changed by this work.

## Purpose

`staging-remote.naijadeals.com` is served only through the named Cloudflare
Tunnel, and Cloudflare Access is the outer gate. The configuration can drift
without any application code change: the Access application or policy can be
deleted, weakened to a wildcard or `Everyone`, the OTP binding can change, the
session can be lengthened, ingress can be extended to n8n/PostgreSQL/previews,
the tunnel can switch to a local configuration, or a different tunnel token can
be used.

`scripts/cloudflare/watchdog.ps1` checks those control-plane properties on a
schedule. On a confirmed mismatch it stops only the connector identified by
`C:\NaijaDeals-Staging\run\cloudflared.pid`, writes a hold that blocks
`start-tunnel.ps1`, and emits a local alert. It never recreates, edits or
weakens an Access policy, DNS record, ingress rule or tunnel token.

## What is verified

| Area | Pinned contract |
| --- | --- |
| Zone | `naijadeals.com` status is `active` |
| Access application | exactly one application covers `staging-remote.naijadeals.com`, and it is the configured application ID |
| Access hostname | `domain`, every `self_hosted_domains` entry and every `destinations` URI are exactly the hostname; no wildcard or extra domain |
| Access type / state | `type` is `self_hosted`; `enabled` is true where the API returns it |
| Session policy | `session_duration` is exactly `8h`; `http_only_cookie_attribute` is true; `same_site_cookie_attribute` is `lax`; `options_preflight_bypass` is false |
| Identity provider | exactly one `onetimepin` provider account-wide; the application is bound to that provider only |
| Access policy | exactly one policy; decision `allow`; exactly three `include` rules; every rule is email-only with exactly one nested `email` string; no duplicate addresses |
| Allowlist integrity | canonical lowercase/ordinal-sort/newline-join SHA-256 equals `approved-testers.sha256`; individual addresses are never printed |
| Tunnel identity | the configured tunnel detail returns the configured tunnel ID; `remote_config` is true; `config_src` is `cloudflare` |
| Tunnel configuration | the configuration belongs to the configured tunnel, `source` is `cloudflare`, so the remotely managed ingress is authoritative |
| Ingress | exactly two entries: `staging-remote.naijadeals.com -> http://127.0.0.1:3200`, then a catch-all without a hostname and with `http_status:404` |
| Ingress surface | every service must be exactly the approved origin or the 404 catch-all; non-loopback HTTP services are rejected; ports 3047, 3107, 3109, 5680 and 55432 are rejected wherever they appear |
| WARP routing | `warp-routing.enabled` must be false |
| Tunnel token | the token decodes locally to a JSON object whose account tag and tunnel ID match the configured values and whose secret is at least 32 bytes; no value is printed |
| Credential file | if `%USERPROFILE%\.cloudflared\<tunnel-id>.json` exists, its tunnel ID, account tag and secret shape must match; absence is normal for token-run connectors |
| Connector tracking | the PID file must point to `cloudflared.exe` running `tunnel run` with executable `C:\cloudflared\cloudflared.exe`; if the configured tunnel has live connections and no such PID exists, the state is `untracked_connector` |
| Connector log | a `tunnelID=` line in the tunnel log is corroborating evidence only and never a pass/fail reason by itself |

The check is control-plane configuration verification. It does not verify every
HTTP request; Cloudflare Access continues to enforce the gate between checks.

## Interval, retry bound and detection window

| Setting | Value |
| --- | --- |
| One-shot mode | default; use a scheduler or `-Loop` |
| Loop interval | 60 seconds default, minimum 15 seconds |
| API attempts per cycle | 3 total (initial + 2 retries) |
| Retry delay | 5 seconds |
| Per-request timeout | 10 seconds |
| Worst-case verification budget | 3 x 10 s + 2 x 5 s = 40 s |
| Post-stop wait | up to 10 s for exit + 3 s before the residual-connection read = 13 s |
| Worst-case drift-to-contained | about 60 s (interval) + 40 s + 13 s = 113 s, plus scheduler and OS latency |
| Typical detection-to-stop | a few seconds when the API responds normally |

This is **not instantaneous protection**. A request already in flight can
complete during the window, and a policy change made immediately after a cycle
is detected only on the next cycle. Access still enforces the policy until the
connector is stopped. If the watchdog process is not running or scheduled, no
monitoring occurs.

If the Cloudflare API cannot be read after the bounded retries, the watchdog
fails closed: it stops the tracked connector and writes the hold. This trades
availability for protection during an API or network outage.

## Enforcement, hold and alerting

A confirmed drift or an exhausted retry budget triggers this order:

1. Write or update `C:\NaijaDeals-Staging\run\security-hold.json` before
   stopping, so a crash between the two actions still blocks a restart.
2. Re-read the PID file and revalidate the process name, command line and
   executable path immediately before stopping.
3. Stop only that PID. A stale, non-cloudflared or wrong-executable PID is
   never killed; the action becomes `stop_refused` and the file is preserved
   for investigation.
4. Remove the PID file only after the process is confirmed to have exited.
5. Read the tunnel again after 3 seconds. If connections remain, record
   `residual_connections`: another connector may still be serving the tunnel.
   The watchdog does not kill untracked processes.
6. Update the hold with the final action and reasons, write
   `C:\NaijaDeals-Staging\logs\security\watchdog-alert.json` (latest alert),
   append a transition to `watchdog-log.jsonl`, and write
   `C:\NaijaDeals-Staging\run\watchdog-state.json` (last cycle).

The hold is an interlock, not a policy: `start-tunnel.ps1` refuses to start
while it is present, and `start-tunnel.ps1 -CheckOnly` reports the block. A
corrupt or unreadable hold also blocks. `watchdog.ps1 -ClearHold` runs a fresh
live verification and removes the hold only if every check passes; it does not
start the tunnel and it refuses to run in mock mode. It takes the same lock as
the enforce path, so stop a running `-Loop` before clearing a hold. The watchdog
does not clear a hold automatically on recovery.

Alerts are local only: console output, the latest alert JSON, the transition
log and the hold file. No email, SMS, pager or external message is sent.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | PASS, protection verified and no new hold |
| 1 | DRIFT, a mismatch was verified and the fail-closed action ran |
| 2 | UNVERIFIABLE, bounded retries were exhausted and the fail-closed action ran |
| 3 | Refused, busy (another watchdog cycle holds the lock) or invalid invocation |

Reason codes include `access_app_missing`, `access_app_ambiguous`,
`access_app_domain_mismatch`, `access_app_extra_domain`,
`access_session_duration`, `access_cookie_policy`, `access_preflight_bypass`,
`otp_provider_count`, `otp_binding_mismatch`, `policy_count`,
`policy_decision`, `policy_include_count`, `policy_include_shape`,
`policy_include_duplicate`, `allowlist_hash_mismatch`, `tunnel_missing`,
`tunnel_config_source`, `tunnel_config_tunnel_id`, `ingress_count`,
`ingress_hostname`, `ingress_service`, `ingress_catchall`,
`ingress_forbidden_service`, `warp_routing_enabled`, `token_unparseable`,
`token_account_mismatch`, `token_tunnel_mismatch`, `token_secret_invalid`,
`credentials_file_mismatch`, `untracked_connector`, `api_unavailable`,
`config_incomplete`, `pinned_allowlist_missing`/`_invalid`, `stop_refused`,
`stop_failed`, `stop_timeout` and `residual_connections`.

## Operation

Read-only check (no lock, no state, no stop):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -CheckOnly
```

One enforce cycle (stops only on a verified failure):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1
```

Continuous loop (one process, holds a lock for its lifetime):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -Loop -IntervalSeconds 60
```

After fixing a drift, clear the hold with a fresh live verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog.ps1 -ClearHold
```

`status-tunnel.ps1` is read-only and now prints the hold and the last watchdog
cycle state alongside the existing zone, tunnel, Access and ingress checks.

### Scheduling

The coordinator registered and exercised the per-minute Windows Scheduled Task
`NaijaDeals-Staging-Access-Watchdog` on 2026-11-16. It runs the one-shot
enforce mode as the current local user (`RunLevel Limited`), with
`MultipleInstances IgnoreNew` and `StartWhenAvailable`. First run:
`LastTaskResult=0`, watchdog state `status=PASS`, hold absent.

Do not also run a long-running `-Loop` process. The lock file
`C:\NaijaDeals-Staging\run\watchdog.lock` prevents two cycles from acting
concurrently, but a second long-running loop will remain in exit code 3 and is
not a useful supervisor. The task can be inspected with:

```powershell
Get-ScheduledTask -TaskName "NaijaDeals-Staging-Access-Watchdog"
Get-ScheduledTaskInfo -TaskName "NaijaDeals-Staging-Access-Watchdog"
```

The task was registered by the coordinator, not by the isolated watchdog test
suite; remove it only with the same ownership and change record.

## Testing and evidence

Run the isolated suite:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cloudflare\watchdog-tests.ps1
```

Result on 2026-11-16: **127 passed, 0 failed, exit 0**.

The suite covers:

- invocation guards (live path overrides, live retry/timeout overrides and mock
  roots inside `C:\NaijaDeals-Staging` are refused);
- a healthy cycle (PASS, no stop, no hold, state recorded);
- a malformed fixture refused with exit code 3 and no hold;
- confirmed drift (ingress with n8n/PostgreSQL, token mismatch, WARP enabled,
  a second wildcard Access app, a changed session duration, an extra tester
  address, an `Everyone` include rule, local tunnel configuration, a wrong
  catch-all, an unbound OTP provider, a wrong app domain and extra app
  domains) stopping only the mock tracked connector and writing the hold,
  alert and transition log;
- `-CheckOnly` on drift making no stop and no writes;
- an unverifiable cycle consuming the retry budget, stopping the mock connector
  and recording `api_unavailable`;
- a stale PID pointing at an unrelated process being preserved and never
  killed;
- a connected tunnel with no tracked PID producing `untracked_connector`; a
  stopped tunnel with no PID passing;
- a passing cycle with a pre-existing hold retaining the hold and warning that
  a restart stays blocked;
- the lock returning exit code 3 without touching the connector;
- `-ClearHold` refusing mock mode;
- the shared hold helper (present, corrupt and cleared) and the start-tunnel
  interlock on an isolated copy of the script;
- the live cloudflared process fingerprint being unchanged before and after
  the suite, and no mock connector left behind.

Isolation rules: mock mode requires `-StateRoot` and `-LogRoot` outside
`C:\NaijaDeals-Staging`, refuses live retry overrides, and accepts a tracked
process only when its executable is under the mock root. The mock connector is
a copied `cmd.exe` named `cloudflared.exe` under the temporary root, so it can
be stopped for real without starting a second cloudflared connector. Fixtures
use a synthetic account, tunnel, token and tester addresses.

Live read-only evidence from the same date:

- `watchdog.ps1 -CheckOnly` returned 0 with PASS: zone active, one app, exact
  domain, OTP bound, one Allow policy with three includes and a matching hash,
  `8h` session, token account/tunnel match with a 64-byte secret, healthy tunnel
  with four connections, `config_src=cloudflare`, exact two-entry ingress,
  WARP false, tracked PID 34312.
- `status-tunnel.ps1` returned 0; hold absent; last watchdog state
  `status=PASS`, `action=none`.
- `start-tunnel.ps1 -CheckOnly` returned 0 without starting a process; the
  connector PID and start time were unchanged.
- The registered per-minute task ran once with `LastTaskResult=0`; its state
  was `PASS` and the hold stayed absent.

Not executed live: an enforcement stop against a real drift (it would require
weakening live protection), a live `-ClearHold` (it would require creating a
live hold), and a real API outage. The corresponding logic is covered with
fixtures.

## Token/ID association and residual limitations

The supported local check decodes the tunnel token in memory and compares its
account tag and tunnel ID with the protected configuration; it also validates
the embedded secret length. The live check passes (`account_match=true`,
`tunnel_match=true`, 64 secret bytes). The token value, account tag and tunnel
ID are never printed by the watchdog. `%USERPROFILE%\.cloudflared\<tunnel-id>.json`
is absent on this host, which is normal for a token-run connector.

The decode proves the token was minted for that account and tunnel ID. It is
not cryptographic proof that the running connector is using that token. The
watchdog pairs it with the pinned executable path and command line, the live API
showing the configured tunnel healthy with connections, and, as corroboration
only, the configured `tunnelID=` line in the last 400 log lines.

Remaining limitations:

- No per-request Access audit, DNS monitoring, certificate monitoring or
  firewall monitoring.
- Local listener bindings for the staging origin, n8n and PostgreSQL are not
  continuously monitored. `preflight.ps1` checks 5680/55432 loopback and the
  origin at run time; the preview ports are documented below but are not part
  of the tunnel contract.
- A duplicate or untracked connector is never killed; it is reported as
  `untracked_connector` or `residual_connections` and needs an operator.
- No automatic restart exists. Clearing the hold permits the operator to run
  `start-tunnel.ps1` again; it does not start anything.
- The hold is an operational interlock, not a boundary against a local
  administrator who can delete the file or bypass the scripts.
- A scheduled task must run as an account that can read the protected config,
  inspect the cloudflared process command line and write the staging run/log
  directories.
- A Cloudflare API schema change that removes or renames a pinned field can
  cause a fail-closed stop until the watchdog contract is reviewed.
- The live retry bound and state paths are deliberately not overridable.

## Preview and local-network findings (inspection only)

Neither preview was restarted. Their state on 2026-11-16:

| Port | Process | Binding | Launcher / owner |
| --- | --- | --- | --- |
| 3047 | `node.exe` (Next production start), PID 53864 | `::` (dual-stack) | launched through `scripts/start-review-preview.cmd` by another agent/workstream session; the command chain is bash -> cmd -> npx -> cmd -> node. The committed launcher now includes `-H 127.0.0.1`; the **running** process still predates that change. |
| 3107 | `node.exe` (`next dev`), PID 23476 | `::` (dual-stack) | ad hoc `npx next dev -p 3107` from an interactive agent session; no committed launcher script found |
| 3200 | staging app | `127.0.0.1` | staging launcher (not part of this inspection) |
| 5680 / 55432 | n8n / PostgreSQL | `127.0.0.1` | not in tunnel ingress |

Host firewall evidence: the active Ethernet network category is **Public**, and
there are enabled inbound **Allow** rules for
`C:\Program Files\nodejs\node.exe` on TCP/UDP any port for the Public profile.
Both preview listeners use that executable and bind all interfaces. The host
firewall therefore permits local-network inbound connections to 3047 and 3107;
reachability from another device also depends on the access point/client
isolation and was **not** tested from a second device. They are not reachable
through the tunnel, are not in its ingress, and are not part of the protected
staging contract.

Exact rebind commands, to be run only by the owning workstream after
coordinating the restart (a restart does not modify the preview database or
source inputs; it does interrupt active sessions):

```powershell
# 3047: verify the current owner chain, coordinate with that owner, then stop
# that tree and re-run the launcher (its committed last line now uses -H 127.0.0.1)
Get-NetTCPConnection -State Listen -LocalPort 3047 | Select-Object LocalAddress,OwningProcess
# Re-run with the same REVIEW_DATABASE_URL / REVIEW_EXPECTED_DATABASE env values
# and the same .next-programme build:
cmd /c "scripts\start-review-preview.cmd"
Get-NetTCPConnection -State Listen -LocalPort 3047

# 3107: stop the current ad hoc tree after coordinating with its owner, then:
npx next dev -H 127.0.0.1 -p 3107
Get-NetTCPConnection -State Listen -LocalPort 3107
```

The current listeners are PID 53864 (3047) and PID 23476 (3107); verify them
again before stopping anything. A restart interrupts active preview sessions
and belongs to the preview owner, which is why it was not performed here. Until
that coordinated restart, both previews remain LAN-reachable on `::`. Alternatively, an
owner-approved inbound firewall restriction for those ports could reduce the
exposure without a restart, but that is a host firewall change and was not
made.

## Related files

- `scripts/cloudflare/watchdog.ps1`
- `scripts/cloudflare/security-state.ps1`
- `scripts/cloudflare/watchdog-tests.ps1`
- `scripts/cloudflare/start-tunnel.ps1` (hold interlock)
- `scripts/cloudflare/status-tunnel.ps1` (hold and cycle state display)
- `scripts/cloudflare/approved-testers.sha256`
- `scripts/cloudflare/README.md`
