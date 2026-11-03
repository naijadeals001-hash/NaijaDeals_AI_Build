# Phase 07 wallet reconciliation investigation

Date: 2026-11-03. Read-only; no financial rows changed.

## Environment evidence

- Working preview **http://localhost:3010** now runs from `C:\Users\User\naijadeals-live`, a clean
  git worktree **detached at HEAD 941991d**, not a separate database.
- Authoritative checkout: `C:\Users\User\Documents\naijadeals.com`, branch
  `naijashop-marketplace`, HEAD 941991d.
- Both `.env` files resolve to **PostgreSQL localhost:5432/naijadeals_core**.
- 3010 was restarted alone; old PID 24760 → new PID 6724; storefront config persisted.
- Worktree uses a junction to the primary `node_modules`; code is checked out at the same commit.

## Current database result

`scripts/phase07-reconciliation.ts`: **10 wallets, 1 mismatch** (not 3 of 37).

| Wallet | Owner | Stored available | Stored held | Stored total | Ledger net | Difference |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| cmvzwmxzx002cv4ucop26i63c | SYSTEM | 1,940,000 | 0 | 1,940,000 | −560,000 | **+2,500,000** |

### Earliest divergence

Ledger entry `cmvzwmxzy002gv4uc5r3yb0rr`, created **2026-11-02T23:43:16.895Z** (same millisecond as
wallet creation), direction **DEBIT**, amount **2,500,000 kobo**, memo **"Fixture funding source"**.
It is the first ledger entry on this wallet.

### Cause

- The 2.5m fixture-funding debit moved the ledger to −2.5m but did **not** reduce the stored wallet.
- Later, two NaijaEats credits of 970,000 each (+1.94m) produced stored 1.94m and ledger −0.56m.
- The difference is exactly the fixture funding entry. There are no escrow holds, payouts, refunds or
  ride entries on this wallet that explain it; ride hold/release pairs net to zero.
- Classification: **legacy fixture/opening-balance one-sided entry**, not payout or refund error.
  It cannot be decided from the DB alone whether the intended treatment was platform opening equity
  or a real cash movement; that requires a business decision.

## Historical 3-of-37 result

The earlier audit recorded three mismatches on the **isolated database**:

| Wallet | Type | Balance | Ledger net | Difference |
| --- | --- | ---: | ---: | ---: |
| cmw09h8cj…oax8 | SYSTEM | 1,425,474 | −25,974,526 | +27,400,000 |
| cmw09h8cm…dkrx | VENDOR | 2,446,726 | 22,256,226 | −19,809,500 |
| cmw09h8cn…wsp8 | VENDOR | 0 | 2,418,000 | −2,418,000 |

Those wallet IDs are **not present** in the current 10-wallet dev database, so their earliest entries
and causes cannot be inspected without that isolated database. They are not re-created or invented
here. The current dev database has a different fixture set and one SYSTEM mismatch.

## Proposed correction (not applied) and dry-run

Option A — reclassify the fixture funding as opening equity with a balanced journal:
- CREDIT SYSTEM wallet 2,500,000 kobo — "Recognise fixture funding as opening equity"
- DEBIT FIXTURE_EQUITY contra account 2,500,000 kobo — "Fixture funding source contra"

This is balanced at the ledger level (debits = credits = 2.5m), preserves every historical entry, and
does not make the SYSTEM wallet negative. It requires a non-wallet accounting account (or an approved
negative-balance SYSTEM contra wallet); the current schema only has wallet ledgers, so this is a
modelling decision, not an automatic fix.

Dry-run result (`scripts/phase07-correction-preview.ts`, no writes):

- SYSTEM ledger net after correction: **1,940,000** = stored total **1,940,000**; difference **0**
- Journal balanced: debits 2,500,000 = credits 2,500,000
- Historical entries rewritten: **no**
- Wallet non-negative invariant: preserved

Option B — change stored balances — rejected because it rewrites balances without establishing the
business treatment and could push the SYSTEM wallet negative.

## Why earlier acceptance checks passed

`phase07-ledger-tests.ts` / partial-refund / payout / webhook suites assert **ledger-level invariants**
(balanced transaction pairs, non-negative wallets, idempotency, duplicate/overdraw rejection) against
fresh test fixtures. They do not assert that every historical stored wallet equals its lifetime ledger
net. Reconciliation is a **different invariant over all wallets**, including legacy SYSTEM/fixture rows,
so it can fail while transaction-level tests pass.

## Status

Phase 07 remains **IN PROGRESS**. Required decisions/evidence:

1. approve or reject the opening-equity treatment and contra-account model;
2. supply the isolated database if the old 3-wallet detail is still required;
3. live provider sandbox reconciliation;
4. refund-fee policy.


## Fixture trace and accounting basis (2026-11-03)

The 2,500,000 kobo is the **SEED-WALLET-FIXTURE** transaction
(`cmvzwmxzy002ev4uc0dgm4qck`, description "Local test fixture funding (not a real payment)"):

- CREDIT customer wallet `cmvzwmxzq002bv4ucesyvsyv8` +2,500,000 ("Fixture balance credited to test customer")
- DEBIT SYSTEM wallet `cmvzwmxzx002cv4ucop26i63c` 2,500,000 ("Fixture funding source")

The transaction group is balanced. The defect is that the **stored SYSTEM wallet was not decremented**
when the fixture credited the customer balance. The SYSTEM wallet is the single platform
clearing/funding account, not a customer or vendor wallet; it currently holds only the 1,940,000 from
two NaijaEats order credits.

The proposed 2,500,000 credit to SYSTEM is therefore **not duplicate funding**: the customer credit
already exists and is unchanged; the credit only reclassifies the one-sided SYSTEM source debit to
FIXTURE_EQUITY. No second customer credit is created.

Fixture-generation source: a repository search found no code containing `SEED-WALLET-FIXTURE` or
"Fixture funding source"; the generating path is not in this checkout (likely external/isolated seed).
It therefore cannot be corrected here. The new lifetime reconciliation regression is the guard against
a new database reproducing the mismatch.

## Append-only correction prepared (unapplied)

- Table: `LedgerAdjustment` (migration `20261103260000_ledger_adjustment`), unique `adjustmentKey`.
- Key: `PHASE07-FIXTURE-FUNDING-20261103`
- Status: **PREPARED**, `appliedAt = null`
- References: SYSTEM wallet, earliest ledger entry, fixture transaction and reference, customer credit
  ledger entry, stored/ledger/difference amounts.
- Rerun `scripts/phase07-prepare-adjustment.ts`: second run returns `already_prepared`, no duplicate row.
- No ledger entry or wallet balance was written.

## Lifetime regression suite

`scripts/phase07-lifetime-reconciliation-tests.ts` checks: non-negative wallets; only the known
quarantined wallet may mismatch (and only one); every ledger transaction group has equal debits and
credits; at most one correction row; correction remains PREPARED. Current result: **PASS**.

## Isolated database

Not available in this environment. The three historical IDs remain recorded as **unresolved historical
evidence**; they are not in the current 10-wallet database and were not recreated.

## Exact preview runtime

Port 3010 is served from `C:\Users\User\naijadeals-live`, detached at the commit recorded below
(after syncing this evidence commit). It uses the same `naijadeals_core` PostgreSQL database as the
authoritative checkout. The SHA is recorded in the handoff at the time of this write.


## Tested correction implementation (2026-11-03)

Contra mechanism: `LedgerAccount` (code FIXTURE_EQUITY, balance may be negative) and
`AccountPosting` (unique per adjustment+account) were added. `applyLedgerAdjustment` runs one
serializable transaction: validate journal, conditionally move PREPARED -> APPLIED, create the SYSTEM
ledger CREDIT (stored SYSTEM balance unchanged), create the FIXTURE_EQUITY DEBIT posting and decrement
the contra balance. Any failure rolls back the status and both postings.

Isolated application test (`scripts/phase07-apply-isolated-test.ts`) runs in a disposable
`phase07_apply_test` schema, migrated from scratch, then dropped. It verifies:

- original fixture transaction: customer CREDIT 2.5m / SYSTEM DEBIT 2.5m
- after adjustment: customer stored/ledger 2.5m; SYSTEM stored 0, ledger -2.5m -> adjustment +2.5m
  -> 0; FIXTURE_EQUITY balance -2.5m; one contra posting
- retry returns already_applied, no duplicate posting
- simultaneous application cannot duplicate
- forced unique-reference failure rolls status back to PREPARED with no posting; retry succeeds
- all wallets reconcile after correction

**Whole-system values (isolated test):** debits = credits = 2.5m; assets customer 2.5m + SYSTEM 0;
contra equity -2.5m; post-correction wallet differences: none.

Lifetime suite label corrected: it proves the known discrepancy is **contained**, not full
reconciliation. Zero unexplained differences are required after the correction is approved/applied.

Production adjustment remains **PREPARED and unapplied**; no SYSTEM/equity posting exists in
naijadeals_core.

## Shared database warning

The 3010 preview worktree and authoritative checkout both use **localhost:5432/naijadeals_core**.
Migrations and financial tests therefore affect both. Any future application test must use a
disposable schema/database, as the isolated test does.


## Cross-table journal reconciliation (2026-11-03)

`reconcileAdjustmentJournals()` validates every adjustment across **LedgerEntry** and
**AccountPosting**, linked by the adjustment and its wallet transaction:

- PREPARED must have no wallet transaction and no contra posting.
- APPLIED must have exactly one wallet CREDIT and one contra DEBIT, equal amounts, matching
  transactionId/adjustmentId, and appliedAt set.
- Totals must balance across both tables (wallet credits + account credits = wallet debits + account debits).

Results:

| Context | Adjustment | Wallet credits | Account debits | Total credits | Total debits | Valid |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Shared DB | PHASE07-FIXTURE-FUNDING-20261103 (PREPARED) | 0 | 0 | 0 | 0 | yes |
| Isolated test | PHASE07-ISOLATED-TEST (APPLIED) | 2,500,000 | 2,500,000 | 2,500,000 | 2,500,000 | yes |

Wallet-only balancing is no longer applied to `ADJ-` transactions; the cross-table check owns them.

## Accounting policy choices

### A. SYSTEM negative clearing position
Post the 2.5m as a SYSTEM clearing liability/overdraft: stored SYSTEM becomes -560,000 and the ledger
stays -560,000. Consequences: reconciliation passes; no equity account; but the only SYSTEM wallet goes
negative, breaking the “all wallets non-negative” invariant and making a platform overdraft look like
spendable balance. Requires an explicit negative-balance exception for SYSTEM.

### B. Separate FIXTURE_EQUITY contra account (implemented, unapplied)
Keep SYSTEM stored at 1,940,000; credit SYSTEM ledger +2,500,000; debit FIXTURE_EQUITY 2,500,000
(balance -2,500,000). Consequences: all wallets non-negative; fixture money is visibly absorbed by
equity; requires a non-wallet account and reporting; customer fixture balance remains an asset with no
external cash backing. Recommended pending approval.

Neither choice is applied to the shared database. The adjustment remains PREPARED.

## Provider sandbox preparation

`scripts/phase07-provider-readiness.ts` loads .env and reports presence only (no network, no values):

- PAYSTACK_SECRET_KEY: **missing**
- FLUTTERWAVE_SECRET_KEY: **missing**
- FLUTTERWAVE_WEBHOOK_HASH: **missing**
- ENABLE_TEST_PAYMENTS: **not true**
- APP_URL: configured

Provider sandbox reconciliation remains **BLOCKED** on credentials/test mode, not on code.

## Terminology

`naijadeals_core` is the **shared local development database**, used by both the authoritative checkout
and the 3010 worktree. The pending correction is a **shared-database adjustment**, not a production
adjustment. No production environment or deployment exists for this work.


## Transaction coverage verification (2026-11-03)

Adjustment transactions are no longer excluded by reference prefix. The lifetime suite classifies every
WalletTransaction:

- linked to an existing `LedgerAdjustment` by exact `ADJ-<adjustmentKey>` and validated by the
  cross-table reconciler -> adjustment coverage;
- every other transaction -> ordinary wallet debit/credit balance;
- any transaction with no ledger entries, any unbalanced ordinary transaction, and any `ADJ-`
  reference without a matching adjustment row is a failure.

Shared DB result: **27 ordinary, 0 adjustment-linked, 0 uncovered, 0 unbalanced ordinary, 0
unrecognised ADJ- references**. A malformed or unrelated `ADJ-` transaction therefore falls into the
ordinary check rather than escaping both.

## Fixture-fund isolation and classification

Choice **B (FIXTURE_EQUITY contra)** is the cleaner development-data approach, subject to sign-off.

- “Fixture equity” is an **internal classification**, not evidence of external cash backing.
- Customer wallet balances are **platform obligations**, not platform assets.
- Synthetic funds are currently identified by the `SEED-WALLET-FIXTURE` transaction and memo text, not
  by a dedicated schema flag. They are fungible in the wallet balance.
- Current environment has `ENABLE_TEST_PAYMENTS=false` and no provider credentials, so fixture funds
  cannot be charged through a live provider today. Customer wallets have no withdrawal path; vendor
  payouts are admin-approved.
- **Gap:** there is no hard schema guard preventing a fixture-funded vendor wallet from entering a
  payout if an admin approves it. Isolation currently relies on test-mode configuration and operator
  discipline. Before applying B, add/maintain an explicit synthetic-funds marker or block fixture
  vendors from payout eligibility.

Required decision: approve B with synthetic-funds isolation rules, or choose A with an explicit
negative SYSTEM exception.

## Refund-fee decision (separate)

Unresolved options:
- **A — refund the escrow fee too:** customer receives full paid total; platform absorbs provider costs.
- **B — retain the escrow fee:** aligns with the unverified 1% policy but needs disclosure/approval.
- **C — stage-dependent:** retain only after fulfilment starts; most complex and needs policy input.

No code change until a decision is recorded.

## Provider sandbox readiness limits

The readiness script reports **credential/test-mode presence only**. Missing keys block execution; they
do not prove the integration has no code defects. Sandbox delivery, webhook verification and
reconciliation remain unexecuted until keys are securely configured.
