# NaijaPay ledger forensics (2026-11-09)

Reconciliation of all 184 wallets against the double-entry ledger.

## Result

- **180 of 184 wallets reconcile exactly.**
- **4 exceptions**, all traced to test fixtures, none to customer transactions.
- Global totals: CREDIT ₦26,010,604 · DEBIT ₦25,986,044 — **difference ₦24,560 irreconciled**, exactly the sum of the two unbalanced transactions below.

| Wallet | Owner | Cached balance | Ledger net | Delta |
|---|---|---|---:|---:|
| SYSTEM `…26i63c` | platform | −₦16,982,322 | −₦17,166,576.20 | ₦183,440 |
| VENDOR `…n7677z` | demo vendor | ₦2,308,382 | ₦2,310,632 | −₦2,250 |
| CUSTOMER `…5awtyr` | demo.stream.amaka | ₦1,175,627 | ₦5,000 | ₦1,170,627 |
| CUSTOMER `…yvsyv8` | customer@naijadeals.local | ₦1,083,835 | ₦47,800 | ₦1,036,035 |

## Root cause

Two transactions were written as *notes* rather than postings, so their entries
never summed to zero:

| Reference | Net | What it is |
|---|---:|---|
| `ADJ-PHASE07-FIXTURE-FUNDING-20261103` | +₦25,000 | A Phase 07 correction record whose ledger row is labelled "correction; **not applied**" |
| `GIGS-E2E-CLEANUP-CORRECTION-1` | −₦440 | A Gigs E2E cleanup record describing an alignment it never posted |

Both are fixture-era bookkeeping notes. No customer transfer, order, escrow or
payout is affected: the two customer wallets above were topped up by
`SHOP-REVIEW-FUNDING` (a local test helper) which posts correctly, but whose
balances inherited the earlier imbalance.

## Correction path (implemented, not applied)

`lib/services/core/reconciliation-correct.ts`:
- `listExceptions()` classifies every discrepancy as `unbalanced_transaction` or
  `wallet_delta` and flags whether it is fixture-related.
- `correctException()` posts a **balanced** correction (debit the wallet, credit
  SYSTEM) with a unique reference, an audit row, and a required reason code. It
  refuses to guess for wallet deltas, which need a documented decision.
- No code path edits a balance directly to make a report pass.

**Status: implemented and type-checked; NOT executed.** Applying it changes real
balances in the shared test database, so it is left for an explicit decision;
the operator command is `npx tsx` against `correctException` for each
`unbalanced_transaction` exception with a reason code.

## Prevention (recommended next)

1. Reject any `postBalancedTransaction` call whose entries do not balance — it
   already throws, so the two legacy records must have been inserted directly.
   Add a DB-level check or a nightly `ledger-conservation.ts` alert.
2. Never write an explanatory note into a ledger transaction; use `AuditLog`.
3. Keep fixture funding out of the shared database: use a dedicated test DB.
