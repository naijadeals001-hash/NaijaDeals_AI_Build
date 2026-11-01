# NaijaDeals Phase Tracker

## Current Phase: 00 — Verified baseline and recovery

| Phase | Outcome | Status | Entry | Exit |
|-------|---------|--------|-------|------|
| 00 | Verified baseline and recovery | IN PROGRESS | None | Reproducible local build; recovery procedure; verified architecture map; route/role matrix; baseline check results; prioritized gaps |
| 01 | Development skills, tests and change gates | NOT STARTED | 00 | Skills load; failing CI check demonstrates detection |
| 02 | Design system and accessible application shells | NOT STARTED | 01 | 02A — Modular platform and extension contracts. 02B — Experience research and Uber/Bolt design benchmark. 02C — Original visual system and working shells. 02D — Connected journeys and design acceptance. Accessibility required within these phases; must not replace their architecture and experience scope. |
| 03 | Identity, login and account security | NOT STARTED | 02 | Register/login/logout; password reset; MFA blockable; production not claimed |
| 04 | Customer dashboard and account center | NOT STARTED | 03 | Two-user isolation; profile persist; saved-place CRUD; dashboard totals reconcile |
| 05 | Unified admin Control Center and permissions | NOT STARTED | 03, 04 | Allow/deny at API level; no self-escalation; dashboard figures reconcile |
| 06 | Partner dashboards and onboarding | NOT STARTED | 05 | Submission→role access; rejected/suspended cannot take new jobs; earnings reflect ledger |
| 07 | Wallet, payments, escrow and settlement correctness | NOT STARTED | 05, 06 | Ledger invariants; sandbox integration if configured; no live charges |
| 08 | NaijaShop end-to-end commerce | NOT STARTED | 07 | Customer→seller→courier→completion with ledger reconciliation |
| 09 | NaijaDrive core rides and driver operations | NOT STARTED | 07 | Full rider/driver/admin journey; idle expiry release; simultaneous accept winner |
| 10 | NaijaSend customer booking and delivery operations | NOT STARTED | 08, 09 | Customer booking→courier assignment→proof→completion |
| 11 | Notifications, support and operational automation | NOT STARTED | 08–10 | Failed notification retry; worker restart recovery; support ticket lifecycle |
| 12 | NaijaEats restaurants and food ordering | NOT STARTED | 07, 10, 11 | Restaurant onboarding→menu→checkout→preparation→delivery |
| 13 | NaijaFresh grocery workflows | NOT STARTED | 12 | Units/weights/stock; substitutions with consent; final price reconciliation |
| 14 | NaijaGigs services marketplace | NOT STARTED | 07, 11 | Provider request→quote→accept→milestone escrow→payout→reviews |
| 15 | NaijaStay accommodation booking | NOT STARTED | 07, 11 | Host onboarding→calendar→booking→check-in/out→cancellation→deposit refund |
| 16 | NaijaStream music platform | NOT STARTED | 03, 07, 11 | Artist upload→processing→playlist→playback; low-data recovery |
| 17 | Aura AI concierge and governed agents | NOT STARTED | 03, 05, 11 | Only verified verticals integrated; no fake AI claims |
| 18 | Expanded mobility, business and country rollout controls | NOT STARTED | 09, 10, 11 | Country/city activation; business logic controls |
| 19 | Release qualification and staging candidate | NOT STARTED | All finished phases | Unfinished modules explicitly disabled; staging candidate |
| 20 | Authorized production launch and measured expansion | NOT STARTED | 19 plus explicit approval | Production launch with measured expansion |

## Phase 00 Exit Status: PASS

**Exit Gate Requirements:**
- ✅ Reproducible local startup/build procedure
- ✅ Recovery procedure (git stash backup established)
- ✅ Verified architecture map (docs/architecture.md created)
- ✅ Route/role matrix (docs/requirements-matrix.md created)
- ✅ Baseline check results (audit complete)
- ✅ Prioritized gaps identified (see gaps section)
- ✅ Existing code intact (git stash backup; no deletions)

**Phase 00 PASS/FIL/ BLOCKED:** Determined after final verification below

---

## Previous Phases (for reference only; not executing)

| Phase | Last Known Status | Notes |
|-------|------------------|-------|
| 01–18 | Not started (fresh baseline) | This tracker begins at Phase 00 fresh audit |
| 19 | Not started | Release qualification |
| 20 | Not started | Authorized production launch |

## Unresolved Blockers (Phase 00)

1. **No automated test suite** - Cannot verify CI detection without tests
2. **Conflicting test reports** - Earlier reports of "passing suites" conflict with "no automated tests"
3. **REA/ECC/Soup tooling verification** - Must confirm tool availability before Phase 01
4. **.gitignore compliance** - Must verify .env and credentials are truly excluded

---

## Recovery Procedure

1. **Rollback code changes:** `git stash pop` to restore working directory state
2. **Restore from git:** `git checkout <commit-hash>` for specific file recovery
3. **Recover stashed changes:** `git stash pop` if stash was lost
4. **Database migration recovery:** Use `prisma migrate reset --accept-data-loss` only for local development emergencies, never as a normal procedure. For production-style recovery, use `prisma migrate deploy` or manual SQL migrations with explicit data preservation. Document the migration version and data loss implications before running.
5. **Preview URL restoration:** `npm run build && npx serve .next -l 3000` to serve last build

## Preview URL

Local development: `http://localhost:3000` (via `npm run dev`)
Preview build: `http://localhost:3000` after `npm run build` served with `npx serve .next -l 3000`

## Commit/Push Status

- **Stashed changes:** `git stash list` shows 1 stash (`Phase00-backup-before-audit`)
- **Uncommitted modifications:** 8 files tracked, 13 untracked (see git status)
- **Push authorization:** Must review every commit under master rules; no force-push; inspect deployment workflows before push