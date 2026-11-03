# Skill selection by domain (Phase 01 evidence)

Method: each domain was sent to the local Soup MCP router
(naijadeals-soup -> recommend_ecc_skills) on 2026-11-03; the router runs BM25 over the
installed ECC skill directory (~/.claude/skills) and returns selected names plus instruction
bodies. Where the router returned nothing, a manual fallback picked the closest installed ECC
skills — marked **(manual)** so it is not confused with router output.

| Domain | Soup-selected | Manual fallback (installed but not routed) |
| --- | --- | --- |
| Admin dashboard | backend-patterns, error-handling, coding-standards | design-system |
| Account dashboard | backend-patterns, error-handling | frontend-patterns |
| UI/UX + accessibility | — (router gap) | accessibility, frontend-a11y, frontend-design-direction, design-system |
| Backend/API | backend-patterns, api-design, error-handling, frontend-patterns, coding-standards | — |
| Security review | api-design, coding-standards, backend-patterns, frontend-patterns | — |
| QA/testing | — (router gap) | e2e-testing, browser-qa, ai-regression-testing, react-testing |
| Git/delivery | — (router gap) | git-workflow, flutter-dart-code-review (review checklist) |

## Router limitation (recorded, not hidden)

The router source defines ROUTES for **python, react, security, api** only. Queries outside
those keyword groups return an empty selection even though ECC ships relevant skills. This is why
UI/UX, QA and Git show manual fallbacks. Fixing the router is a NaijaDeals-Lab change, outside
this repository; it is logged as a tooling gap rather than patched silently.

## Usage rule for this repository

1. Call Soup first with the task description.
2. If Soup returns nothing, apply the manual fallback for that domain from the table above.
3. Record in the handoff which skills actually informed the change.
