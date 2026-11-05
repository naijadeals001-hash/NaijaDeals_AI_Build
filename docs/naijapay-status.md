# NaijaPay implementation status

Living register of what is implemented, verified, blocked or not implemented, with
the exact dependency blocking each unfinished payment workflow. Update on every
NaijaPay change. Evidence references live in `docs/handoff.md`.

## Implemented and verified

| Capability | Surface | Engine | Verification |
|---|---|---|---|
| NaijaPay landing (approved green-and-gold design) | `/pay` | real photography + generated hero | visual QA 390/768/1440, images 11/11, 0 overflow |
| Live wallet card (balance, escrow sum, recent tx) | `/pay` | `/api/wallet` (existing ledger) | signed-in browser check, real balance |
| Full wallet experience (toggle, escrow list, searchable/filterable history) | `/wallet` | same | signed-in mobile+desktop checks, 0 overflow |
| Add Money panel (honest per-provider state) | `/pay#add-money` | `/api/payments/methods` | runtime: wallet-only env shows unconfigured state |
| P2P transfer engine | service only | `Wallet`/`WalletTransaction`/`LedgerEntry` via `postBalancedTransaction` | 23/23 financial-safety tests ×2 runs (isolated schema) |
| Control Center reconciliation tab (wallet vs ledger, unbalanced journals) | `/admin?module=pay&tab=reconciliation` | `/api/admin/finance/reconciliation` | admin 200 + renders 10 wallets; anonymous 401; customer 403 |
| NaijaPay Business dashboard (earnings, pending settlement, gross sales, wallet activity) | `/pay/business` | `/api/pay/business/overview` (vendor wallet, Payout, EscrowHold, paid orders) | anon 401, customer 403, seller 200 with own vendor only; renders real figures; 0 overflow |
| Settlements & payouts view (escrow settlements, payout history, open holds) | `/pay/business` settlements tab | same service | renders all three sections; honest empty states |
| Customer escrow protection dashboard (holds + event timelines) | `/pay/escrow` | `/api/wallet` escrowHolds incl. events | renders protected-total card + timeline; honest empty state |
| Control Center escrow tab (all holds + latest events, search/filter) | `/admin?module=pay&tab=escrow` | `/api/admin/escrow` (finance:read) | admin renders panel; anon 401 (verified pattern); honest 0-row state on this DB |
| Send Money screen (form → review → confirm, idempotency key, honest disabled result) | `/pay/send` | `/api/pay/transfers` (gated) | signed-in browser flow verified; confirm returns honest "not active yet", no fake success |
| Receive Money screen (payment handle, copy/share, coming states) | `/pay/receive` | `/api/auth/me`, `/api/wallet` | verified: handle shown, copy/share present, honest coming section |
| Scan & Pay (camera BarcodeDetector + manual entry + merchant verification honest state) | `/pay/scan` | none yet (merchant QR not issued) | verified: manual entry → honest "issuance not live", confirm disabled |
| Security screen (device sessions list + revoke, protection checklist, PIN pending) | `/pay/security` | `/api/account/sessions` (+`/[id]` DELETE) | scripts/sessions-api-test.mjs PASS: anon 401, one current flag, revoke-other 200, revoke-current 400, foreign 404 |
| Wallet history date filter + transaction receipt view | `/wallet` | `/api/wallet` | verified: range filter applies, receipt modal shows reference/type/ledger note |

## Implemented but blocked (built, honestly disabled)

| Workflow | Blocker (exact dependency) |
|---|---|
| Send money ACTIVATION (screen is live at /pay/send; posting disabled) | `ENABLE_P2P_TRANSFERS` env flag off by policy. Engine passes idempotency/concurrency/reconciliation tests on the TEST schema; activation additionally requires (a) owner authorisation, (b) a reconciliation pass over the shared development database — the SYSTEM wallet currently shows a −₦25,000 cached-vs-ledger delta that must be investigated first (visible in the admin Reconciliation tab), (c) transaction-PIN/auth requirement decision before real funds move. |
| Receive: personal QR + amount requests (handle/copy/share is live) | Server-generated signed payment identifiers + request tracking — designed, not yet built; activates with the transfers rollout. |
| Scan & Pay payment confirmation (screen + manual entry live) | Merchant QR issuance (merchant→payment-token mapping on the shared ledger) — not yet built. |
| Wallet top-up via card/bank | `PAYSTACK_SECRET_KEY` / `FLUTTERWAVE_SECRET_KEY` not present in this environment; `ENABLE_TEST_PAYMENTS` also unset. UI reports the honest unconfigured state. Note: current `Payment` model is order-scoped (`orderId` required) — standalone top-ups need a reviewed additive migration or a dedicated top-up record before provider keys alone suffice. |

## Not implemented (dependency noted)

| Workflow | Dependency |
|---|---|
| Bills, airtime, data, electricity, TV | No bill-payment provider integration exists anywhere in the codebase. Requires provider selection + credentials + agreement before any UI flow can be enabled. |
| Payment links | New `reference_type` vocabulary + public payment-link records; depends on Send/Receive design. Business dashboard shows the honest "Coming" state for QR/links/customers/settings tools. |
| Merchant QR payments | Merchant identifier issuance on the shared ledger. |
| Transaction PIN + security notifications (session/device controls are live at /pay/security) | Requires product decision on PIN storage (hashing scheme) and challenge flow; notification wiring depends on the Communication engine's outbound channel. |
| Financial Control Center beyond reconciliation | Payments/payouts/audit views already exist in the unified Control Center; provider status, refunds and risk views are future work under `finance:read`. |

## Standing constraints

- One wallet, one ledger, one Control Center — no NaijaPay-specific financial tables
  beyond additive, reviewed extensions.
- Live money movement stays impossible on TEST-classified databases
  (`lib/payments/boundary.ts`) regardless of UI.
- Push preservation requires GitHub credentials for `naijadeals001-hash` — the
  stored credential (`BetFuz`) is denied; local commits are the only backup until fixed.
