# NaijaPay implementation status

Living register of what is implemented, verified, blocked or not implemented, with
the exact dependency blocking each unfinished payment workflow.

**Readiness is reported in the five categories the build directive asks for:**

1. **Implemented** — code exists and runs.
2. **Tested locally** — exercised by a script here, with recorded results.
3. **Verified with provider sandbox** — confirmed against a real provider.
4. **Ready for production activation** — every gate met for a live switch.
5. **Blocked** — with the exact missing dependency.

| Capability | 1 | 2 | 3 | 4 | Blocker / evidence |
|---|---|---|---|---|---|
| Reconciliation report (dual-book) | Yes | Yes | n/a | n/a | `scripts/naijapay-reconcile.cjs` |
| Correction preview + isolated verification | Yes | Yes | n/a | — | `naijapay-correction-preview.cjs`, `naijapay-correction-isolated-verify.cjs`. **Not applied** — shared data untouched pending approval |
| Add Money — local test provider | Yes | Yes | n/a | **No** | Test money only; never available on a LIVE database |
| Add Money — Paystack / Flutterwave | Partial (adapter + status only) | No | **No** | **No** | **Blocked:** `PAYSTACK_SECRET_KEY` / `FLUTTERWAVE_SECRET_KEY` absent |
| Internal P2P transfers | Yes | Yes | n/a | **No** | Needs owner sign-off for real funds |
| Escrow: order holds (buyer → vendor) | Yes | Yes | n/a | **No** | Same launch decision |
| Escrow: milestones (customer → customer) | Yes | Yes | n/a | **No** | Same launch decision |
| Dispute resolution (administrator) | Yes | Yes | n/a | **No** | Requires `finance:escrow:settle` |
| Offline outbox | Yes | Yes | n/a | — | Client-side; server idempotency underpins it |
| Control Center — NaijaPay controls | Yes | Yes | n/a | n/a | `finance:read` / `finance:escrow:settle` |
| Payment links / merchant QR | **No** | No | No | No | **Blocked:** not built — see below |
| Bills, airtime, data, electricity, TV | **No** | No | No | No | **Blocked:** no provider selected or contracted |
| Bank withdrawals | Partial (existing payout path) | No | No | No | **Blocked:** no payout credentials |
| AI assistant financial tools | **No** | No | No | No | **Blocked:** no AI provider configured |

## Changed in this increment

- **Reconciliation** reproduced and re-interpreted: 184 wallets, 182 reconciled,
  2 exceptions, journal difference ₦24,560 fully offset in the equity book. Two
  earlier "exceptions" were healthy wallets with open escrow.
- **Correction path** prepared and proven on an isolated copy; not applied.
- **Transfers enabled** for development. The database is classified TEST and the
  payment boundary blocks live money independently of the flag.
- **Add Money** built end to end with a new additive `WalletTopUp` model.
- **Milestone escrow** built with enforced transitions and permissions.
- **Offline outbox** built with a stable idempotency key and account isolation.
- **Control Center** NaijaPay tab: provider status, journal integrity, dispute
  settlement with a recorded reason.

## Defects found and fixed by these tests

| Defect | Where | Effect if shipped |
|---|---|---|
| Commission credited back to the seller in the journal | `order.service.ts` | Seller's stored balance short by the commission |
| Top-up debited the platform in the journal only | `topup.service.ts` | Platform overstates funds by every top-up it funds |
| Escrow release credited the platform in the journal only | `order.service.ts` | Stored funds and journal drift apart |
| Milestone funding credited the payee **and** held the payer's money | `milestone.service.ts` | Journal double-counts every release |
| A payer could release a disputed milestone | `milestone.service.ts` | Disputes become advisory, not binding |
| `/api/pay/topups` 500'd once any top-up existed | `app/api/pay/topups/route.ts` | Add Money breaks after first use |
| Incoming transfers invisible to recipients | `wallet.service.ts` | Recipients see money with no record of it |
| Outbox prune deleted other accounts' intents | `lib/pay/outbox.ts` | One sign-in could erase another user's queued payments |
| Admin panel unreadable (light tokens in dark UI) | `admin-naijapay-panel.tsx` | Contrast failure in the Control Center |

## Not implemented, with dependencies

**Payment links and merchant QR.** These need a public identifier that resolves to
a payee without exposing wallet or account data, plus a signed single-use token
for amount requests. Deliberately a separate slice: it adds a public surface with
its own expiry and duplicate-protection rules, and scanning or opening a link
must never itself authorize payment — the payer still confirms on a
server-validated screen.

**Bills, airtime, data, electricity, TV.** No provider is selected. Choosing one
requires comparing Nigeria-first coverage, customer/meter validation, delivery
status, reversal behaviour, test access and pricing. Writing an adapter before
choosing would mean guessing at another company's contract.

**AI assistant.** No AI provider is configured for financial tooling. The
assistant needs permissioned, read-only tools that explain the caller's own
transactions and draft — never send — payments.

**Bank withdrawals.** The payout path exists but needs provider credentials.

## Verification commands

```
node scripts/naijapay-acceptance.cjs     # all suites, prints a summary
node scripts/naijapay-reconcile.cjs      # current ledger position (read-only)
node scripts/naijapay-correction-preview.cjs --markdown
```

Last full run: 14/14 suites passed (see `qa-artifacts/naijapay-acceptance.json`).

## Standing constraints

- One wallet, one ledger, one Control Center. The only new financial tables are
  `WalletTopUp` and `EscrowMilestone`; both are additive and both settle through
  `postBalancedTransaction`.
- Live money movement is impossible on a TEST-classified database regardless of
  UI or flags.
- Milestone holds are wallet holds — not provider-held or regulated escrow.
- Push preservation needs GitHub credentials for `naijadeals001-hash`; the stored
  credential is denied. Local commits are the only backup until that is fixed.
