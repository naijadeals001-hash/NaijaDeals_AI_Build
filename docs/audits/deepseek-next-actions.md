# Recommended execution sequence (after the audit)

## 1. Phase status after verification

| Phase | Tracker status | Audit verdict |
| --- | --- | --- |
| 00 Verified baseline | PASS (documented) | Evidence partially re-verified: repo/branch/route inventory confirmed; the architecture doc's commit/stash claims are stale. No re-grading performed. |
| 01 Skills, tests, gates | BLOCKED | Tooling gate **now met**; CI-failing-check gate **blocked** (push 403); coverage baseline and regression suite still open |
| 02 Design system | NOT STARTED | Confirmed: `components/ui` has only `badge` + `states` |
| 03 Identity | NOT STARTED | Auth/register/login/session exist from earlier work; reset-token and MFA gates unmet |
| 04 Account center | NOT STARTED | `/account` exists; two-user isolation tests absent |
| 05 Control Center | IN PROGRESS (tracker) | Confirmed PARTIAL — 15 admin components + 29 QA checks pass; gaps listed in the admin audit |
| 06–18 | NOT STARTED | Code runs ahead of the tracker: 08/09/10 have real implementations marked PARTIAL above; 12–17 absent |
| 19–20 | NOT STARTED | Correctly gated on authorization |

## 2. Earliest executable work (in order)

1. **Finish Phase 01 evidence (local, no push needed)**
   - a. Write `docs/skills-selection.md`: domain → ECC/Soup-selected skill map for admin, account,
     UI/UX, backend, security, QA, Git (use the Soup MCP call already verified).
   - b. Run `npm run test:marketplace`, `test:admin-security`, `test:drive` against the local
     PostgreSQL test database and record exact pass/fail counts as the coverage baseline.
   - c. Add the disposable failing-check **locally** (a temp test + CI job run through
     `act` or a recorded CI run) — blocked until push/CI access is restored; keep as BLOCKED.
2. **Documentation reconciliation (safe now)** — update `architecture.md`,
   `requirements-matrix.md`, `functional-gap-report.md` to match verified code; correct stale
   commit/stash/CI claims; point to this audit.
3. **Phase 02A audit slice (design tokens)** — inventory tokens vs. rendered pages, contrast
   measurements on the four captured screens; no new UI.
4. **Phase 05 gap slice (no provider needed)** — module-specific tabs for the implemented modules
   (NaijaShop orders, NaijaDrive dispatch list, NaijaPay ledger) using real API data; keep the map
   placeholder honest.
5. **Phase 03 test design** — reset-token expiry/reuse cases and session revocation cases written
   before implementation; local test inbox blocked (no email provider).

## 3. Blocked

| Blocker | Impact | Unblock |
| --- | --- | --- |
| GitHub push `403` (credential for `BetFuz`) | CI-failing-check gate, phase commits | Authenticate `gh` or supply an authorised token |
| No email/SMS provider | Phase 03 reset-delivery evidence, Phase 11 | Provide a provider or a local capture workflow |
| No live map/geolocation provider | Phase 05 live map, Phase 09 dispatch | Choose a provider (free tier) or keep the honest placeholder |
| No genuine Uber/Bolt APK, no device | Android reference parity | Supply an APK and/or an emulator |
| No image-generation endpoint | Phase 02 imagery | Verify DeepSeek image endpoint or adopt an open-source generator |

## 4. Definition of done for the next slice

Phase 01 is PASS only when: skills load and the map is recorded; the disposable failing check is
detected by CI and removed; final checks pass or baseline failures are separated explicitly; and
the evidence is committed. Push availability is a hard prerequisite for the CI half of that gate.
