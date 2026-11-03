# Complete file audit — DeepSeek pass 1 (2026-11-03)

## Method

1. Recursive walk of `C:\\Users\\User\\Documents\\naijadeals.com` excluding `.git`,
   `node_modules`, every `.next*` build directory, `test-results` and `.turbo`.
2. Every remaining regular file was recorded with path, extension, byte size, category.
3. Every text/source file under 400 KB (ts, tsx, mjs, cjs, js, json, yml, css, prisma, sql, md)
   was **opened and read in full**, hashed (SHA-256, first 16 hex), and machine-extracted for:
   route, client flag, imports, exports, quality flags, URLs, Prisma model usage.
4. Binary files were classified by type and purpose; the admin reference PNG was opened visually.
   No binary was dumped as text.
5. Machine manifests (committed):
   - `docs/audits/deepseek-file-manifest.json` — one row per file: status + reason.
   - `docs/audits/source-facts.json` — per-file facts for every inspected source file.

## Coverage

| Metric | Value |
| --- | --- |
| Files in scope (excl. .git, node_modules, .next*) | **664** |
| Full-text inspected | **279** (42,308 lines) |
| Metadata/visual inspection | **349** (images, assets, binaries, design refs) |
| Excluded with reason | **36** (generated logs, locks, build metadata, QA captures, REA bundle) |
| Unread / unknown | **0** in scope |

Playbook: `docs/NaijaDeals_Phased_Build_Playbook.md`, 2,462 lines, 118,365 bytes,
SHA-256 prefix `a51d89e1e76be5b1` — read in full across four passes.

## What the repository contains (by directory)

| Directory | Inspected files | Purpose |
| --- | --- | --- |
| `app/` | 99 | 25 pages (incl. 3 dynamic) and 70 API route handlers |
| `lib/` | 56 | auth, services (core + legacy stubs), payments, i18n, data, admin |
| `components/` | 39 | functional dashboards, commerce UI, shell, sections, ui primitives |
| `docs/` | 23 (+13 root md) | architecture, requirements, decisions, tracker, handoff, playbook, audits |
| `scripts/` | 25 | seed/QA/test runners, asset generation, admin fixtures |
| `prisma/` | 7 | 815-line schema (39 models, 19 enums), 5 migrations, seed |
| `.` root | 24 | AGENTS.md, README, configs, env examples, summaries |
| `.opencode/skills` | 4 | project skills (admin-demo, user-demo, reference-research, workflow) |
| `.github/` | 1 | single CI workflow (type-check, lint, build, tests, Docker) |
| `.claude/` | 1 | local settings only (no repo source) |

Binary/assets: 43 public images (6.9 MB), 7 design references (6.5 MB), plus generated QA
screenshots and logs (excluded).

## Exclusions (36) and reasons

| Pattern | Count | Reason |
| --- | --- | --- |
| `qa-artifacts/**` | 20+ | Generated screenshots and logs from prior QA runs |
| `*.log` | 10 | Runtime logs (dev/QA) |
| `rea-evidence` | 1 | 17 MB generated REA evidence bundle |
| `package-lock.json`, `tsconfig.tsbuildinfo` | 2 | Lock/build metadata |
| `*.txt` schema dumps | 6 | Generated schema extracts |

## Quality flags found by full-text scan

| Flag | Count | Notes |
| --- | --- | --- |
| `TODO` | 11 | 10 are legacy `lib/services/*-service.ts` stubs; 1 in an auth stub |
| `placeholder` | 15 | Mostly HTML input placeholders (benign); `lib/services/index.ts` re-exports stub layer |
| `mock` | 5 | Docs and admin analytics TODO; no mock data served by API |
| `fake` | 7 | Docs only (decision log, playbook) — no fake runtime data found |
| `coming-soon` | 1 | `scripts/marketplace-tests.ts` string |
| hardcoded `localhost` | 32 | QA scripts and test fixtures, not app runtime |

## Key structural findings

1. **Two service layers.** `lib/services/core/*` (20 files) contains the real Prisma-backed
   services; `lib/services/*-service.ts` (10 files) are TODO stubs re-exported only by
   `lib/services/index.ts`, which no application file imports. This is dead API surface and a
   misleading signal to future contributors.
2. **39 Prisma models / 19 enums / 5 migrations** exist; there is no `Restaurant`, `MenuItem`,
   `Property`, `Stay`, `Gig`, `Stream`, or `AI` model. Those verticals are page-level only.
3. **25 pages**: 10 vertical/feature pages are real; `naijafresh`, `naijagigs`, `naijastay`,
   `naijastream`, `aura-ai` have **no page file** and fall through to `app/[slug]` →
   `GenericPage` (informational), while `lib/data/ecosystem.ts` marks them "Setup required".
4. **70 API routes** cover auth, catalog/cart/checkout/orders, payments/webhooks, wallet,
   drive, deliveries, courier, seller, admin and super-admin.
5. Docs are partly stale (see architecture audit): status contradictions between
   `requirements-matrix.md`, `functional-gap-report.md` and the actual code.
