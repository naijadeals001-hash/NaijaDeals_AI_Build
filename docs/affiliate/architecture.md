# NaijaDeals Affiliate — architecture and economics (working record)

Status: **design only.** No schema, migration or code exists yet.
Started: 2026-11-10, under an explicit owner waiver of the Aura gate.

## 1. Repository audit — what Affiliate must reuse

Verified against `prisma/schema.prisma` and the service layer on the date above.

| Need | Existing implementation | Decision |
|---|---|---|
| Identity, sessions, RBAC | `User`, `Role`, `UserRole`, `Session`; `lib/auth/guard.ts`, `lib/auth/permissions.ts`, `lib/auth/scope.ts` | Reuse. Affiliate is a role and a profile, never a second account. |
| Money | `Wallet` (`availableKobo`, `heldKobo`), `WalletTransaction`, `LedgerEntry`, `LedgerAccount`, `AccountPosting`, `postBalancedTransaction` | Reuse. Commission liability posts through the existing double-entry ledger. No second wallet. |
| Order and fulfilment truth | `Order`, `OrderItem`, `OrderStatusEvent`, `Payment`, `EscrowHold`, `Refund`, `ReturnRequest` | Reuse. Only verified, fulfilled, post-refund-window orders qualify. |
| Other verticals | `LogisticsShipment`, `Ride`, `FoodOrder`, `FreshOrder`, `ServiceBooking`, `StayReservation`, `StreamSubscription` | Reuse per vertical, each with its own qualifying event. |
| Notifications | `Notification` outbox engine, `NotificationIntent` transactional outbox, `PartnerNotification` feed | Reuse via the intent outbox written inside the conversion transaction. |
| Background work | BullMQ worker, schedules, dead-letter, heartbeat | Reuse. Commission settlement and reversal sweeps are new scheduled jobs, not a new queue. |
| Control Center | `AdminAction`, `AuditLog`, permission-gated admin routes | Extend with affiliate permissions; no parallel admin surface. |
| AI | Aura provider abstraction, tool registry, confirm-before-act | Extend; see the boundary rule below. |

**Gap confirmed:** there is no `Promotion`, `Coupon`, `Referral` or `Affiliate` model, and no
`referralCode` / `referredBy` / `couponCode` field anywhere in the schema. Affiliate attribution
is genuinely new work, not an extension of existing promotion code.

## 2. Proposed model (not yet migrated)

To be reviewed before any migration is written:

- `AffiliateProfile` — one per `User`, status `APPLIED | APPROVED | SUSPENDED | REJECTED`, terms
  version accepted, payout method reference, risk flags.
- `AffiliateCampaign` — vertical, eligible entity scope, qualifying outcome, commission formula,
  funding source (`PLATFORM | MERCHANT`), budget cap, attribution window days, rule version,
  effective dates.
- `AffiliateLink` — campaign + affiliate, unique code, destination allowlist entry, created/expiry.
- `AttributionTouch` — first-party, consent-aware, stores link id, timestamp, hashed visitor key;
  no raw IP retention.
- `AffiliateConversion` — the qualifying event, with `ruleVersion` frozen at capture, `dedupeKey`
  unique, state machine `TRACKED → VALIDATING → APPROVED → PAYABLE → PAYING → PAID`, plus
  `REJECTED | REVERSED | DISPUTED`.
- `CommissionLedgerLink` — conversion to `WalletTransaction` reference, so every liability
  reconciles to the ledger.
- `AffiliatePayout` — request, approval, provider confirmation, statement.

## 3. Attribution model (proposed)

Server-verified, first-party. Referral code resolves on landing; the touch is recorded with
consent; the qualifying conversion carries the touch forward server-side at order creation, never
from a client-supplied affiliate id. Default precedence **last non-expired touch wins**, with a
documented tie-break against coupon attribution. Windows are per campaign. Expired and direct
visits are recorded as unattributed rather than guessed.

Limitations to state in the UI: no cross-device claim beyond authenticated continuity, no claim
under blocked storage, no claim for offline journeys.

## 4. Economics and safety rules

- Commission only on verified, paid, fulfilled outcomes after the refund window.
- Taxes and delivery fees excluded unless a campaign explicitly includes them.
- Rule version frozen per conversion; a rule edit cannot retroactively change an earned liability.
- Budget enforced atomically with a conditional update, not a read-then-write check.
- Reversal posts a compensating ledger entry; recovery of already-paid commission follows a
  documented, non-punitive policy and never debits unrelated customer funds.
- No joining fee, no recruitment income, no multi-level downline.

## 5. AI boundary

Aura may draft content, explain rules and summarise performance. It may not approve an affiliate,
change a rule, or move money. Those are server-enforced permission checks, not prompt
instructions. Affiliate-supplied text is untrusted input.

## 6. Open questions to settle before schema work

1. Which vertical is the pilot? (Recommendation: NaijaShop, because order, payment, escrow and
   refund states are the most mature and already ledger-backed.)
2. Platform-funded or merchant-funded for the pilot budget, and what cap.
3. Commission basis: order subtotal excluding delivery, or order total? Needs an owner decision
   because it is a pricing policy, not an engineering choice.
4. Payout minimum threshold and timing.
