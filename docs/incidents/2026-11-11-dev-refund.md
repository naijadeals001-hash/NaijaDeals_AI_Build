# Incident: legacy phase07 scripts refunded shared-database orders

- Date of incident: 2026-11-12 02:59:49Z to 03:03:22Z (stored UTC wall-clock).
- Investigation date: 2026-11-12, read-only.
- Database: `naijadeals_core` (shared development database, classified TEST).
- Status: no refund was reversed, no journal was deleted, no wallet balance was reset, and no
  production data was touched. A compensating adjustment is proposed below and requires operator
  approval before execution.

## 1. Summary

`scripts/phase07-partial-refund-tests.ts` and `scripts/phase07-wallet-refund-tests.ts` were run
without overriding `DATABASE_URL`. They constructed a Prisma client from `.env`, selected arbitrary
paid orders in `naijadeals_core`, and refunded them through the real `refundPayment` service.

Seven completed `Refund` rows were created, totalling `5,601,000` kobo (NGN 56,010.00):

| Order | Refunds | Total kobo | Result |
| --- | ---: | ---: | --- |
| `ND-20261109-285D47` | 3 | 1,968,000 | Full refund; order/payment/escrow refunded |
| `ND-20261109-619DAC` | 2 | 1,968,000 | Full refund; order/payment/escrow refunded |
| `ND-20261109-373876` | 2 | 1,665,000 | Full refund; order/payment/escrow refunded |
| `ND-20261109-726639` | 0 | 0 | 100-kobo claim reverted; no completed refund |

The three orders were delivered and their escrow was still `held`, so these were open-escrow
refunds, not post-release refunds. No inventory was restocked and no affiliate conversion existed.

Critical accounting finding: `ND-20261109-285D47` was an external payment whose original hold was
funded by the SYSTEM wallet, but `refundPayment` took the refund from the customer's `heldKobo`
because the legacy escrow's `buyerWalletId` points at the customer. That customer-held pool was
backing other wallet-funded escrows. The customer-held coverage is therefore short by exactly
`1,968,000` kobo after the incident. `ND-20261109-619DAC` and `ND-20261109-373876` were funded by
their buyer wallets and are internally consistent.

## 2. Method and safety

- All investigation queries were `SELECT`-only against `naijadeals_core`.
- A current custom-format snapshot was written outside git before analysis:
  `backups/incident-2026-11-12T03-38-59-450Z.dump`
  (SHA-256 `83ffc59dc06c079f5e96137e30d957a13ba8de70f1a84fc2697cdff55d937ae2`,
  2,534,462 bytes, 3,926 archive entries).
- No connection string or credential was printed.
- The older plaintext dump `backups/test-20261110T092200.dump` was restored into the new temporary
  database `naijadeals_incident_before_20261112` to check whether it was a usable before-state. It
  is an older fixture snapshot (14 orders, latest order `ND-20261103-82469C`) and does not contain
  the incident orders. It was not used as before-state evidence.
- `backups/postgres-2026-11-10T08-43-36-537Z.dump.enc` (encrypted, manifest reports 61 orders) is a
  pre-incident backup of the current dataset but was not decrypted. Its key was not accessed.
- No service code, refund row, journal, wallet balance, escrow row, inventory row or outbox row was
  modified during the investigation.

## 3. Timeline (stored UTC wall-clock)

| Time | Event |
| --- | --- |
| 2026-11-09 05:14:03-05:23:30 | All four orders created, paid and delivered by normal fixture activity |
| 2026-11-12 02:59:49.220-384 | `ND-20261109-285D47`: 100, 200 and 1,967,700 kobo refunds; order closed `refunded` |
| 2026-11-12 02:59:52.554-645 | `ND-20261109-619DAC`: 100 and 1,967,900 kobo refunds; order closed `refunded` |
| 2026-11-12 03:00:19.293-310 | Affiliate reversal intents for the first two orders processed `DONE` |
| 2026-11-12 03:02:32.515-631 | `ND-20261109-373876`: 100 and 1,664,900 kobo refunds; order closed `refunded` |
| 2026-11-12 03:03:19.309-313 | Affiliate reversal intents for `ND-20261109-373876` processed `DONE` |
| 2026-11-12 03:03:22.806 | `ND-20261109-726639` order row updated; no refund row, journal or audit row remains |
| 2026-11-12 03:38:59Z | Incident snapshot taken |

## 4. Per-order findings

### 4.1 ND-20261109-285D47

Order `cmw8tflfw00edv4q8nolx6gdh`, vendor Ikeja Mobile Hub (`cmvzwmxz3000dv4uc5k9p5p98`),
customer Test Customer (`cmvzwmxyx0006v4uc3znnj12g`).

| Field | Value |
| --- | --- |
| Total / subtotal / delivery / escrow fee / commission | 1,968,000 / 1,800,000 / 150,000 / 18,000 / 144,000 kobo |
| Before incident | `status=delivered`, `paymentStatus=paid`, `refundedKobo=0` |
| After incident | `status=refunded`, `paymentStatus=refunded`, `refundedKobo=1,968,000` |
| Payment | `cmw8tflhc00evv4q8knjpq58a`, provider `test`, reference `NDP-ND-20261109-285D47-5C7C20C1`, `amountKobo=1,968,000`, now `REFUNDED`; `raw.simulated=true` |
| Refund 1 | `cmwcymd0j0001v4wglimejxpo`, 100 kobo, `COMPLETED`, reason `Phase 07 partial refund test`, key `refund:cmw8tflfw00edv4q8nolx6gdh:622b34957b27dd0fc132` |
| Refund 2 | `cmwcymd3c000dv4wgkf5ezcqx`, 200 kobo, `COMPLETED`, reason `Second partial`, key `phase07-second-1794452389313` |
| Refund 3 | `cmwcymd43000pv4wgb1ixuh79`, 1,967,700 kobo, `COMPLETED`, reason `Concurrent A`, key `refund:cmw8tflfw00edv4q8nolx6gdh:f22d408f0d459c0f4baf` |
| Provider refund reference | `TEST-REFUND-NDP-ND-20261109-285D47-5C7C20C1` on all three |
| Escrow | `cmw8tflit00f2v4q8vhivu4sc`, amount 1,968,000, `held` -> `refunded`; event note `Concurrent A` |
| Funding source | Original hold `ESCROW-HOLD-cmw8tflfw00edv4q8nolx6gdh` debited SYSTEM `cmvzwmxzx002cv4ucop26i63c` 1,968,000 and credited the vendor 1,968,000 |
| Refund journals | Three `REFUND-<refundId>` wallet transactions on the customer wallet; each ledger balances (customer credit / vendor debit) |
| Audit | `cmwcymd2g0009v4wgtldffvt9`, `cmwcymd3p000lv4wg8fvz2x0t`, `cmwcymd520011v4wg08xgtxy6`, `cmwcymd530015v4wgektq72pq` |
| Inventory | Product `cmw8tflcu00e1v4q8ty5f8zp1` quantity 3, `updatedAt` 2026-11-09 05:23:30.873; no restock |
| Affiliate | No conversion; three reversal intents `DONE` with `eligibleKobo=0`, `allocationPolicy=no_conversion_v1`, `lastError=no_attributed_conversion` |
| Notifications/outbox | No `Notification`, `NotificationAttempt`, `NotificationIntent` or `WebhookEvent` |

The three refunds total exactly 1,968,000 kobo. The order and payment were closed correctly, but the
refund funding source was wrong: the refund debited the customer's held pool even though the
original external hold had debited SYSTEM. See section 5.

Confidence: high for row state, amounts, journal balance and funding-source mismatch.

### 4.2 ND-20261109-619DAC

Order `cmw8t3g7001npv4aw1ksfwq5t`, same vendor and customer.

| Field | Value |
| --- | --- |
| Total / subtotal / delivery / escrow fee / commission | 1,968,000 / 1,800,000 / 150,000 / 18,000 / 144,000 kobo |
| Before incident | `status=delivered`, `paymentStatus=paid`, `refundedKobo=0` |
| After incident | `status=refunded`, `paymentStatus=refunded`, `refundedKobo=1,968,000` |
| Payment | `cmw8t3g7t01o7v4awyvora44u`, provider `wallet`, reference `NDP-ND-20261109-619DAC-526084A2`, `amountKobo=1,968,000`, now `REFUNDED` |
| Refund 1 | `cmwcymfl50001v48kx7jn3tmg`, 100 kobo, `COMPLETED`, reason `Wallet partial`, key `refund:cmw8t3g7001npv4aw1ksfwq5t:629b1b8f63befaeab7f1` |
| Refund 2 | `cmwcymfn0000dv48k7e0exbcx`, 1,967,900 kobo, `COMPLETED`, reason `Wallet remainder`, key `refund:cmw8t3g7001npv4aw1ksfwq5t:ae7397c9583547ba912e` |
| Escrow | `cmw8t3g8c01oev4awb6fn0u1z`, 1,968,000, `held` -> `refunded`; event note `Wallet remainder` |
| Funding source | Original hold `ESCROW-HOLD-cmw8t3g7001npv4aw1ksfwq5t` debited the same customer wallet and credited the vendor |
| Refund journals | Two `REFUND-<refundId>` transactions on the customer wallet; each ledger balances |
| Audit | `cmwcymfmd0009v48kxirlbzh8`, `cmwcymfnn000pv48kee06dvha`, `cmwcymfnp000tv48kbprcuw5c` |
| Inventory | Product `cmw8q29cs0030v4v0rgvfio9w` quantity 1, `updatedAt` 2026-11-09 05:14:04.143; no restock |
| Affiliate | No conversion; two reversal intents `DONE` with `eligibleKobo=0`, `no_conversion_v1` |
| Notifications/outbox | None |

This refund is internally consistent: the buyer wallet that funded the hold received the refund,
and the vendor hold was reduced by the same amount.

Confidence: high.

### 4.3 ND-20261109-373876

Order `cmw8t3g1501lrv4aw5j07glhi`, same vendor, customer Amaka Grace
(`cmw7zls4l0006v46c7jvennf1`, demo stream account).

| Field | Value |
| --- | --- |
| Total / subtotal / delivery / escrow fee / commission | 1,665,000 / 1,500,000 / 150,000 / 15,000 / 120,000 kobo |
| Before incident | `status=delivered`, `paymentStatus=paid`, `refundedKobo=0` |
| After incident | `status=refunded`, `paymentStatus=refunded`, `refundedKobo=1,665,000` |
| Payment | `cmw8t3g1u01m9v4awvxslo08m`, provider `wallet`, reference `NDP-ND-20261109-373876-004771FE`, `amountKobo=1,665,000`, now `REFUNDED` |
| Refund 1 | `cmwcypv0j0001v4n450q2x1kb`, 100 kobo, `COMPLETED`, reason `Wallet partial`, key `refund:cmw8t3g1501lrv4aw5j07glhi:ea3af10347e9ed8217d3` |
| Refund 2 | `cmwcypv2r000dv4n4hg7qrhvq`, 1,664,900 kobo, `COMPLETED`, reason `Wallet remainder`, key `refund:cmw8t3g1501lrv4aw5j07glhi:697da01d8034e1a76a8a` |
| Escrow | `cmw8t3g2a01mgv4awwxzpihpu`, 1,665,000, `held` -> `refunded`; buyer wallet `cmw8t36st003dv49wg65awtyr` |
| Funding source | Original hold `ESCROW-HOLD-cmw8t3g1501lrv4aw5j07glhi` debited the same Amaka wallet and credited the vendor |
| Refund journals | Two `REFUND-<refundId>` transactions on the Amaka wallet; each ledger balances |
| Audit | `cmwcypv1y0009v4n4s0wap4lk`, `cmwcypv3m000pv4n4t1uf7org`, `cmwcypv3p000tv4n4crhgyd29` |
| Inventory | Product `cmw8q29om0047v4v00y241kal` quantity 0, `updatedAt` 2026-11-09 05:14:03.923; no restock |
| Affiliate | No conversion; two reversal intents `DONE` with `eligibleKobo=0`, `no_conversion_v1` |
| Notifications/outbox | None |

This refund is internally consistent.

Confidence: high.

### 4.4 ND-20261109-726639 (reverted 100-kobo claim)

Order `cmw8tffr3002pv4q8e1nmrvdo`, same vendor and customer as 285D47/619DAC.

| Field | Value |
| --- | --- |
| Total / subtotal / delivery / escrow fee / commission | 2,675,000 / 2,500,000 / 150,000 / 25,000 / 200,000 kobo |
| Current state | `status=completed`, `paymentStatus=paid`, `refundedKobo=0` |
| Payment | `cmw8tffsi0037v4q8kcgxkqsp`, provider `test`, reference `NDP-ND-20261109-726639-56D65A54`, `COMPLETED`, `updatedAt` 2026-11-09 05:23:23.485 |
| Escrow | `cmw8tffu1003ev4q8hhw3a4aj`, 2,675,000, `released`, `updatedAt` 2026-11-09 05:23:26.718 |
| Refund rows | 0 (no `PENDING`, `FAILED` or `COMPLETED` row) |
| Wallet transactions | 2 original rows only: `ESCROW-HOLD-cmw8tffr3002pv4q8e1nmrvdo` and `RELEASE-cmw8tffr3002pv4q8e1nmrvdo`; no refund reference |
| Audit / SystemEvent / OrderStatusEvent | 13 / 25 / 12 rows, all pre-incident; none for a refund |
| Affiliate / notifications / outbox | 0 reversal intents, 0 notification intents, 0 notifications |
| Inventory | Product `cmw8tffnu002dv4q89apv6m7s` quantity 4, `updatedAt` 2026-11-09 05:23:23.502; no restock |
| Residual write | `Order.updatedAt=2026-11-12 03:03:22.806`; no matching audit, system event or refund row |

The current order and its financial projections are restored to the pre-claim state. The only
residual evidence of the attempt is the order `updatedAt` timestamp. There is no `Refund` row and no
audit trail recording the claim, its `PENDING` status or its reversal. The handoff narrative records
`refundedKobo` moving 100 -> 0. The code path is consistent with an external test-provider refund
that could not settle (test adapter disabled returns `FAILED`, which `refundPayment` records as a
`PENDING` claim and throws `refund_pending`), followed by a manual reset of `refundedKobo` and removal
of the claim row.

Public `Refund` table statistics currently report 16 inserts, 8 updates, 8 deletes and 8 live rows.
That shows deletion history exists in this table, but it is cumulative and cannot be attributed to
this order. Confidence that no financial projection or journal remains: high. Confidence that the
claim row was deliberately deleted rather than never committed: medium. Confidence in a complete
audit trail for the claim: low.

## 5. Wallet projections, journals and the 1,968,000 coverage shortfall

The incident's wallet transactions since 2026-11-12 02:55 are only the seven refund transactions
and their ledger entries. The wallet `updatedAt` values confirm no later writes to the affected
wallets. Before-values below are reconstructed by reversing only those transactions.

| Wallet | After available / held | Incident ledger | Reconstructed before available / held |
| --- | --- | --- | --- |
| Test customer `cmvzwmxzq002bv4ucesyvsyv8` | 8,716,000 / 99,667,500 | +3,936,000 available (285D47 + 619DAC) | 4,780,000 / 103,603,500 |
| Amaka customer `cmw8t36st003dv49wg65awtyr` | 2,165,000 / 115,397,700 | +1,665,000 available (373876) | 500,000 / 117,062,700 |
| Vendor `cmvzwmy0b002jv4ucfmn7677z` | 2,450,000 / 222,787,200 | 5,601,000 debited from held | 2,450,000 / 228,388,200 |
| SYSTEM `cmvzwmxzx002cv4ucop26i63c` | -1,776,097,200 / 82,080,000 | none | unchanged; `updatedAt` 2026-11-10 20:39:40.458 |

Open escrow coverage after the incident:

| Bucket | Amount kobo |
| --- | ---: |
| Open customer escrows with buyer wallet `cmvzwmxzq...` | 107,389,500 |
| Less open escrows funded by SYSTEM (`ND-20261109-637B0E` 1,968,000; `ND-20261109-F4BFCF` 3,786,000) | -5,754,000 |
| Customer-funded open escrows | 101,635,500 |
| Customer wallet `heldKobo` | 99,667,500 |
| Shortfall | **1,968,000** |

Before the incident, customer-funded open escrows were 103,603,500 kobo and the customer wallet held
103,603,500 kobo, so coverage was exact. The 619DAC refund reduced both the customer-funded open
escrow and the held pool by 1,968,000 and preserved coverage. The 285D47 refund reduced the held pool
by 1,968,000 but its escrow was SYSTEM-funded, so it created the entire 1,968,000 shortfall.

Vendor coverage is exact in both directions: open vendor-side escrows after the incident are
222,787,200 kobo and vendor `heldKobo` is 222,787,200 kobo; before the incident both were
228,388,200 kobo. Amaka's customer-funded open escrows and held pool are also exact after and before.

The ledger entries for every refund transaction balance (debit total equals credit total). The
problem is projection and funding-source selection, not ledger imbalance.

## 6. Affiliate, inventory, notifications and downstream effects

- No `AffiliateConversion` exists for any of the four orders. Seven `AffiliateReversalIntent` rows
  were created by the refunds, all `DONE`, `attempts=1`, `eligibleKobo=0`,
  `allocationPolicy=no_conversion_v1`, `lastError=no_attributed_conversion`. They were processed at
  03:00:19 (285D47, 619DAC) and 03:03:19 (373876). No `AffiliateReversalOperation` or
  `AffiliateRecovery` rows exist for these intents.
- The public `OrderAttribution` table is absent from `naijadeals_core`; migration
  `20261111030000_order_attribution` is present in the repository but is not recorded as applied in
  `_prisma_migrations`. This is a pre-existing schema-drift observation, not caused by the incident.
  No migration was applied.
- No inventory restock occurred. All four products keep their post-sale quantities and their
  `InventoryStock.updatedAt` values from 2026-11-09. `restocked=false` in every refund audit row.
- No `Notification`, `NotificationAttempt`, `NotificationIntent`, `WebhookEvent`, payout, dispute or
  return row references these orders. The affiliate reversal intents are the only durable outbox
  entries.
- Order status events and audit/system event rows record the three refunded orders. `ND-20261109-726639`
  has only its original pre-incident events.

## 7. Before/after evidence and confidence

| Evidence | Availability |
| --- | --- |
| Current custom-format snapshot | `backups/incident-2026-11-12T03-38-59-450Z.dump`, SHA-256 `83ffc59dc06c079f5e96137e30d957a13ba8de70f1a84fc2697cdff55d937ae2` |
| Encrypted pre-incident backup of current dataset | `backups/postgres-2026-11-10T08-43-36-537Z.dump.enc`; manifest reports 61 orders; not decrypted |
| Older plaintext fixture dump | `backups/test-20261110T092200.dump`; restored to `naijadeals_incident_before_20261112`; 14 orders, latest 2026-11-03; does not contain incident orders |
| Row-level before/after | Reconstructed exactly from refund audit rows, wallet transactions, ledger entries and wallet `updatedAt`; no other transactions on the affected wallets after 02:55 |
| 726639 before/after | Handoff narrative 100 -> 0 plus current zero-state; no claim row or audit row remains |

Confidence:

- High: order, payment, refund, escrow and wallet transaction rows and amounts.
- High: the 285D47 funding-source mismatch and its exact 1,968,000 kobo coverage shortfall.
- High: 619DAC and 373876 conserved their buyer-funded escrow coverage.
- High: no financial projection, journal, inventory, notification or affiliate effect remains on 726639.
- Medium: the 726639 claim row was deleted rather than never committed.
- Low: a complete audit trail for the 726639 claim.

## 8. Compensating-action proposal (requires operator approval; not executed)

The preferred repair does not reverse any refund and does not create new money. It only reclassifies
the erroneous spendable credit back into the held pool that was consumed.

1. Approve and record an incident adjustment keyed
   `incident-2026-11-11-285D47-hold-reclass` with one audited wallet transaction on customer wallet
   `cmvzwmxzq002bv4ucesyvsyv8`:
   - debit `availableKobo` by 1,968,000 kobo;
   - credit `heldKobo` by 1,968,000 kobo;
   - memo: "Restore customer escrow hold consumed by external refund ND-20261109-285D47; approved incident correction";
   - idempotency: unique key above, single transaction, verify no row exists before applying.
   - Expected result: available 6,748,000; held 101,635,500; customer total unchanged at
     108,383,500; customer-funded open escrow coverage exactly 101,635,500.
   - This changes no `Refund`, `Payment`, `Order`, `EscrowHold`, vendor or SYSTEM row.
2. If the operator instead decides the customer must keep the extra spendable credit, the 1,968,000
   held shortfall must be funded from an approved platform/external-clearing account. That is a
   finance decision; do not silently debit SYSTEM because its position is already overloaded and
   negative.
3. Do not compensate 619DAC or 373876: their buyer-funded escrow coverage is exact before and after.
4. Do not create, recreate or delete a `Refund` row for 726639. If audit completeness is required,
   record an operator-approved incident note or audit event referencing the handoff and snapshot; do
   not fabricate a refund.
5. Service-code owner: change refund funding selection so the refund uses the escrow's original
   funding wallet/ledger (or refuses when `buyerWalletId` does not match the funding source), instead
   of trusting `escrow.buyerWalletId` alone. A legacy external escrow must be refused even when the
   customer has an unrelated held balance. This is outside this incident slice's file ownership.
6. Keep the new guard in place; future runs require `TEST_DATABASE_URL` and cannot fall back to the
   `.env` `DATABASE_URL`.

After any approved adjustment, re-run the read-only checks in this document: wallet total unchanged,
customer-funded open escrow total equals `heldKobo`, vendor and Amaka coverage unchanged, no new
refund rows and no new notifications.

## 9. Remediation implemented in this slice

- `scripts/lib/test-db-guard.ts`: fail-closed verification of an explicit `TEST_DATABASE_URL`
  (or `NAIJADEALS_TEST_DATABASE_URL`), actual `current_database()`, required financial tables,
  `DatabaseClassification:default=TEST` or `TestDatabaseMarker:default=TEST`, and a configurable
  deny list. Sanitized errors never include the connection string. A child-process helper propagates
  the URL and marker.
- `scripts/assert-test-db.ts`: CLI wrapper; exit 0 only on a verified test target, exit 2 on failure.
- Guard applied to the phase07 refund suites, escrow completion, funding webhook, wallet
  post-release, wallet notification outbox, wallet checkout expiry, wallet partial recovery, wallet
  spend concurrency, wallet concurrency, wallet owner type, affiliate refund integration, affiliate
  settlement race, payment provider failure and payout lifecycle inspection.
- `scripts/test-db-guard-tests.ts`: allowed target passes; `naijadeals_core` denied; missing explicit
  URL fails closed; a name containing "test" without a marker fails; a non-TEST classification fails;
  a dedicated marker table passes; shared `Wallet` counts unchanged; sanitizer test passes.
- No payment, order, drive or service code was changed.
