# Escrow reconstruction: ND-20261109-285D47

- Reconstruction date: 2026-11-12 (read-only).
- Incident reference: `docs/incidents/2026-11-11-dev-refund.md`.
- Database inspected: `naijadeals_core` (shared development database, classified TEST).
- Method: `scripts/incident-285d47-reconstruction.ts`, one PostgreSQL transaction with
  `SET TRANSACTION READ ONLY`, server confirmed `transaction_read_only=on`.
- Status: reconstruction complete. **No correction has been executed.** The proposed postings in
  section 2 require operator approval, one audited transaction, a verified unused reference and a
  re-run of the read-only checks.
- This document is append-only evidence. It does not replace or rewrite the 2026-11-11 incident
  record.

## 1. What actually happened

### 1.1 The order, payment and escrow

| Field | Value |
| --- | --- |
| Order | `cmw8tflfw00edv4q8nolx6gdh`, `ND-20261109-285D47` |
| Final state | `status=refunded`, `paymentStatus=refunded`, `refundedKobo=1,968,000` |
| Amounts | subtotal 1,800,000; delivery 150,000; escrow fee 18,000; commission 144,000; total 1,968,000 kobo |
| Currency / country | NGN / NG |
| Customer | `cmvzwmxyx0006v4uc3znnj12g` (Test Customer, `customer@naijadeals.local`) |
| Vendor | `cmvzwmxz3000dv4uc5k9p5p98` (Ikeja Mobile Hub) |
| Payment | `cmw8tflhc00evv4q8knjpq58a`, provider `test`, reference `NDP-ND-20261109-285D47-5C7C20C1` |
| Payment evidence | `status=REFUNDED`, `raw.simulated=true`. No real money moved. |
| Escrow | `cmw8tflit00f2v4q8vhivu4sc`, amount 1,968,000, `held -> refunded` |
| Escrow buyer of record | customer wallet `cmvzwmxzq002bv4ucesyvsyv8` |
| Escrow vendor wallet | `cmvzwmy0b002jv4ucfmn7677z` |

The original hold journal is the decisive evidence:

| Transaction | Wallet | Owner | Direction | Amount |
| --- | --- | --- | --- | ---: |
| `ESCROW-HOLD-cmw8tflfw00edv4q8nolx6gdh` (`cmw8tfliq00exv4q8ultigtu4`) | `cmvzwmxzx002cv4ucop26i63c` | SYSTEM | DEBIT | 1,968,000 |
| same | `cmvzwmy0b002jv4ucfmn7677z` | VENDOR | CREDIT | 1,968,000 |

The SYSTEM wallet was debited 1,968,000 available and credited 1,968,000 held. The vendor wallet
was credited 1,968,000 held. The customer wallet was **not** debited when the escrow was created.
The escrow row nevertheless names the customer as `buyerWalletId`; that mismatch is the incident.

### 1.2 The three completed refunds

| Refund | Amount | Status | Reason | Lifecycle events |
| --- | ---: | --- | --- | --- |
| `cmwcymd0j0001v4wglimejxpo` | 100 | COMPLETED | Phase 07 partial refund test | none |
| `cmwcymd3c000dv4wgkf5ezcqx` | 200 | COMPLETED | Second partial | none |
| `cmwcymd43000pv4wgb1ixuh79` | 1,967,700 | COMPLETED | Concurrent A | none |
| **Total** | **1,968,000** | | | |

All three use provider reference `TEST-REFUND-NDP-ND-20261109-285D47-5C7C20C1`. Each journal is
balanced but posts the wrong buyer:

| Reference | DEBIT | CREDIT |
| --- | --- | --- |
| `REFUND-cmwcymd0j0001v4wglimejxpo` | vendor 100 | customer 100 |
| `REFUND-cmwcymd3c000dv4wgkf5ezcqx` | vendor 200 | customer 200 |
| `REFUND-cmwcymd43000pv4wgb1ixuh79` | vendor 1,967,700 | customer 1,967,700 |

The escrow was still `held` during the refunds, so `settleRefund` took the open-escrow branch. It
debited the customer's `heldKobo`, credited the customer's `availableKobo`, and debited the vendor's
`heldKobo`. It never touched the SYSTEM hold that had funded the obligation.

### 1.3 Wallet effects

Current stored positions after the incident, with the incident ledger reversed to reconstruct the
before-state:

| Wallet | Before (available / held) | After (available / held) | Incident effect |
| --- | --- | --- | --- |
| Customer `cmvzwmxzq002bv4ucesyvsyv8` | 4,780,000 / 103,603,500 | 8,716,000 / 99,667,500 | +3,936,000 available, -3,936,000 held (285D47 + 619DAC) |
| Vendor `cmvzwmy0b002jv4ucfmn7677z` | 2,450,000 / 228,388,200 | 2,450,000 / 222,787,200 | -5,601,000 held (285D47 + 619DAC + 373876) |
| SYSTEM `cmvzwmxzx002cv4ucop26i63c` | -1,776,097,200 / 82,080,000 | unchanged | no refund leg; `updatedAt` 2026-11-10T20:39:40.458Z |

The customer ledger net is 8,716,000 and equals its available balance. Its held balance is not the
projection of its open escrows: it is 1,968,000 below them.

### 1.4 Escrow coverage and the 1,968,000 shortfall

Open escrows with buyer wallet `cmvzwmxzq002bv4ucesyvsyv8`:

| Bucket | Amount kobo |
| --- | ---: |
| Open customer escrows, gross | 107,389,500 |
| Less external escrows actually funded by SYSTEM (`ND-20261109-637B0E` 1,968,000; `ND-20261109-F4BFCF` 3,786,000) | -5,754,000 |
| Customer-funded open escrows (net of completed refunds) | **101,635,500** |
| Customer `heldKobo` | **99,667,500** |
| Shortfall | **1,968,000** |

Vendor coverage is exact: open vendor-side exposure 222,787,200 equals vendor `heldKobo`
222,787,200. The 1,968,000 shortfall is entirely the 285D47 SYSTEM-funded escrow whose refund
debited the customer's held pool.

The whole-book reconciler originally attributed open escrows by `EscrowHold.buyerWalletId`, so it
reported the customer held difference as -7,722,000 (1,968,000 incident + 5,754,000 of open
SYSTEM-funded escrows). That was a reporting attribution error, not additional money. The
reconciler now attributes open escrow exposure to the wallet that funded the hold journal and
reports the recorded-buyer/funding-wallet mismatch as `hold_attribution`. Re-run read-only against
`naijadeals_core`, the customer held difference is now exactly **-1,968,000** and the two legacy
escrows' 5,754,000 appears under the SYSTEM buyer-held position. No money was moved by that code
change; it only stopped hiding the incident inside a larger false difference.

`ND-20261109-637B0E` and `ND-20261109-F4BFCF` are open escrows with the same legacy shape: the hold
journal debited SYSTEM, but `EscrowHold.buyerWalletId` names the customer. Any refund of them would
have repeated the 285D47 error. `F4BFCF` already has a PENDING claim of 3,786,000
(`cmw8tflb100dzv4q8k5v6ifyl`, provider `test`, created 2026-11-09T05:23:30.589Z, no lifecycle
record). It blocks that order's release and remains an unresolved obligation.

### 1.5 Who funded, who was debited, and whether the value exists

- **Who funded the obligation:** the SYSTEM wallet, by the original external-payment hold. The
  customer paid through the simulated `test` provider; no customer wallet balance funded 285D47.
- **Which wallet was debited/credited by the refund:** the customer wallet was debited 1,968,000
  `heldKobo` and credited 1,968,000 `availableKobo`; the vendor wallet was debited 1,968,000
  `heldKobo`. The SYSTEM wallet received no refund leg.
- **Does the customer's available balance contain the value?** Yes at reconstruction time:
  available 8,716,000 >= 1,968,000. The proposed correction removes exactly the erroneous credit
  and leaves 6,748,000, which equals pre-incident available 4,780,000 plus the legitimate 619DAC
  refund 1,968,000. The customer's total (available + held) is unchanged by the correction.
- **Would reclassification restrict unrelated customer funds?** Not while the balance is untouched:
  the 1,968,000 removed is the exact refund credit, not another order's collateral. The condition
  is fragile: if the customer spends that credit before correction, removing it would reach into
  unrelated funds. The proposal's preconditions therefore check `availableKobo >= 1,968,000` at
  execution time; if it fails, the platform must fund the held shortfall instead (section 2.4).
- **Correct counterparty:** the SYSTEM/provider-clearing account. The external refund was paid out
  of platform clearing and discharged an obligation the SYSTEM hold represented. Crediting the
  customer wallet was a double credit in wallet terms; the customer is already made whole through
  the provider refund.

### 1.6 Audit trail for the reverted 100-kobo claim (ND-20261109-726639)

| Evidence | Observed |
| --- | --- |
| Order state | `status=completed`, `paymentStatus=paid`, `refundedKobo=0`, total 2,675,000 |
| Refund rows | 0 (no PENDING, FAILED or COMPLETED row) |
| Refund lifecycle events | 0 |
| Wallet transactions | 2 pre-incident rows only: `ESCROW-HOLD-...` and `RELEASE-...`; no refund reference |
| Audit rows / SystemEvents / OrderStatusEvents | 13 / 25 / 12, all pre-incident |
| Residual write | `Order.updatedAt=2026-11-12T03:03:22.806Z`; no matching audit, system event or refund row |
| Public `Refund` table statistics | 16 inserts, 7 updates, 8 deletes, 8 live rows at read time (cumulative; not attributable to this order) |

The attempted claim and its reversal have **no durable audit trail**. There is no claim row, no
lifecycle event and no journal. The only residual evidence is the order `updatedAt` timestamp and
the handoff narrative that `refundedKobo` moved 100 -> 0. Creating a `Refund` row now to "repair"
the record would fabricate financial history and is forbidden. If audit completeness is required,
an operator may add an incident note referencing this reconstruction and the 2026-11-11 snapshot;
that note must state that no refund occurred.

Confidence: high for order, payment, escrow, refund and wallet rows; high for the 1,968,000
funding-source mismatch; high that 619DAC and 373876 are internally consistent; high that no
financial projection or journal remains for the 726639 claim; medium that a claim row was deleted
rather than never committed; low for a complete flow-level audit trail of that attempt.

Additionally, all three COMPLETED 285D47 refunds have **no `refund.lifecycle` events** even though
the current code records them. Their audit rows and journals exist, but the append-only lifecycle
history is missing. This is an audit gap, not a money difference.

## 2. Proposed correction (not executed)

### 2.1 Exact postings

One audited wallet transaction, reference
`INCIDENT-2026-11-12-285D47-HOLD-RECLASS`, executed in one database transaction after operator
approval:

| Wallet | Available | Held | Journal |
| --- | ---: | ---: | --- |
| Customer `cmvzwmxzq002bv4ucesyvsyv8` | -1,968,000 | +1,968,000 | DEBIT 1,968,000 |
| SYSTEM `cmvzwmxzx002cv4ucop26i63c` | +1,968,000 | -1,968,000 | CREDIT 1,968,000 |

Journal memo: the customer debit returns the erroneous external-refund credit to the provider
clearing account; the SYSTEM credit is that clearing account receiving it. The held changes are
projection changes: the customer hold that the refund consumed is restored, and the SYSTEM hold
that the refund should have discharged is released. The journal balances exactly (1,968,000 debit =
1,968,000 credit). The wallet totals of both wallets are unchanged; no money is created.

No `Refund`, `Payment`, `Order`, `EscrowHold`, vendor or inventory row changes. This is a
reclassification plus clearing-account correction, not a refund reversal.

### 2.2 Before and after

| Wallet | Before available / held | After available / held |
| --- | --- | --- |
| Customer | 8,716,000 / 99,667,500 | **6,748,000 / 101,635,500** |
| SYSTEM | -1,776,097,200 / 82,080,000 | **-1,774,129,200 / 80,112,000** |
| Vendor | 2,450,000 / 222,787,200 | unchanged |

After: customer-funded open escrows 101,635,500 = customer held 101,635,500 (shortfall 0); vendor
open exposure 222,787,200 = vendor held (difference 0); SYSTEM-funded open escrows remain
5,754,000 and SYSTEM held after is 80,112,000 (it also carries ride counterparty holds, which are
outside this reconstruction's scope).

### 2.3 Preconditions and idempotency

1. `WalletTransaction.reference = INCIDENT-2026-11-12-285D47-HOLD-RECLASS` must not exist. At
   reconstruction time the check returned absent.
2. Customer `availableKobo >= 1,968,000`; SYSTEM `heldKobo >= 1,968,000`.
3. No other incident correction has touched these two wallets for this order.
4. Re-run the read-only script immediately before posting; record the before balances and the
   approver.
5. Post in one transaction with a single conditional update per wallet and a unique reference. If
   either conditional update matches zero rows, roll back; do not force it.
6. Re-run the read-only script and whole-book reconciliation afterwards. Expected from this
   correction alone: customer held difference 0; vendor coverage difference 0; journals balanced;
   no new refund rows; no new notifications. Whole-book reconciliation will still be **REVIEW** for
   unrelated pre-existing items observed at reconstruction: 13 duplicate wallet identities, SYSTEM
   available/held differences, the `F4BFCF` legacy pending refund, and `hold_attribution` issues on
   `637B0E`/`F4BFCF`. Those are not caused by this posting and must not be used to call the
   correction failed or to justify additional silent adjustments.

### 2.4 If the operator decides the customer keeps the extra credit

The 1,968,000 held shortfall must then be funded from an approved platform/external-clearing
account. Do not silently debit SYSTEM: its position is already negative by convention and is not
an equity account. This is a finance decision; the exact funding instrument, entity and approval
are not established by this document. The correction above is the recommended option because it
does not leave the customer holding a wallet credit for money that was already refunded through the
provider.

### 2.5 Remaining obligations and related legacy rows

- `ND-20261109-F4BFCF`: open escrow 3,786,000, SYSTEM-funded, customer buyer of record, PENDING
  refund claim 3,786,000 with no lifecycle record. Release must stay blocked until the provider
  outcome is established. The new funding-source guard refuses to submit or settle a refund on this
  legacy shape.
- `ND-20261109-637B0E`: open escrow 1,968,000, same legacy shape, no pending refund. Any refund
  attempt is refused by the new guard; the escrow buyer of record needs operator-approved repair
  or the escrow must be released only through a correctly attributed path.
- The two rows above are the reason this is an incident-class finding, not a one-row typo.

## 3. Reservation-aware release and refund-state guards

### 3.1 `Order.refundedKobo` semantics

`Order.refundedKobo` is a **claim/reservation cap**, not a receipt. `claimRefund` increments it
before an external provider is called. It remains incremented while the `Refund` row is `PENDING`
(reserved, submitted, acknowledged-pending or unknown). Only `Refund.status = COMPLETED` proves
money moved to the buyer. `Refund.status = FAILED` is a released claim and must never be counted as
a completed refund.

Derived helpers now live in `lib/services/core/order.service.ts`:

- `summariseRefundClaims(claimedKobo, refunds)` -> claimed, settled, pending, failed, unclaimed
  reservation and excess claim amounts.
- `loadOrderRefundState(db, orderId)` -> the same plus lifecycle contradictions.
- `assertNoBlockingRefundObligation(state)` -> the shared fail-closed release guard.
- `toOrderRefundSummary(...)` -> a string-safe public projection.

`getOrder` and `getOrders` now include `refundSummary` with explicit `claimedKobo`, `settledKobo`,
`pendingClaimKobo`, `failedClaimKobo`, `unclaimedReservationKobo` and `hasPendingClaims`. The raw
`refundedKobo` remains for compatibility but consumers have an unambiguous field.

### 3.2 Release guard

`loadOrderReleaseState` now reads every refund row and its lifecycle under the order lock.
`assertNoBlockingRefundObligation` refuses release when:

| Condition | Error | Meaning |
| --- | --- | --- |
| `PENDING` refund row (any lifecycle) | `409 refund_pending` | Reserved, submitted, acknowledged-pending or unknown; no release. |
| `FAILED` row whose lifecycle says `submitted`, `unknown` or `confirmed` | `409 refund_state_conflict` | The provider may have paid; reconcile before release. |
| `refundedKobo` > completed + pending | `409 refund_reservation_unreconciled` | A claim cap with no live refund row (lost/deleted claim). |
| completed + pending > `refundedKobo` | `409 refund_reservation_unreconciled` | Settled claims exceed the recorded cap. |

Both `completeOrder` and `resolveDispute(decision=release)` call the same helper after taking
`SELECT id FROM "Order" ... FOR UPDATE`. Lock order is documented in the helper: order row first,
then refund/lifecycle reads (no locks), then escrow claim, then buyer wallet, vendor wallet and
SYSTEM wallet. The refund settlement path takes the same order lock and updates wallets in the same
buyer -> vendor -> SYSTEM order, so completion, dispute release and refund settlement cannot
interleave on one order.

### 3.3 Refund funding-source guard

`lib/payments/service.ts` now has `assertRefundFundingSource`. The authoritative funding record is
the `WalletTransaction` with `type="hold"` for the order. When it exists, the refund is refused
unless:

- there is exactly one hold journal,
- its amount equals the escrow amount, and
- its `walletId` equals `EscrowHold.buyerWalletId`.

The guard runs before an external reservation is created, before any provider refund request is
sent, and again under the order lock at settlement. Error codes:
`refund_funding_source_mismatch` and `refund_funding_source_unknown`. This is the direct fix for
the 285D47 root cause: a legacy escrow naming the customer while SYSTEM funded it can no longer
debit the customer's held pool or send a provider refund that the local books cannot attribute.
Rows with no hold journal (very old imports/manual fixtures) are not proven either way and keep the
historical path; they are a documented remaining gap.

### 3.4 Reader audit

| Reader | What it reads | Correct? | Required change |
| --- | --- | --- | --- |
| `lib/payments/service.ts` `computeRefundBasis`, `claimRefund`, `failExternalRefundReservation` | `Order.refundedKobo` as a cap | Yes | Keep; it is a reservation, not a receipt. Never display it as refunded money. |
| `lib/services/core/order.service.ts` completion/dispute | completed refunds + new derived state | Yes | Implemented. |
| `lib/services/core/reconciliation-correct.ts` `loadOpenHoldLedger` | settled refunds only; pending does not shrink exposure; hold journal is the funding attribution | Yes | Now distinguishes pending claims from an unclaimed reservation and reports `hold_attribution` when the recorded buyer differs from the funding wallet. |
| `lib/services/core/reconciliation-correct.ts` `loadRefundReconciliation` | non-failed claims vs `refundedKobo`; lifecycle classification | Yes | Flags `confirmed_not_settled`, `failed_but_reserved`, `state_conflict`, `legacy_unclassified`. |
| `lib/services/core/seller.service.ts:37` | `paymentStatus === "paid"` for gross/net | **No, understates** | A partially refunded or `refund_pending` order drops out of earnings entirely. Include `paid`, `partially_refunded` and `refund_pending`, then subtract **completed** refunds, not claims. File is outside this slice's ownership. |
| `lib/services/core/seller.service.ts:298` | `refundPayment` result `refundedKobo` (settled amount) | Yes, label ambiguous | Rename the return field to `settledKobo` or document it; never use it as an order-level total. |
| `lib/services/core/business-finance.service.ts:27,33` | `paymentStatus: "released"`; open escrow statuses; gross paid/released | **No** | No shop flow writes `paymentStatus="released"`; `partially_refunded`/`refund_pending` are excluded; open escrow omits `release_eligible`, `refund_requested` and `reserved` and does not subtract completed refunds. Derive from wallet/journal and completed refunds. File outside ownership. |
| `lib/services/core/admin.service.ts:73` | `Payment.status=REFUNDED` sum | Partial | Counts only fully refunded payments, not partial completed refunds; it is not `Order.refundedKobo`, so it does not count claims. Add a `Refund.status=COMPLETED` aggregate and show pending claims separately. File outside ownership. |
| `lib/admin/load-page-data.ts:26`, `lib/api-client.ts:220`, `components/functional/admin-dashboard.tsx:45,183` | admin overview `refundedKobo` | Partial | Same Payment-based metric. Label it "fully refunded payments" or replace with settled/completed refund aggregation; never read `Order.refundedKobo`. |
| `lib/services/core/dispute.service.ts:150,154` | `refundPayment` result (settled) | Yes | The name is ambiguous; the value is the settled refund amount. |
| `components/drive/*`, `lib/services/core/drive.service.ts` | `Ride.refundedKobo` | Separate vertical | Not an `Order` field; do not reuse the shop semantics. |
| Order APIs `app/api/orders*` | raw order object | Partial | Now additive `refundSummary`; clients must use it for receipts. No shop receipt UI currently displays `refundedKobo`. |

No schema change was made for these fields. The derived state is computed from existing refund rows
and the append-only lifecycle, so no historical row was rewritten.

### 3.5 Executed evidence

Commands (isolated databases only):

```
npx tsc --noEmit
# -> exit 0, no diagnostics

# Dedicated database naijadeals_escrow_reservation_guard, migrated to head, empty before run.
npx tsx scripts/escrow-refund-reservation-guard-acceptance.ts
# -> PASS, 107 checks, 0 failures
# -> reconciliation CLEAN: 0 issues, journal difference 0, pending obligations 0, discrepancies 0

# Existing regression suite, naijadeals_escrow_release_acceptance.
npx tsx scripts/escrow-refund-release-acceptance.ts
# -> PASS, 156 checks, 0 failures
# -> cleanup restored the empty book: journal totals 0/0, difference 0

# Read-only reconstruction (no writes; transaction_read_only=on).
INCIDENT_READONLY=1 INCIDENT_READONLY_DB=naijadeals_core \
  npx tsx scripts/incident-285d47-reconstruction.ts
# -> proposal reference absent; customer available contains the credit; SYSTEM held contains the
#    stranded hold; proposed after: customer 6,748,000 / 101,635,500, SYSTEM -1,774,129,200 / 80,112,000.

# Read-only whole-book reconciliation of the incident database.
DATABASE_URL=<same host, /naijadeals_core> RECONCILE_DB=naijadeals_core \
  npx tsx scripts/wallet-reconcile.ts
# -> REVIEW: the incident customer held difference is exactly -1,968,000; vendor held difference 0;
#    the 5,754,000 of SYSTEM-funded open escrows is attributed to SYSTEM buyer-held and reported as
#    a hold_attribution issue; 13 duplicate wallet identities, SYSTEM available/held differences and
#    the F4BFCF legacy refund remain separate pre-existing findings. No write.
```

The guard suite covers reserved, submitted-with-acknowledgement, unknown, confirmed-but-unsettled
and failed claims; both completion and dispute release while each state exists; lost reservations;
excess settlements; the legacy funding-source mismatch; two independent Prisma connections; and
post-resolution conservation with balanced journals.

## 4. Africa-wide financial scoping (documentation only; not implemented)

The financial engine is currently **Nigeria-only, NGN-only, two-minor-decimal, single clearing
entity** in practice, even where some fields accept a country or currency. The exact assumptions
and required changes:

| Area | Current assumption / evidence | Why it breaks outside NG | Exact change required |
| --- | --- | --- | --- |
| Store pricing | `Product.priceKobo` has no currency; catalogue is priced in NGN kobo; `STORE_CURRENCY="NGN"` (`lib/config/regions.ts`) | A GH/KE/ZA order would reuse NGN amounts | Add a currency/price book per product or an explicit, approved FX/price policy; never relabel NGN amounts as GHS/KES/ZAR. |
| Checkout currency | `checkout` sets `order.currency = country.currency`, but subtotal comes from NGN prices and `escrowFee`/delivery fees are NGN kobo (`lib/services/core/checkout.service.ts`) | The order would claim GHS while its components are NGN | Resolve all components in the order currency; validate `product.currency === order.currency`; disable checkout until a country's price book exists. |
| Delivery | `DELIVERY_ZONES` are Nigerian states and NGN fees; `deliveryEnabled` is true only for NG (`lib/config/commerce.ts`) | No zones/fees for other markets | Per-country zone table with local fees and provider; do not fall back to Nigerian states. |
| Wallet currency resolution | `Wallet.currency` defaults NGN; unique indexes include currency, but `ensureWallet` does not accept or filter currency (`lib/payments/service.ts:51`) | A user could hold NGN and GHS wallets; `findFirst` may pick the wrong one | Add `currency` to `ensureWallet`, filter identity by currency, and require callers to pass the order/payment currency. |
| Escrow currency | `EscrowHold` has no currency field; `recordEscrow`, `postEscrowRelease` and `settleRefund` never compare `order.currency`, `payment.currency` or `wallet.currency` | Cross-currency hold/release/refund is possible; a GHS order could debit an NGN wallet | Add `currency` to `EscrowHold` (or enforce via order) and fail closed if order, payment, buyer wallet, vendor wallet and SYSTEM wallet currencies differ. |
| Journal currency | `WalletTransaction`/`LedgerEntry` have no currency; `LedgerAccount`/`AccountPosting` have no currency or entity | A mixed-currency journal can "balance" across currencies | Add currency to ledger rows (or derive from a single-currency transaction and enforce it) and reject any transaction with mixed wallet currencies. |
| Whole-book reconciliation | `journalTotals()` sums all ledger entries; `NGN()` formatter is hardcoded; `loadOpenHoldLedger` aggregates all wallets | A deficit in NGN could mask a surplus in GHS; reports are mislabelled | Group by currency (and legal entity), require each group to balance, and format with `formatMoney(currency)`. `journalTotals` is annotated in code as NGN-only. |
| Minor units | `COUNTRIES[].exponent` exists, but `formatMoney` defaults NGN, `Journal`/`Payout` names say "Kobo", and provider adapters assume 2 decimals (`Number(amountMinor)/100`; Flutterwave verify `*100`; Paystack/Flutterwave webhook defaults `|| "NGN"`) | Zero-decimal (XOF/XAF) or three-decimal currencies would be wrong; provider responses without currency silently become NGN | Use `exponent` from the currency table everywhere; fail closed on a missing provider currency; add provider max-amount and `Number.isSafeInteger` checks before converting BigInt to Number. |
| Payment providers | Paystack supports NG/GH/KE/ZA; Flutterwave supports NG/GH/KE/ZA/US/GB; wallet supports NG only (`lib/payments/adapters.ts`) | "Supports country" is not the same as "supports the order currency/entity/rail" | Replace hardcoded country arrays with a provider-country-currency-entity matrix; validate currency support, not only country; record the provider account/entity used. |
| Refunds | `Refund` has no currency; it derives from `Payment`; guard now checks the funding wallet but not currency | A wrong-currency refund could call the provider or debit a wallet of another currency | Add a currency-identity check to `refundPayment`/`settleRefund` and refuse if order, payment, escrow buyer wallet and vendor wallet currencies differ. |
| Payouts | `Payout` has no currency/country/entity; vendor payout fields are Nigerian bank fields (`payoutBank`, `payoutAccountName`, `payoutAccountNumber`); no payout processor exists | One payout model cannot represent M-Pesa, bank transfer in GHS/KES/ZAR or a non-Nigerian entity | Add `currency`, `countryCode`, `legalEntityId`, rail/provider and recipient identity; implement per-rail payout adapters with sandbox evidence before enabling. |
| Clearing / legal entity | One SYSTEM wallet per owner type (currently one NGN wallet); `LedgerAccount` has no entity; no `LegalEntity` model; `SYSTEM` is platform-wide | All jurisdictions share one clearing position and one books-of-record; a legal entity cannot reconcile its own books | Add `LegalEntity` (or merchant-of-record) and `entityId` to wallets, ledger accounts/postings, orders, escrows, refunds and payouts; require a single entity per journal transaction; create one clearing wallet per entity+currency. |
| Fees, commission, tax | `escrowFee` is hardcoded 1% (`lib/config/commerce.ts:104`), commission is vendor `commissionBps`, no tax/VAT model | Rates, tax registration and disclosure vary by country and entity | Fee/commission rate tables scoped by country/entity with effective dates and operator approval; tax lines only after an approved policy; no invented rates. |
| Admin/report scope | `getAdminOverview` aggregates globally; `filterRowsByRegion` filters listed rows only; `payments`, `refundedKobo`, `escrowHeldKobo` are not region/entity scoped | A regional finance user sees or reconciles another region's money | Add `{countryCode, currency, legalEntityId}` scope to every financial aggregate and enforce it server-side; separate RBAC for finance scopes. |
| Vertical currencies | `DRIVE_CURRENCY="NGN"`; drive fares, NaijaEats/Stay/Stream price fields default NGN; ride settlement uses the same wallet engine | A non-NG drive/eats order would reuse NGN amounts and one wallet | Scope each vertical's price book and settlement currency; do not share an NGN wallet with other-currency verticals. |

Bulk changes were deliberately not implemented. The first safe step is the currency-identity guard
in the shop payment path plus a per-currency/per-entity reconciliation report; enabling any
non-NG checkout, payout rail or legal entity requires operator decisions and local payment-provider
sandbox evidence.

## 5. Operator decisions required

1. **Approve or reject the 1,968,000 reclassification** in section 2. If rejected, decide who funds
   the held shortfall and on what approved account. Do not execute either option without approval.
2. **Legacy escrow buyer-of-record repair** for `ND-20261109-637B0E` and `ND-20261109-F4BFCF`
   (both SYSTEM-funded, both naming the customer). Each needs an approved correction or a
   release path that does not debit customer-held funds.
3. **`ND-20261109-F4BFCF` PENDING refund 3,786,000** has no lifecycle record. Establish the
   provider outcome (test provider; likely never processed) and release the reservation through
   the operator recovery path; do not resubmit it.
4. **Missing refund lifecycle history** for the three COMPLETED 285D47 refunds. Decide whether an
   operator-approved audit note is required; do not fabricate lifecycle events.
5. **ND-20261109-726639 reverted 100-kobo claim.** Decide whether to record an incident note; do
   not create a Refund row, and do not alter the historical order.
6. **Reporting fixes outside this slice** (seller earnings and business finance): approve the
   changes listed in section 3.4 so pending claims never reduce earnings and completed refunds are
   derived from `Refund.status=COMPLETED`.
7. **Africa-wide roadmap:** approve currency/entity fields, per-currency wallets and clearing,
   provider/currency matrix and payout rails before enabling any non-NG commerce.
8. **Dispute release flag:** `DISPUTE_RELEASE_ENABLED` must stay deliberately set only where the
   acceptance evidence is current; the new guard does not change that gate.

## 6. Reproduction and evidence

- Read-only reconstruction: `scripts/incident-285d47-reconstruction.ts`
  (`INCIDENT_READONLY=1 INCIDENT_READONLY_DB=naijadeals_core`).
- Guard acceptance: `scripts/escrow-refund-reservation-guard-acceptance.ts`
  (`naijadeals_escrow_reservation_guard`, reset with `prisma migrate reset --force --skip-seed`
  before each run; it refuses a non-empty database).
- Existing regression: `scripts/escrow-refund-release-acceptance.ts`
  (`naijadeals_escrow_release_acceptance`).
- Prior incident record and snapshot: `docs/incidents/2026-11-11-dev-refund.md`,
  `backups/incident-2026-11-12T03-38-59-450Z.dump` (SHA-256
  `83ffc59dc06c079f5e96137e30d957a13ba8de70f1a84fc2697cdff55d937ae2`).
- No production database, real charge, payout, deployment or historical financial row was touched.
