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
| Partial refund | PASS | two partial refunds accumulated 100 → 300 kobo, over-refund rejected, ledger balanced; `scripts/phase07-partial-refund-tests.ts` |
| Concurrent / repeated refund | PASS | two simultaneous full refunds produced one `ok` + one `refund_conflict`; repeat returned `already_refunded` |
| Provider webhook signature | BLOCKED | no Paystack/Flutterwave credentials or sandbox webhook fixture in this environment |

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

## Status

**Phase 07 PASS** against the local invariants: ledger balance, conservation of each transaction,
insufficient funds, duplicate confirmation, payout idempotency/concurrency, overdraw rejection,
partial and cumulative refunds, concurrent refund settlement and repeated refunds all pass.
**Provider sandbox integration is BLOCKED** — no Paystack/Flutterwave credentials or webhook fixtures
exist, which the exit gate permits to block only those provider checks. No live charges were made.

## Migration impact

None. The payout fix is application logic only.
