# Staging R2 credential rotation — owner handoff

Status: **BLOCKED on an owner-only Cloudflare R2 token operation** (verified
2026-11-16). The application and backup consumers are identified, the current
key scope was observed, and the exact cutover/revocation steps are below. No
replacement credential was created because the configured Cloudflare API token
returns HTTP 403 for both `/accounts/<id>/r2/api_tokens` and
`/accounts/<id>/r2/buckets`; Cloudflare does not expose R2 API-token creation to
that token.

Do not print, paste, screenshot or commit any Access Key ID or Secret Access
Key. The values below are only variable names and bucket names.

## Exposure and scope

The documented exposure is the staging R2 S3 key held in
`C:\NaijaDeals-Staging\env\staging.env`. It is used by:

| Consumer | Variables | Bucket(s) |
| --- | --- | --- |
| Staging app uploads/object backup | `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BASE_URL` | `naijadeals-staging-public`, `naijadeals-staging-private` |
| `scripts/backup/run.mjs backup` object snapshot | same `S3_*` variables | both staging buckets |

On 2026-11-16 the current key successfully listed both staging buckets
(`public: listed`, `private: listed`) and the safe probe
`node scripts/staging/verify-r2-credentials.mjs` returned **8/8 true**:
public/private write and read, public URL success, private public-URL denial,
and cleanup. The old key is therefore still valid and rotation is not complete.
It is not the local SeaweedFS key: the root `.env` uses
`S3_ENDPOINT=http://127.0.0.1:9002` and bucket `naijadeals-dev`; that is a
different local development credential. Backblaze B2 uses separate `B2_*`
variables and is not part of this rotation.

## Owner cutover (exact)

1. In the Cloudflare dashboard: **R2 → Manage R2 API Tokens → Create API
   token**.
2. Choose **Object Read & Write**. Scope it to only
   `naijadeals-staging-public` and `naijadeals-staging-private`. Do not grant
   access to other buckets and do not create an account-wide token.
3. Put the new Access Key ID and Secret Access Key into the protected staging
   file as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. Do not paste them into
   chat, a ticket, Git, a command line, or a screenshot. Keep a local copy only
   in the protected staging secrets location.
4. Restart the staging app so it reads the new process environment. The
   existing backup task inherits `staging.env` on its next run; verify it.
5. Run `node scripts/staging/verify-r2-credentials.mjs` from the repository root
   after the new values are in place. It checks listing, a temporary
   public/private object, public URL accessibility, private public-URL denial
   and cleanup, without printing credentials.
6. Run the existing backup task or `node scripts/backup/run.mjs backup` and
   confirm the manifest and encrypted upload. Do not accept the rotation if
   either the public/private check or the backup fails.
7. Only after successful cutover, revoke the old R2 token in the dashboard.
   Verify the old credential no longer authenticates (for example by running
   the same verification script with a temporary process environment containing
   only the old Access Key ID/Secret). Do not print the failure response body
   or either value.
8. Update `docs/handoff.md` with the actual date, replacement token name/scope
   (not the secret), verification results, and the old token's failure result.

## Verification script

`scripts/staging/verify-r2-credentials.mjs` loads `staging.env`, requires the
two staging buckets and credentials, and performs a temporary write/read/delete
probe. It must be run only against the staging R2 buckets; it refuses a missing
configuration and always attempts cleanup.

```bash
node scripts/staging/verify-r2-credentials.mjs
```

Expected result: `public_listed`, `private_listed`, `public_url_ok`,
`private_public_url_blocked`, and cleanup all true. It does not print the
endpoint credentials, object body or token values.

## What is not changed

- No production R2 credential is rotated.
- No n8n encryption key or n8n owner password is changed.
- No bucket is deleted or re-created.
- No existing object is deleted by the probe (it uses a unique
  `staging/rotation-probe/` key and removes only that object).

## Blocked evidence

- `GET /accounts/<id>/r2/api_tokens` → HTTP 403 `Authentication error`.
- `GET /accounts/<id>/r2/buckets` → HTTP 403 `Authentication error`.
- No Hostinger/Cloudflare dashboard secret is available to this process; the
  owner must perform the dashboard step.
