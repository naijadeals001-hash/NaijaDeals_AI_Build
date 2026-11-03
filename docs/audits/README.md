# NaijaDeals audit deliverables

Updated: 2026-11-03. Workspace: `C:\Users\User\Documents\naijadeals.com`.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 00–05 | PASS | `docs/phase-tracker.md`; admin suite 19/19 |
| 06 — partner dashboards/onboarding | PASS | rejection chain, suspension, active-job rule, notifications; `scripts/partner-lifecycle-tests.mjs` 9/9 |
| 07 — wallet/payments/escrow | **IN PROGRESS** | `docs/audits/phase07-ledger-audit.md`; ledger, refund and webhook suites pass locally; reconciliation backfill, provider sandbox delivery and GitHub preservation open |
| 08+ | not started | — |

NaijaEats (Phase 12 scope) has a bounded, tested increment: restaurant onboarding, menu publishing, wallet-paid ordering and kitchen-to-courier dispatch (commits `6904434`…`e1c0ea9`).

## Audit documents

- `phase07-ledger-audit.md` — ledger invariants, payout/refund fixes, reconciliation finding.
- Other audit files in this directory cover the earlier repository, accessibility and module audits.

## Reproduce the Phase 07 evidence

```powershell
$env:DATABASE_URL = "<test database URL>"
$env:ENABLE_TEST_PAYMENTS = "true"
npx tsx scripts/phase07-ledger-tests.ts
npx tsx scripts/phase07-partial-refund-tests.ts
npx tsx scripts/phase07-wallet-refund-tests.ts
npx tsx scripts/phase07-webhook-tests.ts
npx tsx scripts/phase07-reconciliation.ts
npx tsx scripts/phase07-backfill-preview.ts   # dry run only, writes nothing
```

## Current blockers

1. **Reconciliation backfill** — 3 of 37 wallets differ from their ledger net; a reviewed backfill (and a decision on the counter-account) is required. No history was rewritten.
2. **Provider sandbox delivery** — no live Paystack/Flutterwave credentials; signature verification is covered synthetically.
3. **Refund fee policy** — recorded in `docs/decisions.md`; the 1% policy is unverified and unchanged.
4. **GitHub preservation** — resolved: authorized token pushed `naijashop-marketplace`; remote verified at `c576e56c9d2fa3807086630484abfa2a3f9fa76c` (commit above is the pre-doc head).

## Runtime

Preview: `http://localhost:3000` (`/naijaeats`, `/naijashop`, `/naijasend`, `/naijadrive` verified 200; partner/admin routes redirect to sign-in). No deployment was performed.
