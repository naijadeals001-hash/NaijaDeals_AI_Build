# NaijaDeals staging environment (D:\NaijaDeals-Staging)

Status: **configured and partly verified on 2026-11-15**. Development stays in
`C:\Users\User\Documents\naijadeals.com`; KVM4 (application) and KVM2
(PostgreSQL) are untouched future-production hosts.

## Components

| Component | Location | Port | Identity |
| --- | --- | --- | --- |
| Application checkout | `D:\NaijaDeals-Staging\app` (git worktree, detached build) | 3200 | own build, own env file |
| PostgreSQL 18 cluster | `D:\NaijaDeals-Staging\pgdata` (own `initdb`) | 127.0.0.1:55432 | database `naijadeals_staging`, role `nd_staging` |
| Restore role | same cluster | — | `nd_staging_restore` (`LOGIN CREATEDB`), used only for backup restore verification |
| n8n | `D:\NaijaDeals-Staging\n8n` with `N8N_USER_FOLDER` | 127.0.0.1:5680 | separate encryption key, basic auth, no tunnel |
| Logs | `D:\NaijaDeals-Staging\logs\{app,postgres,n8n,backup,events}` | — | JSONL event log at `logs/events/staging.jsonl` |
| Local encrypted backup preparation | `D:\NaijaDeals-Staging\backups\prep` | — | AES-256-GCM |
| Restore verification | `D:\NaijaDeals-Staging\restore-verify` | — | disposable databases only |
| Secrets and env | `D:\NaijaDeals-Staging\secrets\staging-secrets.json`, `D:\NaijaDeals-Staging\env\staging.env` | — | never in Git |

The development previews (ports 3047 / 3107 / 3109) were not stopped or
changed.

### Filesystem caveat

`D:` is a **fixed exFAT** volume (4.7 TB free). exFAT has no NTFS ACLs and no
junction/symlink support, so:

- operating-system ACL restriction of the secrets file is **not available**;
  protection relies on the drive being physically local and the values never
  entering Git, logs or the browser bundle;
- `mklink /J` fails, so the staging checkout has its own copied
  `node_modules` rather than a link to the development tree;
- the PostgreSQL cluster runs on exFAT. It works, but exFAT has weaker
  durability/metadata guarantees than NTFS or ext4, so this staging database is
  not a production reference. Production (KVM2) is expected to use ext4.

## Cloudflare R2 (staging objects)

| Bucket | Access | Notes |
| --- | --- | --- |
| `naijadeals-staging-public` | Public development URL enabled | `https://pub-0759d3c9562f48b0be07f23c1c259db0.r2.dev`; CORS allows `http://localhost:3200` and `http://127.0.0.1:3200` for `GET,HEAD` |
| `naijadeals-staging-private` | Public access disabled | downloads only through short-lived presigned URLs issued after application authorization |

Both buckets: Standard storage, location `ENAM` (Automatic), jurisdiction
`default`. Existing objects, if any, were not modified; nothing was deleted.

Environment names (values are only in the git-ignored staging env file):
`S3_ENDPOINT`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`,
`S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BASE_URL`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

**Blocked:** no R2 S3 API token exists yet. The Cloudflare API token in the
ZCode MCP configuration can manage buckets (it created/verified the settings
above) but Cloudflare does not expose R2 API-token creation through that API,
and the owner must create a bucket-scoped R2 token in the dashboard:

1. R2 → Manage R2 API Tokens → Create API token.
2. Permission **Object Read & Write**, scoped to `naijadeals-staging-public`
   and `naijadeals-staging-private` only.
3. Put the Access Key ID / Secret Access Key into
   `D:\NaijaDeals-Staging\env\staging.env` as `S3_ACCESS_KEY_ID` /
   `S3_SECRET_ACCESS_KEY`, then restart the app.

Until then `isStorageConfigured()` is false for staging: uploads are refused
rather than silently written somewhere else, and object backup is recorded as
skipped. No production file URL changed.

## Backblaze B2 (independent recovery)

- Bucket: **`naijadeals-staging-backups`** (private; bucket-scoped application
  key with list/read/write/delete on that bucket only).
- Verified: put → download (byte-for-byte match) → delete of a harmless probe
  object; listing returns the objects written by the backup job.
- Environment names: `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`,
  `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`.
- Encryption: AES-256-GCM before upload, key in
  `BACKUP_ENCRYPTION_KEY` (32 bytes base64), stored **separately from B2** in
  the staging secrets file. Without that key a backup is unrecoverable.
- No Object Lock, no lifecycle/auto-delete rule, and source deletions are never
  mirrored. Proposed retention for later owner review: keep 14 daily + 8 weekly
  encrypted sets, then manual review; not enabled.

## Start, stop, backup, recovery

```powershell
# start (idempotent): PostgreSQL 55432, n8n 5680, app 3200
powershell -ExecutionPolicy Bypass -File D:\NaijaDeals-Staging\app\scripts\staging\start-staging.ps1

# stop only the staging processes (never touches development ports)
powershell -ExecutionPolicy Bypass -File D:\NaijaDeals-Staging\app\scripts\staging\stop-staging.ps1

# backup + upload + staleness check (mutex, 3 retries)
powershell -ExecutionPolicy Bypass -File D:\NaijaDeals-Staging\app\scripts\staging\backup-staging.ps1

# recovery: download a manifest-listed object, verify sha256, decrypt, restore
# into a new disposable database, compare row counts, drop it
node scripts\backup\run.mjs fetch <remote-key>
```

`start-staging.ps1` refuses to start unless `DATABASE_URL` names
`naijadeals_staging` **and** the live `current_database()` agrees.

Scheduled tasks (registered for the current user, `Ready`):

- `NaijaDeals-Staging-Backup-0200` — daily 02:00
- `NaijaDeals-Staging-Backup-1200` — daily 12:00 catch-up

Both use `StartWhenAvailable` (a run missed while the PC is asleep/shut down
executes at the next opportunity), `MultipleInstances=IgnoreNew`
(no overlap), a 1-hour execution limit and 3 restarts at 10-minute intervals.
Completion and failure are written to `logs/events/staging.jsonl` and to the
Task Scheduler history. **Scheduled backups do not run while the computer is
off**; they run when it next starts or wakes.

## Verification evidence (2026-11-15)

- Isolated database: `naijadeals_staging` on 127.0.0.1:55432 with its own data
  directory on D:, 183 public tables and all 84 migrations applied; development
  databases were not used.
- Backup: encrypted dump created (488,460 bytes), uploaded to
  `naijadeals-staging-backups` under `staging/postgres/…`.
- Recovery: the remote object was downloaded, its sha256 matched the manifest,
  it decrypted, restored into `naijadeals_restore_<timestamp>`, row counts
  matched the manifest, and the disposable database was dropped.
- R2 settings: public development URL enabled on the public bucket, disabled on
  the private bucket, CORS limited to the local staging origins.
- B2 probe: write/read/delete verified with the bucket-scoped key.
- No live email, payment, AI/media call, DNS change, KVM4/KVM2 change or
  production deployment was performed.

## Remaining items

1. Create the bucket-scoped R2 S3 token (owner dashboard action above), then
   re-run an upload/presign/private-denial check with it.
2. n8n installation and restart-persistence check (in progress; Node 26 may be
   newer than the supported range, in which case a Node 22 runtime is required).
3. Object backup of R2 files stays skipped until (1) is done.

## Verification results (final, supersedes the section above)

| Check | Result |
| --- | --- |
| Isolated database | The running app's connections appear in `pg_stat_activity` as `nd_staging` on `naijadeals_staging` only |
| Staging app | Build `c4mTDy3qepAZ0NIihmfXO` served on http://localhost:3200 (HTTP 200) |
| Restart persistence | A marker row written before a full stop/start survived, and the app was serving again afterwards |
| Scheduled backup | `NaijaDeals-Staging-Backup-1200` ran unattended: 490,373-byte encrypted dump, uploaded to `naijadeals-staging-backups`, staleness check passed (158 s) |
| Recovery | That task's object downloaded, sha256 matched the manifest, decrypted, restored into `naijadeals_restore_<ts>`, row counts matched, disposable database dropped |
| B2 probe | Write / read / byte comparison / delete verified with the bucket-scoped key |
| R2 settings | Public development URL enabled and reachable (404 on a missing key); private bucket public access disabled; CORS set for the two local origins |
| Secret hygiene | 0 staging secret values in the 245-file built browser bundle; 0 in staging logs after remediation |

### Secret incident found and remediated

A failed `CREATE ROLE` statement was written by PostgreSQL to
`logs/postgres/postgres-2026-11-15.log` including the restore-role password.
Remediation: rotated the restore-role password with `ALTER ROLE`, updated
`staging.env`, stopped PostgreSQL, deleted the log file, restarted the stack.
The leaked value is invalid, logs now contain no secret, and nothing was
committed.

### Build deviation (documented)

`D:` is exFAT, and Node's readlink returns EISDIR for ordinary files, which
breaks webpack's page discovery; forcing `resolve.symlinks=false` then breaks
Next's Flight client plugin. The verified route: compile once in a short-lived
NTFS worktree on C: (`C:\Users\User\AppData\Local\naijadeals-staging-build`,
same commit, shared dependencies by junction) with standalone bundling
disabled for that build only (`NEXT_OUTPUT_MODE=`), then copy `.next` to
`D:\NaijaDeals-Staging\app\.next`. The served checkout and its build output
are on D:; only the compile ran on NTFS. `next.config.mjs` gained the
`NEXT_OUTPUT_MODE` override and keeps `standalone` as the default.

## Blocked items

1. **R2 S3 token (owner action).** No R2 access keys exist and Cloudflare does
   not expose R2 token creation through the API token in use. Create a
   bucket-scoped R2 API token (Object Read & Write on
   `naijadeals-staging-public` and `naijadeals-staging-private` only), add it
   to the staging env file, restart. Until then staging storage is
   unconfigured: uploads are refused and the R2 object copy in the backup is
   recorded as skipped. Verification items 2–5 (R2 image load, upload targets,
   anonymous private denial, authorized presign) remain BLOCKED.
2. **n8n.** `npm install n8n` on Node 26 produced a 25 GB partial tree on
   exFAT with no executable; it was removed to reclaim space. Needs a Node 22
   runtime and an NTFS install directory, or the Docker Desktop/WSL2 route.
   Docker engine is stopped and was left untouched.
3. Proposed retention (not enabled): 14 daily + 8 weekly encrypted sets, then
   manual review.

## 2026-11-15 (later) — Active staging moved to NTFS on C:

**Paths now.** `C:\NaijaDeals-Staging` holds the running stack:
`app\` (worktree at `a4b2a01`, build `bs3yYUkUWEgqKRX5tzz0U`, `node_modules`
installed with `npm ci`), `pgdata\` (PostgreSQL 18 Windows cluster, port
55432, database `naijadeals_staging`, roles `nd_staging` and
`nd_staging_restore`), `env\staging.env`, `secrets\staging-secrets.json`
(ACL-restricted on NTFS), `logs\` and `migration\`.

`D:\NaijaDeals-Staging` is retained unchanged as the **rollback source**
(old exFAT cluster, stopped) and keeps the encrypted backup preparation
directory `D:\NaijaDeals-Staging\backups\prep` and restore-verify space.

**Migration performed.** Staging app and the old cluster were stopped cleanly;
the database was dumped with `pg_dump --format=custom` (490,530 bytes), a new
cluster was initialised on NTFS, roles recreated from the protected secrets
file, the dump restored (84 migrations, 183 tables), ownership/grants fixed,
and `prisma migrate deploy` rehearsed to the current head (**86 migrations,
187 tables**, including the two support migrations). No running data directory
was copied.

**Verification.** App on http://localhost:3200 serves 200; `pg_stat_activity`
shows its connections as `nd_staging` on `naijadeals_staging`; Prisma client
generation and `next build` ran normally on NTFS (no exFAT readlink workaround).
The scheduled tasks were re-registered against the C: launcher and are Ready.
Before moving, a fresh encrypted backup was uploaded to B2 and restored into a
disposable database with checksum and row-count equality.

**R2.** Buckets and CORS remain as before, but `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY` are still empty in the staging env; no R2 S3 API token
exists and Cloudflare does not expose token creation through the management
token in use. Application-side R2 upload/presign/denial tests remain **BLOCKED**
(owner action below).

**n8n.** Deferred. The partial D: install was removed; installation requires a
supported Node runtime and an NTFS path (or containers), and is not required for
staging or backups.

**Credential incident.** The restore-role password was rotated on 2026-11-15 and
the affected PostgreSQL log deleted after a clean stop; current secrets are
absent from logs, the browser bundle and Git. The old value was overwritten
rather than archived, so it cannot be re-verified directly; the current role
password authenticates and the prior log no longer exists.

**Support-system re-review (separate candidate).** The independent reviewer's
re-verification of `a4b2a01`/build `TeIdZhuU-g_uqTZHvEnKS` returned
CHANGES-REQUIRED for the support feature: global anonymous rate-limit bucket
(H2), 8-hour guest session vs the advertised 7-day link (M8), and a no-op
unassigned-reply notification dedupe key (M9), plus LOW items. These are
outstanding; they do not affect the staging/storage gates above.
