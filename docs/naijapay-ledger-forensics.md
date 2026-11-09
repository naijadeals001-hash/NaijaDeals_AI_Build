# NaijaPay ledger verification — corrected findings

Verified 2026-11-05 against `naijadeals_core` on `localhost:5432` at commit `1eefa91`.
Read-only tooling: `scripts/naijapay-verify-reconciliation.mjs` and
`lib/services/core/reconciliation-correct.ts` → `reconcile()`.

This document supersedes the 2026-11-09 note. **Four of that note's claims were wrong.**
Each correction is backed by the query that proves it. No ledger, wallet or equity row was
changed during this verification.

---

## 1. Environment

| Item | Value |
| --- | --- |
| Database | `naijadeals_core` |
| Host | `localhost:5432` (`::1/128`) |
| Journal size | 596 `LedgerEntry` rows · 184 wallets |
| Verification mode | Read-only |

## 2. Reproduced figures

| Measure | Value |
| --- | --- |
| Wallets | 184 |
| Journal CREDIT | ₦26,010,604.00 (308 entries) |
| Journal DEBIT | ₦25,986,044.00 (288 entries) |
| Journal difference | **₦24,560.00** |

These match the earlier note. The interpretation below does not.

## 3. Correction 1 — a wallet's stored balance is not `available + held` vs journal net

The earlier note compared `availableKobo + heldKobo` against each wallet's full journal net.
That test is wrong, and it is why two perfectly healthy customers were reported as broken.

A wallet's position splits into two balances that reconcile against the **same** journal net
in different ways:

| Stored balance | Reconciles against |
| --- | --- |
| `availableKobo` | The wallet's **full** journal net |
| `heldKobo` | The **magnitude** of the wallet's net across escrow movements |

Held money still belongs to the wallet, so it is not removed from the wallet's position —
only from what it may spend.

Tested against all 184 wallets:

| Invariant tested | `availableKobo` correct | `heldKobo` correct |
| --- | ---: | ---: |
| `available == full journal net`, `held == −escrow net` | **182/184** | **182/184** |
| `available == journal net minus escrow`, `held == \|escrow net\|` | 180/184 | 182/184 |

**So 182 of 184 wallets reconcile correctly. There are 2 exceptions, not 4.**

## 4. Correction 2 — the two "customer exceptions" are not exceptions

| Wallet | Stored held | Open escrow | Monthly available vs journal |
| --- | ---: | ---: | --- |
| `customer@naijadeals.local` `…yvsyv8` | ₦1,036,035.00 | ₦1,036,035.00 | ₦47,800.00 = ₦47,800.00 exact |
| `demo.stream.amaka@naijastream.demo` `…5awtyr` | ₦1,170,627.00 | ₦1,170,627.00 | ₦5,000.00 = ₦5,000.00 exact |

Both hold `heldKobo` that matches their **open escrows to the kobo**, and both reconcile
exactly on `availableKobo`. They are customers with 30 orders still awaiting delivery or
release, not corrupt balances.

The earlier note said their balances "inherited the earlier imbalance". They did not.

## 5. Correction 3 — the ₦24,560 is not a hole in the books

There are **two posting books**:

1. **Wallet journal** — `WalletTransaction` + `LedgerEntry`.
2. **Equity book** — `LedgerAccount` + `AccountPosting`, keyed by `transactionId` with no
   Prisma relation, which is why it is easy to miss.

Joining them on `transactionId` closes the difference exactly:

| Transaction | Wallet journal net | Equity book net | Combined |
| --- | ---: | ---: | ---: |
| `ADJ-PHASE07-FIXTURE-FUNDING-20261103` | +₦25,000.00 | −₦25,000.00 | **₦0.00** |
| `GIGS-E2E-CLEANUP-CORRECTION-1` | −₦440.00 | +₦440.00 | **₦0.00** |
| **Total** | **+₦24,560.00** | **−₦24,560.00** | **₦0.00** |

`FIXTURE_EQUITY`'s cached balance is −₦24,560.00, matching its own postings exactly.

**Read together, both books balance to the kobo.** The ₦24,560 is the mirror of the equity
contra, not missing money.

## 6. Correction 4 — the "not applied" row *was* included as a posting

`ADJ-PHASE07-FIXTURE-FUNDING-20261103` carries a SYSTEM CREDIT of ₦25,000 whose ledger memo
reads *"…(correction; not applied)"*, while its `LedgerAdjustment` status is `APPLIED`.

The operator recorded that the correction was **not applied**, yet a signed posting exists and
the adjustment is marked applied. That is a real reporting defect — any statement reading the
wallet journal alone shows ₦25,000 of income the operator excluded — but it is not a money loss.

The earlier note was right to flag the row and wrong to leave it counted.

## 7. Values corrected

`GIGS-E2E-CLEANUP-CORRECTION-1` was written by `scripts/gigs-e2e-correction.ts` using a direct
`create`, bypassing `postBalancedTransaction` (which would have thrown).

- SYSTEM CREDIT **₦60.00** + CUSTOMER `customer@naijadeals.local` DEBIT **₦500.00**
- Equity contra: `FIXTURE_EQUITY` CREDIT ₦440.00, with **no `adjustmentId`**
- **The earlier note's ₦6,000 / ₦50,000 figures were wrong.** The script's header comment says
  "50000 kobo" and "6000 kobo" in prose, but the executed code writes `6000n` and `50000n`
  **kobo** — ₦60 and ₦500. The note quoted the comment instead of the data.

## 8. The 2 genuine exceptions

### 8a. VENDOR `…n7677z` (Ikeja Mobile Hub) — commission lost on release

Order `ND-20261109-726639`: subtotal ₦25,000, commission ₦2,000, delivery ₦1,500,
total (= escrow) ₦26,750, payable ₦24,500.

Ledger at release: `DEBIT 26,750 / CREDIT 24,500 + CREDIT 2,250` → net **₦0**.
Stored at release: `availableKobo += 24,500`, `heldKobo −= 26,750` → net **−₦2,250**.

The commission is never realised against the stored balance, so the vendor's stored total is
**₦2,250 short of its journal position** — exactly the commission.

This is an arithmetic defect in `completeOrder`/`releaseEscrow`, not fixture noise. It would
affect **any** seller, so the vendor record must not be treated as disposable.

### 8b. SYSTEM `…i63c` — same class, not customer money

Stored `heldKobo` ₦770,800 vs escrow journal position ₦103,970; `availableKobo` differs from
journal net by ₦587,360. The platform account carries the other side of the escrow arithmetic
above, plus test funding. A negative platform `availableKobo` is expected in a test-only
economy where fixtures are funded from SYSTEM. **Not itemised per order yet** (§10).

## 9. Why `correctException()` was removed

The previous implementation was unsound in three independent ways:

1. **It could not fix the journal difference.** It posted `DEBIT X` and `CREDIT X`. Equal
   additions on both sides leave the difference **unchanged**. The earlier note's own
   arithmetic agrees: *"global difference after: ₦24,560.00 (unchanged)"*.
2. **It would have created a real leak.** It moved money wallet↔SYSTEM even where the equity
   book already carried the exact offset (§5), double-counting ₦25,000 that was never missing.
3. **It posted a meaningless figure.** It collapsed the ₦60 credit and ₦500 debit into
   −₦440 and posted that against one wallet.

`correctException()` now throws `409 manual_review_required` unconditionally.
`reconcile()` reports each issue with severity, both books, transaction evidence and remediation.

## 10. Provenance — what is and is not a fixture

Provenance is asserted only where the row itself proves it. A customer-sounding email is
explicitly **not** evidence.

| Account | Evidence | Verdict |
| --- | --- | --- |
| SYSTEM `…i63c` | `ownerType = SYSTEM`, no `userId` | Platform account |
| VENDOR `…n7677z` | vendor "Ikeja Mobile Hub", owner `seller@naijadeals.local` | **Real vendor record in this database — not disposable** |
| `customer@naijadeals.local` | `.local` domain; balances reconcile exactly | Dev-local identity, healthy |
| `demo.stream.amaka@naijastream.demo` | `.demo` domain; balances reconcile exactly | Demo identity, healthy |

The earlier note's claim that "all four exceptions are test fixtures, none to customer
transactions" is wrong on both counts.

## 11. Final separation of concerns

| Problem | Cause | Money lost? | Required fix |
| --- | --- | --- | --- |
| Journal difference ₦24,560 | Offset already booked in `FIXTURE_EQUITY` | **No** | Reports must join both books |
| "Not applied" row counted as a posting | `applyLedgerAdjustment` writes a `LedgerEntry` for a not-applied correction | No | Separate documentation from postings |
| Two "customer exceptions" | Wrong invariant (`available + held` vs full net) | **No — not defects** | Fix the report, not the data |
| **Vendor short ₦2,250** | Commission never realised against the stored balance at release | **Yes — stored balance understated** | Fix `completeOrder` |
| SYSTEM ₦587,360 / ₦666,830 | Platform side of the same escrow arithmetic + test funding | Not customer money | Itemise after the release fix |

## 12. Open items

1. SYSTEM's two deltas are attributed to this class but not itemised per order.
2. The release fix must be proven on an isolated database copy before anything is applied
   to the shared database.
3. No repair has been executed. Any repair requires explicit approval.
4. Financial verification should use dedicated, clearly named test accounts while this
   repair is pending.
