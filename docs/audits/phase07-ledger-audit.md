# Phase 07 — wallet, payments, escrow and settlement audit

Date: 2026-11-03. Environment: isolated test database (`naijadeals_test`) with
`ENABLE_TEST_PAYMENTS=true`; no provider credentials, no live money.

## Entry gate

Phase 05 PASS (admin Control Center + RBAC) and Phase 06 PASS (partner onboarding, suspension,
notifications, active-job rule) are recorded in `docs/phase-tracker.md` with evidence.

## Inventory reviewed

| Area | Implementation |
| --- | --- |
| Ledger | `lib/services/core/wallet.service.ts` — `postBalancedTransaction` rejects non-positive amounts and requires debit = credit per transaction; `assertLedgerBalanced` |
| Payments | `lib/payments/service.ts` — initialize, confirm (duplicate guard), refund (full order only), webhook dedupe by `provider_eventId` |
| Escrow | `EscrowHold` freeze/release paths used by disputes and order completion |
| Payouts | `markPayoutPaid` in `lib/services/core/admin.service.ts` |
| Adapters | test/wallet local adapters; Paystack/Flutterwave require keys and verify signatures |

## Acceptance cases and results

Run: `npx tsx scripts/phase07-ledger-tests.ts` against the isolated database.

| Case | Result | Evidence |
| --- | --- | --- |
| Every wallet transaction balances (integer kobo) | PASS | `unbalanced=0` |
| No wallet has negative available or held balance | PASS | `negative=0` |
| Duplicate payment confirmation is idempotent | PASS | both calls `duplicate=true`, one payment row |
| Insufficient funds cannot create a food order | PASS | `insufficient_funds`, zero orders written |
| Concurrent payout settlement debits once | PASS | wallet 2,450,000 → 2,449,500 with two simultaneous calls; third call no-op |
| Payout cannot overdraw the vendor wallet | PASS | `insufficient_wallet`, payout stays PENDING, wallet unchanged |
| Partial refund attempts | PASS | individual `Refund` rows, cumulative 100 → 300 kobo, over-refund rejected, ledger balanced; `scripts/phase07-partial-refund-tests.ts` |
| Concurrent / repeated refund | PASS | one `ok` + one `refund_conflict`; repeat returned `already_refunded` |
| Refund idempotency key | PASS | repeated key returned the stored attempt without another provider call |
| Wallet refund + escrow | PASS | buyer credited, escrow marked refunded, cumulative attempts sum equals order total (`scripts/phase07-wallet-refund-tests.ts`) |
| Synthetic webhook signatures | PASS | Paystack HMAC-SHA512 and Flutterwave hash accepted; bad signatures rejected (`scripts/phase07-webhook-tests.ts`) |
| Provider sandbox delivery/reconciliation | BLOCKED | no live sandbox credentials; synthetic signature verification passes separately |

## Refund attempts model

A new `Refund` table records every refund attempt (amount, status PENDING/COMPLETED/FAILED, reason,
actor, payment, unique idempotency key, provider reference). The remaining refundable amount is
reserved atomically before the provider call; the same idempotency key never calls the provider twice.
`Order.refundedKobo` stays the cumulative figure and must equal the sum of COMPLETED refund attempts.

## Refund extension

`refundPayment` now accepts an optional `amountKobo`, tracks `Order.refundedKobo`, claims the exact
starting balance inside the transaction, splits wallet releases proportionally between seller payable
and platform fee, and only restocks/close the order on a full refund. Repeating a refund after the
order is fully refunded returns `already_refunded`; a concurrent refund loses the claim and returns
`refund_conflict`.

## Defect found and fixed

`markPayoutPaid` previously read the payout, updated it to PAID and decremented the vendor wallet
without a conditional guard. Two simultaneous calls could both pass the read, both decrement, and a
payout larger than the balance could push the wallet negative.

Fixed by claiming the payout atomically (`updateMany where status != PAID`) and making the wallet debit
conditional on `availableKobo >= amountKobo`; both run in one transaction, and a failed debit rolls the
payout status back. The concurrency and overdraw cases above fail on the old code and pass now.

## Policies and unresolved inputs

- The reported **1% escrow fee remains an unverified existing policy**; no code change was made and it
  is not treated as approved.
- Cancellation fees remain zero; no fee was invented.
- Partial refunds need a product decision on fee treatment and a cumulative refunded-amount model
  before implementation.
- Sandbox provider checks need credentials; they block only those integration checks.

## Reconciliation finding

`scripts/phase07-reconciliation.ts` compares every wallet's available + held balance with the
credited-minus-debited ledger net. On the isolated database **3 of 37 wallets do not reconcile**:

| Wallet | Owner type | Balance | Ledger net | Difference |
| --- | --- | --- | --- | --- |
| cmw09h8cn…wsp8 | SYSTEM | 0 | 2,418,000 | −2,418,000 |
| cmw09h8cj…oax8 | VENDOR | 1,425,474 | −25,974,526 | +27,400,000 |
| cmw09h8cm…dkrx | VENDOR | 2,446,726 | 22,256,226 | −19,809,500 |

These are historical rows: payouts previously decremented the wallet without a `WalletTransaction`,
and early fixture/escrow flows did not always post a matching ledger entry. New payouts now post a
balanced `payout` transaction (vendor DEBIT, SYSTEM CREDIT) and credit the SYSTEM clearing wallet, so
new settlements reconcile. The three legacy wallets need an explicit backfill decision (amount,
counter-account, audit note) before Phase 07 can claim full reconciliation — a database backfill was
not performed because it changes financial history.

## Status

**Phase 07 IN PROGRESS** after review. Local invariants pass (ledger, payouts, partial/concurrent
refunds, synthetic webhooks), but the phase stays open pending (a) a live provider sandbox delivery and
reconciliation check, (b) the refund-fee policy decision, and (c) GitHub preservation of these commits.
No live charges were made.

## Migration impact

`20261103240000_refund_attempts` adds the `RefundStatus` enum and `Refund` table (unique idempotency key, order/payment FKs). Payout eligibility is application logic only.

**Evidence limitation (2026-11-03):** the partial-refund suite used completed test-provider payments
because the isolated database had no paid wallet order at test time. The wallet-provider
partial-refund branch is implemented with the same proportional ledger split but was not separately
exercised; a paid wallet order should be added to the fixture set before treating that branch as
verified.


## Preservation

The commits for this phase are **not yet preserved on GitHub**: the push exits 128 and the remote
`naijashop-marketplace` remains at `d28a6beadbd10cdc42424270b79b3ff627d0d3b7`. Local backup remote and
bundle are current. Phase 07 stays IN PROGRESS until GitHub preservation is verified.
