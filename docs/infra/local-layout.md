# Local layout standard

**Rule:** installations, active runtimes, databases and protected configuration
live on **C: (NTFS)**; bulk media, exports, archives and encrypted backup copies
live on **D:**.

| Path | Owner / purpose |
| --- | --- |
| `C:\Users\User\Documents\naijadeals.com` | Main development checkout (unchanged) |
| `C:\NaijaDeals-Staging\app` | Active staging checkout, dependencies, build `.next` |
| `C:\NaijaDeals-Staging\pgdata` | Active staging PostgreSQL 18 cluster (port 55432) |
| `C:\NaijaDeals-Staging\env`, `secrets` | Staging configuration and secrets, NTFS ACL-restricted |
| `C:\NaijaDeals-Automation\node22`, `node24` | Isolated Node runtimes (22.23.5, 24.22.3) |
| `C:\NaijaDeals-Automation\n8n` | n8n 2.47.7 installation and `node_modules` |
| `C:\NaijaDeals-Automation\n8n-data` | n8n SQLite database and execution data |
| `C:\NaijaDeals-Automation\config\n8n.env`, `recovery.key` | n8n configuration, encryption key, recovery key (ACL-restricted) |
| `D:\NaijaDeals-Storage\output` | Workflow output files |
| `D:\NaijaDeals-Storage\backups` | Encrypted backup copies (staging DB, R2 objects, n8n) |
| `D:\NaijaDeals-Staging` | Stopped rollback copy of the previous exFAT staging install |

## n8n local development instance

- Version **2.47.7**, run with **Node 24.22.3** (`C:\NaijaDeals-Automation\node24`).
  n8n 2.x refuses to start on Node 22; the Node 22 runtime is retained only for
  reference.
- URL **http://127.0.0.1:5680**, bound to localhost, no tunnel, no external
  webhooks. Local webhook URLs are therefore unreachable by external providers.
- Database: n8n's supported default SQLite at
  `C:\NaijaDeals-Automation\n8n-data\database.sqlite`; the NaijaDeals
  application database is not used.
- Owner account: **not created**. First visit shows the setup page; the owner
  must create the local account interactively. No credentials were invented.
- Start/stop/status: `scripts/automation/start-n8n.ps1`, `stop-n8n.ps1`,
  `status-n8n.ps1` (idempotent, port-guarded). Logon task
  `NaijaDeals-n8n-Logon` starts it when the owner logs in; it does not run while
  the computer is off or logged out.
- Code nodes may use built-in modules only (`NODE_FUNCTION_ALLOW_BUILTIN=fs`);
  external packages and env access are not enabled. Workflows should write bulk
  output to explicit `D:\NaijaDeals-Storage\...` paths.
- Backup: `n8n-backup` snapshots SQLite with `VACUUM INTO` (WAL-safe), encrypts
  the database plus configuration with AES-256-GCM using
  `C:\NaijaDeals-Automation\config\recovery.key` (kept separate from the
  archives) and writes `D:\NaijaDeals-Storage\backups\n8n\n8n-*.enc`. Verified
  by restoring into `C:\NaijaDeals-Automation\restore-test` and reading the
  workflow table (1 workflow, inactive).
- Verified workflow: "NaijaDeals local file test" (manual trigger → Code node)
  executed through the CLI, wrote `D:\NaijaDeals-Storage\output\n8n-test.txt`
  (50 bytes, sha256 `b40b0ce1…`), and persisted across an n8n restart.

## Independent acceptance (2026-11-15)

An independent, read-only reviewer re-verified every runtime gate and returned
PASS for: staging :3200 serving build `j3ZZjPZtovmXdoiL_a_zO` from worktree
`38f952e`; PostgreSQL on C: with 86 migrations and staging-only sessions; both
R2 buckets reachable with no `_verify/` leftovers and `putObjectIn`/
`getObjectFrom`/`presignGetFrom` present; B2 dump `sha256 7a194ab0…` (508,104 B)
and objects archive (2 objects, per-object checksums, 8/8 restore checks);
n8n 2.47.7 on Node 24 with the inactive test workflow and its D: output file;
and all scheduled tasks ready with C: actions.

Reviewer follow-ups recorded:
- Scheduled tasks run under an **interactive** principal, so they do not run
  while the user is logged out; `StartWhenAvailable` replays after logon.
- The n8n settings endpoint now reports `showSetupOnFirstLoad=false` with one
  existing user account. The owner must sign in with the account they created;
  no credentials were recorded here, and no reset was attempted.
- The staging database holds no business rows, so the database restore proves
  schema and migration recovery, not business-data recovery.
- A parked session from the earlier migration was terminated during this pass.

## Protected remote access (Cloudflare) — BLOCKED pending owner action

Requested setup: Cloudflare Tunnel with Cloudflare Access in front of the
staging site, origin kept at 127.0.0.1:3200, no other local service exposed.

Current verified state:
- The Cloudflare API token in the MCP configuration can read tunnels
  (`GET /accounts/{id}/cfd_tunnel` → 200, 0 tunnels) but cannot list zones
  (`GET /zones` → 200 with an empty result), so it cannot create the DNS record.
- Access is not enabled on the account:
  `GET /accounts/{id}/access/apps` → 403 `9999 access.api.error.not_enabled`.
- No tunnel or DNS record was created. Publishing the hostname before Access
  is enabled would expose staging, so nothing was published.

Owner actions required:
1. Cloudflare dashboard → Zero Trust → enable Access for the account.
2. Grant the API token (or the person completing the setup) `Zone:Read`,
   `DNS:Edit`, `Access:Edit` and `Tunnel:Edit` for `naijadeals.com`, or perform
   the DNS/Access steps in the dashboard.
3. Provide the approved tester email addresses; no allow-rule has been added,
   so the default-deny posture remains.
4. Suggested unused hostname: `staging-remote.naijadeals.com` (must be checked
   against DNS before creation; `staging.naijadeals.com` must not be
   overwritten).
