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
