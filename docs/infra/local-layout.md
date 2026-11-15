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
