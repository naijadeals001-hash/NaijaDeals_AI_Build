# Requirements gap analysis — new requirements vs the playbook

The playbook already names almost every requirement in the V3 directive, but many appear only as
narrative tables (Parts H–L, V3 §3/§9/§13) **without a canonical phase, acceptance criteria or
test gate**. Those are the real gaps.

## 1. Coverage map

| Requirement | Where the playbook mentions it | Canonical phase | Gap |
| --- | --- | --- | --- |
| Pan-African Discovery Engine | V3 §9, Part M-04 | **none** | Unassigned; no ingestion service, no source registry |
| Authorized product / wholesale ingestion | V3 §9 | **none** | No workers, no source permissions model |
| External seller redirects | V3 §9 policy | **none** | No outbound listing model |
| NaijaProperty | V3 §3, Part F | **none** | No model/route; Phase 15 is Stay only |
| NaijaStay workflows | Phase 15 (prompt) | 15 | Covered, not started |
| Multi-provider African payments | Part I, V3 §10, Phase 07 | 07 | Adapters exist (Paystack/Flutterwave/wallet); no provider onboarding, no sandbox credentials |
| NaijaID identity and trust | Part H table | **none** | Identity exists inside `User`/`Session`; no verification/KYC subsystem |
| Universal search (NaijaSearch) | Part H table | **none** | Only per-page search/filter |
| Notifications (NaijaNotify) | Phase 11 | 11 | No outbox/queue/email provider yet |
| Messaging (NaijaConnect) | Part H table | **none** | No thread/message model |
| Partner onboarding | Phase 06 | 06 | Seller applications exist; driver/courier onboarding partial |
| Business portals | Phase 06, 18E | 06/18 | `/business/[vertical]` is informational |
| Advertising (NaijaAds) | Part H table | **none** | No campaign/placement model |
| Rewards (NaijaRewards) | Part H table | **none** | None |
| Fraud prevention (NaijaTrust) | Part J, V3 §11 | cross-cutting | No risk engine, no rules/events |
| Customer support | Phase 11 | 11 | No ticket model or UI |
| Analytics (NaijaInsights) | Part L, V3 §12 | **none** | Admin aggregates only |
| Developer APIs (NaijaAPI) | Part H table | **none** | No API keys/webhooks/versioning |
| AI-powered operations | Phase 17 | 17 | Not started; key present, no route |
| Country activation | Phase 18F | 18 | Migration adds region scope; no activation UI/workflow |
| Low-data support | Part L, V3 §16 | cross-cutting | No budget, no measurement |
| Native Android/iOS apps | V3 §5 | **none** | No mobile project; PWA also missing manifest/service worker |
| Original imagery pipeline | Phase 02, V3 §14 | 02 | Images exist; provenance/licensing unrecorded |
| Reference reconstruction fidelity (95%) | Standard, V3 §2.4 | cross-cutting | No measured comparisons stored |
| Unified Control Center | Phase 05 | 05 | See admin audit |

## 2. Missing from the playbook (not merely unassigned)

1. **NaijaProperty has no phase or acceptance criteria** — only a module description.
2. **Native mobile has no phase**; V3 §5 requires Android/iOS but no prompt defines entry/exit
   gates, and the current repo has no mobile project.
3. **PWA installability** is required but no phase acceptance mentions manifest, service worker,
   offline behaviour or install prompt testing.
4. **Developer platform** (API keys, versioning, webhooks) is a table row only.
5. **Account deletion / data export** (V3 §11) appears once, with no phase or data-retention rule.
6. **MFA for privileged users** is required by Part J but Phase 03 marks it "if feasible";
   no exit criterion.
7. **Screenshot-regression baseline** is required (V3 §17) but no tool/baseline exists.
8. **NaijaConnect messaging** has no contract, safety policy or moderation requirement.

## 3. Recommended placement (no renumbering of 00–20)

Append new phases after 20 and keep them independently releasable. Existing phases get
sub-increments, not new numbers.

| Proposal | Scope | Depends on |
| --- | --- | --- |
| **Phase 21 — Pan-African Discovery and external listings** | source registry, permitted ingestion (official APIs/licensed feeds first), provenance, dedup, freshness, external redirect policy, moderation | 05, 06, 08 |
| **Phase 22 — NaijaProperty** | sale/rental listings, land, agents, viewings, document verification workflow, duplicate/fraud checks | 15, 21 |
| **Phase 23 — Shared platform services** | NaijaID verification, NaijaSearch index, NaijaNotify outbox, NaijaConnect messaging, NaijaTrust rules, NaijaAds, NaijaRewards, NaijaInsights, NaijaAPI keys/webhooks | 03, 05, 07, 11 |
| **Phase 24 — Native mobile and PWA** | PWA manifest/service worker/offline; React Native (Expo) customer app; driver/courier app; shared auth/deep links/push | 02, 03, 18 |
| **Cross-cutting (all phases)** | MFA, rate limiting, observability, feature flags, screenshot regression, account deletion/export, low-data budgets | — |

## 4. What this means for execution

- The **earliest incomplete canonical phase is 01**; it is BLOCKED on CI-run evidence and a
  failing-check demonstration that need a push.
- While 01 is blocked, the safe independent work is: documentation reconciliation (this audit),
  Phase 02A design-token audit, Phase 03 auth test design, and Phase 05 admin gap slices that do
  not require a live map or provider credentials.
- Discovery/Property/mobile work must **not** start before their dependency phases; they are
  planned, not actionable today.
