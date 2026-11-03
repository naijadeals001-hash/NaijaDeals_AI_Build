# Playbook phase inventory (audited)

Source: `docs/NaijaDeals_Phased_Build_Playbook.md` — **2,462 lines, 118,365 bytes**, read end to end
on 2026-11-03 (SHA-256 recorded in `deepseek-file-inventory.md`).

The file contains **two numbering schemes**:

1. **Canonical phase map** (lines ~206–231) and its copy-and-paste prompts: **21 phases, 00–20**.
2. **Part M proposed workstreams** (lines ~1439–1467): **10 workstreams** explicitly labelled
   "proposed workstreams, not replacements for existing completed phases". They must not be
   renumbered into the canonical list; they are a cross-reference.

## 1. Canonical phases (21)

| # | Title | Prereq. | Exit gate (verbatim intent) |
| --- | --- | --- | --- |
| 00 | Verified baseline and recovery | — | Reproducible startup/build, recovery procedure, architecture map, route/role matrix, baseline results, prioritised gaps |
| 01 | Development skills, tests and change gates | 00 | Skills load; tooling evidence; deliberately failing disposable CI check detected then removed; final checks pass |
| 02 | Design system and accessible application shells | 01 | Real components used; keyboard/focus/dialog and mobile layouts checked; no overflow; no fake metrics; screenshots + provenance |
| 03 | Identity, login and account security | 02 | Valid/invalid login, logout invalidation, expired/reused reset token, password change, revocation, unauthorized role access, accessible forms; local reset inbox |
| 04 | Customer dashboard and account center | 03 | Two-user isolation; profile persists; saved-place CRUD; totals reconcile; all actions function; no data leak |
| 05 | Unified admin Control Center and permissions | 03, 04 | Allow/deny and cross-region API tests; no self-escalation; figures reconcile; pagination/filter/bulk error paths; audit events; smaller-screen usability |
| 06 | Partner dashboards and onboarding | 05 | Application → approval → role access; rejected/suspended cannot take jobs; scoped work; earnings from ledger |
| 07 | Wallet, payments, escrow and settlement correctness | 05, 06 | Ledger conservation, idempotency, insufficient funds, duplicate callbacks, refunds, payouts; no live charges |
| 08 | NaijaShop end-to-end commerce | 07 | Full customer→seller→courier→completion with ledger; oversell/duplicate/unauthorized/return/refund cases |
| 09 | NaijaDrive core rides and driver operations | 07 | Full rider/driver/admin journey; idle release without reads; one winner on simultaneous accept; reconciliation |
| 10 | NaijaSend customer booking and delivery operations | 08, 09 | Booking→assignment→pickup→proof→completion; invalid proof/duplicate/failure/cancellation paths; scoped tracking |
| 11 | Notifications, support and operational automation | 08–10 | Retry without duplicate effects; restart recovery; preferences; ticket open→assign→reply→resolve |
| 12 | NaijaEats restaurants and food ordering | 07, 10, 11 | Full flow; closed/out-of-stock fails safely; rejection/cancellation reconcile; prep ≠ courier trip |
| 13 | NaijaFresh grocery workflows | 12 | Substitution approval, unavailable items, quantity changes, final reconciliation; no oversell |
| 14 | NaijaGigs services marketplace | 07, 11 | Request→quote→completion→payout; unauthorized acceptance, duplicate milestone, dispute hold, refund |
| 15 | NaijaStay accommodation booking | 07, 11 | Concurrent overlapping bookings yield one reservation; time zones; expiry; cancellation/deposit caps |
| 16 | NaijaStream music platform | 03, 07, 11 | Upload→processing→playback; corrupt files fail; playlist ownership; low-bandwidth recovery; royalties gated |
| 17 | Aura AI concierge and governed agents | 03, 05, 11 | Cross-user/prompt-injection safe; grounded answers; no permission bypass; idempotent confirmed action; outage fallback |
| 18 | Expanded mobility, business and country rollout controls | 09, 10, 11 | Six subincrements (below) independently tested; no overbooking; demo hardware never production |
| 19 | Release qualification and staging candidate | included phases | Release checklist with commits/evidence/blockers; backup restore and migration rehearsal; staging labelled unverified |
| 20 | Authorized production launch and measured expansion | 19 + approval | Recorded approval; deployed artifact matches; production evidence separate; rollback triggers documented |

## 2. Subphases in force

Defined by `AGENTS.md` rule 23 and playbook Phase 18:

| Subphase | Scope | Parent |
| --- | --- | --- |
| 02A | Accessible colour and typography tokens | 02 |
| 02B | Responsive component layout and keyboard navigation | 02 |
| 02C | ARIA label and contrast audit | 02 |
| 02D | Screen-reader flow validation across breakouts | 02 |
| 18A | Scheduled / airport / accessible services | 18 |
| 18B | Pooled rides and cab sharing | 18 |
| 18C | Micromobility reservations/unlock/return | 18 |
| 18D | Car-share identity, reservation, billing, return | 18 |
| 18E | Company groups, employee permissions, consolidated billing | 18 |
| 18F | Country/city configuration and staged activation | 18 |

The playbook itself does not define other subphases; the prompts above are the only
additional granularity.

## 3. Part M cross-reference (10 proposed workstreams, not replacements)

| Part M | Proposed title | Maps to canonical |
| --- | --- | --- |
| 00 | Verified baseline and recovery | 00 |
| 01 | REA, ECC, Soup, MCP and skills readiness | 01 |
| 02 | Unified Control Center visual and functional integration | 05 (and 02) |
| 03 | Responsive website, PWA and mobile foundation | 02/03 + V3 §5 (no canonical native-app phase) |
| 04 | Pan-African Discovery Engine | unassigned — needs placement (see gap analysis) |
| 05 | NaijaShop, NaijaProperty and NaijaStay integration | 08, 15 (+Property unassigned) |
| 06 | NaijaDrive, NaijaSend, NaijaEats and NaijaFresh workflows | 09, 10, 12, 13 |
| 07 | NaijaPay, trust, settlement and automation | 07, 11 |
| 08 | NaijaGigs, NaijaStream and Aura AI | 14, 16, 17 |
| 09 | Android/iOS apps, driver/courier app and country expansion | 18 (partly) — native apps unassigned |
| 10 | Security, performance, disaster recovery and production readiness | 19, 20 (cross-cutting) |

## 4. Reconciliation result

- **Canonical count:** 21 phases (00–20); **subphases:** 10 (02A–D, 18A–F).
- **Part M:** 10 proposed workstreams that must be cross-referenced, never renumbered.
- `docs/reconciled-phase-mapping.md` already states the table is authoritative and Part M is
  advisory — consistent with this audit — but its line references ("line 37", "line 1188") are
  stale: the table is at line ~208 and Part M at ~1439.
- No phase has been renumbered by this audit. No phase status was upgraded.
- `docs/phase-tracker.md` currently tracks only Phases 00–01 in detail and labels Phase 02 as
  NOT STARTED; the playbook's 21-phase structure is not fully represented there.
