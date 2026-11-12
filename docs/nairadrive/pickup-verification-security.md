# NaijaDrive pickup-code security

- **Status:** implemented 2026-11-12 on branch `naijashop-marketplace`.
- **Scope:** the 4-digit pickup code for NaijaDrive rides, the server-keyed derivation and
  verification path, key configuration/rotation, legacy transition and the boundary of what the
  design does and does not protect.
- **Out of scope:** fare/payment correctness, dispatch fairness, driver identity/knowledge of the
  rider, device compromise, and legal or regulatory compliance. This is an engineering security
  note, not a certification.

## 1. What the code is for

The rider shows a 4-digit code after a driver accepts. The assigned driver must submit that code
before the trip can start. The code:

- is issued only after acceptance;
- expires after 2 hours (`RIDE_VERIFICATION_TTL_MS`);
- allows 5 wrong attempts (`RIDE_VERIFICATION_MAX_ATTEMPTS`) with a 1.5-second per-record cooldown;
- is single-use for starting a trip (the authoritative start transition checks the same record in
  the same transaction);
- is never returned to the driver, an unrelated account or an administrator.

The rider's own endpoint is the only surface that returns the raw code. Administrator support
actions can reset or attest verification but never return the code.

## 2. Storage and derivation

`RideVerification` stores `salt`, `codeHash`, `algorithm`, `keyVersion`, expiry and attempt state.
It does **not** store the four digits.

For a keyed record:

```
code = HMAC-SHA256(
  key = DRIVE_PICKUP_VERIFICATION_KEY_V<keyVersion>,
  message = "naijadrive-pickup-verification:v1:k<keyVersion>:<rideId>:<salt>:<counter>"
)
```

The 32-bit HMAC block is rejection-sampled into 0000–9999, so every code is equally likely.

```
codeHash = scrypt(code, "naijadrive-pickup-verifier:v1:k<keyVersion>:<salt>:<secret>", 32)
```

Both the derivation and the verifier are keyed by the server secret. Consequently:

- a database-only reader cannot compute the code from `salt`, `rideId`, `algorithm` and
  `keyVersion`;
- a database-only reader cannot brute-force the 10,000 candidates against `codeHash` without the
  secret;
- the unkeyed `scrypt(code, salt)` value is not the stored verifier.

`algorithm` identifies the scheme (`hmac-sha256-pepper-v1`) and `keyVersion` identifies the key.
The key itself is never written to the database, an event, an audit row, a URL or a response.

## 3. Configuration (fail closed)

Required server environment variables:

| Variable | Purpose |
| --- | --- |
| `DRIVE_PICKUP_VERIFICATION_KEY_VERSION` | Positive integer. Key version used for **new** records. |
| `DRIVE_PICKUP_VERIFICATION_KEY_V<version>` | Secret for that version. Minimum 32 characters of high-entropy material. |

Example generation: `openssl rand -hex 32` (64 characters). No value is committed or printed.

Rules enforced by `lib/services/core/drive.service.ts`:

- no default, no fallback to the old salt-only derivation, no reuse of another secret;
- a missing/blank version variable, a non-positive/non-integer version, a missing key for the
  active version, or a key shorter than 32 characters is a configuration failure;
- a missing key for a record's recorded version is also a failure, even if a newer active key
  exists;
- all of these return **503 `verification_key_unavailable`** with a message that does not reveal
  env names or material.

Affected actions:

| Action | Behaviour with missing/invalid key |
| --- | --- |
| Driver acceptance (`acceptRide`) | 503; the acceptance transaction rolls back; the ride remains `requested` and unassigned |
| Rider code retrieval (`GET .../verification`) | 503 when a code would be derived |
| Driver verification (`POST .../verify`) | 503; no attempt is consumed |
| Rider reset | 503; the existing record and attempt count are unchanged |
| Support reset / reset-recovery | 503; the action rolls back |
| Support `verify` on an existing keyed record | succeeds: it marks the record verified without deriving a code; no secret is needed |
| Support `verify` on a missing/invalidated/legacy record | 503: it must first issue a keyed record |
| Start (`driverUpdateRideStatus in_progress`) | 503 for an unverified keyed record whose key is missing; no misleading "enter the code" prompt |
| Release / cancel / expiry | still works; no key is needed to invalidate a record |

## 4. Rotation runbook

1. Generate a new secret and configure it as `DRIVE_PICKUP_VERIFICATION_KEY_V<n+1>`.
2. Keep the old version's variable configured.
3. Set `DRIVE_PICKUP_VERIFICATION_KEY_VERSION=<n+1>` and restart the application.
4. New records use version `n+1`. Records issued under version `n` continue to derive and verify
   with the old key because `keyVersion` is stored per row.
5. Retire the old variable only after every record that could reference it has expired or been
   invalidated: at least the 2-hour code TTL plus the assignment grace (30 minutes) and one sweeper
   interval. If an old key is removed early, those records fail closed (503) and the rider/support
   reset reissues them under the active key.
6. If a key is believed compromised, rotate immediately. Removing the compromised version prevents
   further derivation/verification of its outstanding records; support resets replace them. The
   compromised key can still reveal codes for records that were active while it was in use, so
   treat those codes and rides as suspect.

There is no automatic key rotation, KMS/HSM integration or key-status screen in this increment.

## 5. Authorization and disclosure

- `GET /api/drive/rides/[id]/verification` checks `ride.riderId` and re-checks it inside the
  issuance transaction. The driver, another rider and administrators receive 403.
- The driver board and the Control Center support queue select only expiry/attempt/verified/
  invalidated fields; they never select `salt` or `codeHash`.
- Driver verification responses contain verification state and ride data, never the code.
- Support reset/verify responses contain verification state, never the code.
- Event, audit and SystemEvent payloads carry authorization basis, operator/reason, attempt counts
  and key version metadata; they never carry the code, salt or key material.
- Verification responses are sent with `Cache-Control: private, no-store, max-age=0` and
  `Vary: Cookie`.

The rider is the only actor who can deliberately regenerate by opening the trip screen while a
legacy row is active; otherwise regeneration goes through the rider reset (rate-limited per ride)
or the audited support reset (permission `rides:write`, reason required, rate-limited per ride and
per operator from durable audit rows).

## 6. Legacy records (`keyVersion IS NULL`)

Rows created before this change are salt-only. The runtime never derives or verifies them:

- **Deployment cutover:** `20261112130100_drive_pickup_verification_legacy_cutover`
  invalidates every still-active, unverified legacy row (`invalidatedAt` set), so no salt-only code
  survives the deploy as a usable code. Verified, expired and locked rows are left alone; they
  cannot disclose a code the verify endpoint would accept. Run this migration in the same change
  window that starts the keyed runtime. An old instance still serving would continue to issue
  salt-only records (and would not enforce key configuration), so do not leave old writers running
  after the cutover.
- **Driver verification:** 409 `verification_reissue_required`; no attempt is consumed.
- **Start:** 409 `verification_reissue_required` (after the normal expired/locked checks).
- **Rider retrieval, active unverified row:** the row is replaced under the ride advisory lock with
  a keyed record, and an audit row
  `ride.verification_legacy_reissued` records the transition (no salt/code/key material).
- **Rider retrieval, verified/expired/locked row:** no code is returned; the row is left alone
  because it cannot disclose a usable code. An expired/locked row can be replaced by the normal
  rider reset.
- **Support reset/verify:** a reset always issues a keyed record; a `verify` action first replaces
  an unkeyed row with a keyed one and then marks it verified.
- **Pre-enforcement assignments** with no row at all keep the bounded exception documented in the
  enforcement migration; support can opt them into verification.

## 7. Concurrency and lifecycle

All verification mutations for one ride take
`pg_advisory_xact_lock(hashtext('ride-verification:<rideId>'))` before touching the ride/record.
Acceptance, rider retrieval/rotation, driver verification, rider reset, support reset/verify,
release, cancellation and expiry therefore serialize. The recorded attempt count and verified state
are what the authoritative start transition checks in the same transaction, so:

- a wrong attempt cannot be rolled back by throwing;
- a correct attempt flips `verifiedAt` once;
- a replay returns `alreadyVerified` and cannot restart a closed ride;
- two starts produce one transition;
- a re-assignment rotates the code but carries the spent attempt budget.

## 8. Tests and evidence

Executed on 2026-11-12 against the isolated `naijadeals_wallet_acceptance` database:

- `npx prisma migrate deploy` applied
  `20261112130000_drive_pickup_verification_key_version`.
- `npx tsc --noEmit` exited 0.
- `npx tsx scripts/drive-verification-rating-acceptance.ts` passed **172/172 on four consecutive
  runs**; final RUN_ID `drive-verify-20261112051929-4b362c1a`, `leftovers: 0`, SYSTEM wallet
  restored, reconciliation reported no issues.

The suite exercises, among other cases:

- keyed record creation with `algorithm`, `keyVersion`, keyed hash and expiry/limits;
- a database row alone not yielding a usable code (salt-only derivation differs and the unkeyed
  scrypt hash is not the stored verifier);
- legacy salt-only refusal, rider rotation and support-reset replacement;
- key rotation where version-1 and version-2 records verify with their recorded keys;
- a retired key, an unset active version and a too-short key failing closed with 503 without
  consuming attempts or assigning rides;
- wrong, expired, locked, repeated, leading-zero and concurrent submissions, concurrent starts,
  cross-account access, driver payload inspection and audit/event inspection.

Not executed in this increment: the HTTP `scripts/drive-tests.ts` suite (needs a server started
with the new key variables), `scripts/nairadrive-e2e.ts`, the browser check and a production-like
deployment. The route error envelope (503 + code + message) is the existing `jsonError` mapping;
the service-level suite is the authoritative evidence for the keyed logic.

## 9. Boundary — what is not protected

This design removes the **database-only** disclosure path. It does **not** protect against:

- compromise of both the database and the server secret/environment, or code execution/process
  memory access on the application server;
- a compromised rider session (the rider can read their own code by design);
- the rider voluntarily sharing the code, or a driver/rider colluding;
- online guessing at the verify endpoint beyond the implemented attempt cap, cooldown, expiry and
  assignment check; a 4-digit code remains guessable in principle and is not a cryptographic
  authenticator;
- compromised logs/backups that contain the secret because it was misconfigured into a log sink
  outside this codebase;
- side channels in third-party infrastructure outside this repository.

A full security certification, penetration test or formal threat-model validation has not been
performed. Do not describe the code as "encrypted", "non-recoverable" or "secret from a database
administrator" without these qualifications.

## 10. Open items

- No Control Center key-status or rotation screen.
- No automatic reissue campaign for outstanding legacy rows; they transition lazily on read/reset.
- No KMS/HSM/envelope encryption; the secret lives in the process environment.
- The HTTP and browser suites still need a run against a server configured with the new keys.
- `docs/handoff.md` may still describe the pre-key salt-only limitation; this document supersedes
  that description for the keyed implementation.
