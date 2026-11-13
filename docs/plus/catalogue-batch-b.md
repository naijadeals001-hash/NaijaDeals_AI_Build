# NaijaShop catalogue batch B and REVIEW residue audit

Executed 2026-11-13 against the canonical REVIEW preview. This record covers
admin/data work only; no application code, schema, migration, payment service or
batch A record was edited.

- Repository: `C:\Users\User\Documents\naijadeals.com`
- Source HEAD: `3de3d70` (batch A commit on `ba30771`); this batch adds two
  scripts and this document in the working tree
- Preview: `http://localhost:3047`, served build `0DLHlGYoId2XSLKSwcsLZ`
  (`NEXT_DIST_DIR=.next-programme`, review indicator present)
- Database: `naijadeals_review` (`DatabaseClassification: default=REVIEW`),
  verified with an explicit `REVIEW_DATABASE_URL` plus
  `--expect-db=naijadeals_review`
- Publication path: existing `POST /api/admin/catalogue/products` →
  `PATCH { action: "validate" }` → `PATCH { action: "publish" }`
- Scripts: `scripts/review-catalogue-batch-b.cjs`,
  `scripts/review-catalogue-residue-audit.ts`
- Evidence (git-ignored QA artifacts):
  - `qa-artifacts/review-basket/catalogue-batch-b-creation.json` (creation run)
  - `qa-artifacts/review-basket/catalogue-batch-b.json` (idempotency re-run)
  - `qa-artifacts/review-basket/catalogue-residue-audit.json` (read-only audit)
  - `qa-artifacts/review-basket/residue-audit-run.log`

No deletion, deactivation, image generation, image spend, provider call,
restart, deployment or push occurred. The credential at
`qa-artifacts/review-basket/.admin-credential` was read by the scripts and was
never printed.

## 1. Result

| Measure | Before | After |
|---|---:|---:|
| Active departments | 9 | 9 |
| Active products | 37 | 41 |
| New products created and published | — | 4 |
| Non-ACTIVE batch B rows | — | 0 |
| Duplicate slugs or reused batch images | — | 0 |
| Groceries & Household Essentials products | 4 | 8 |

All four rows are `ACTIVE`, `isDemo=true`, `isSample=false`, `countryCode=NG`,
currency `NGN`, stock quantity `25` with `0` reserved, exactly one image, and
the demonstration moderation note `DEMO — demonstration inventory, not live
supply`.

## 2. Created products

| # | Product id | Name | Slug | Price (kobo) | Price (NGN) | Image | Image alt |
|---:|---|---|---|---:|---:|---|---|
| 1 | `cmwf116ps00b8v4awo58tomzh` | DEMO — Fresh cabbage, 1 head | `demo-fresh-cabbage-1-head` | 150000 | ₦1,500 | `/generated/fresh/prod-cabbage.webp` | Fresh green cabbage heads stacked in a woven market basket |
| 2 | `cmwf116qw00bmv4awz8f2ijmd` | DEMO — Fresh carrots, 1kg | `demo-fresh-carrots-1kg` | 120000 | ₦1,200 | `/generated/fresh/prod-carrots.webp` | Bunch of fresh orange carrots with leafy green tops tied together on a wooden surface |
| 3 | `cmwf116rz00c0v4awo0l7hfo9` | DEMO — Fresh cucumbers, 1kg | `demo-fresh-cucumbers-1kg` | 100000 | ₦1,000 | `/generated/fresh/prod-cucumber.webp` | Fresh dark green cucumbers with water droplets piled in a woven basket |
| 4 | `cmwf116sy00cev4awcywzzy68` | DEMO — Apple mangoes, 1kg | `demo-apple-mangoes-1kg` | 250000 | ₦2,500 | `/generated/fresh/prod-apple-mangoes.webp` | Ripe apple mangoes with red and green skin heaped in a wooden crate |

Department for every row: `groceries-household` — “Groceries & Household
Essentials”.

### Exact descriptions

- **Cabbage:** “Demonstration listing. Whole green cabbage heads shown in a woven market basket. Illustrative grade: market-grade produce. Illustrative pack: one head, approximately 1 kg. Actual head size, leaf condition and availability are not represented by this DEMO listing.”
- **Carrots:** “Demonstration listing. Fresh orange carrots with leafy green tops tied in a bunch on a wooden surface. Illustrative grade: market-grade produce. Illustrative pack: 1 kg. Root size, bunch weight and availability are not represented by this DEMO listing.”
- **Cucumbers:** “Demonstration listing. Fresh dark green cucumbers with water droplets shown in a woven basket. Illustrative grade: market-grade produce. Illustrative pack: 1 kg. Individual size, variety and availability are not represented by this DEMO listing.”
- **Apple mangoes:** “Demonstration listing. Ripe apple mangoes with red and green skin shown in a wooden crate. Illustrative grade: ripe market-grade produce. Illustrative pack: 1 kg. Fruit count, exact size and availability are not represented by this DEMO listing.”

The titles and descriptions only claim what the approved images visibly show.
Grade and pack are explicitly illustrative; no farm, seller, certification,
origin, freshness guarantee, review, discount or real-supply claim was added.

## 3. Provenance

All four files already existed under `public/generated/fresh/` and are recorded
in `scripts/image-registry.json`. None was used by any catalogue product before
this run, and each is now used only by its batch B row. The images were
inspected visually before publication; each matches the described subject.

| Asset | Registry ID | Used by | Model / size | Task ID | Generated (UTC) | Dimensions | Bytes |
|---|---|---|---|---|---:|---:|---:|
| `/generated/fresh/prod-cabbage.webp` | `prod-cabbage` | `demo-fresh-cabbage-1-head` | gpt-image-2-text-to-image / 1K | `52ff2a3a0cec278835ddacc09d893dba` | 2026-11-09T09:07:06.818Z | 1024×1024 | 227,060 |
| `/generated/fresh/prod-carrots.webp` | `prod-carrots` | `demo-fresh-carrots-1kg` | gpt-image-2-text-to-image / 1K | `ad6c1d5500a361df5f5f390b82afded1` | 2026-11-09T09:06:05.518Z | 1024×1024 | 221,056 |
| `/generated/fresh/prod-cucumber.webp` | `prod-cucumber` | `demo-fresh-cucumbers-1kg` | gpt-image-2-text-to-image / 1K | `1e9fb0363993415aaf065c358fa76d05` | 2026-11-09T07:53:32.205Z | 1024×1024 | 249,150 |
| `/generated/fresh/prod-apple-mangoes.webp` | `prod-apple-mangoes` | `demo-apple-mangoes-1kg` | gpt-image-2-text-to-image / 1K | `8210c1290647b34e9f889b1438c397dc` | 2026-11-09T08:12:38.605Z | 1024×1024 | 141,740 |

Registry prompts, verbatim:

- **Cabbage:** “Photorealistic editorial food-marketplace photography, natural golden daylight, rich authentic colours, shallow depth of field, premium African farm-to-table campaign quality, no text, no words, no watermark, no logo. firm green cabbage heads stacked in a market basket, shot from a slight overhead angle filling a square frame”
- **Carrots:** “Photorealistic editorial food-marketplace photography, natural golden daylight, rich authentic colours, shallow depth of field, premium African farm-to-table campaign quality, no text, no words, no watermark, no logo. fresh orange carrots with leafy tops bunched together, shot from a slight overhead angle filling a square frame”
- **Cucumber:** “Photorealistic editorial food-marketplace photography, natural golden daylight, rich authentic colours, shallow depth of field, premium African farm-to-table campaign quality, no text, no words, no watermark, no logo. fresh cucumbers, shot from a slight overhead angle filling a square frame”
- **Apple mangoes:** “Photorealistic editorial food-marketplace photography, natural golden daylight, rich authentic colours, shallow depth of field, premium African farm-to-table campaign quality, no text, no words, no watermark, no logo. sweet apple mangoes heaped in a crate in warm orchard sunlight, shot from a slight overhead angle filling a square frame”

The registry records `creditsConsumed: 6` and `costUsd: 0.03` per historical
generation and `qualityReview: pending-owner-review`. Those are generation-time
records; this batch generated nothing and incurred no cost. Publication and
subject-matching verification do not grant owner approval.

## 4. Verification executed

| Command | Result |
|---|---|
| `node --check scripts/review-catalogue-batch-b.cjs` | Syntax OK |
| `node scripts/review-catalogue-batch-b.cjs` (creation run) | Exit 0 · 117/117 checks pass · 4 created and published · 37 → 41 active products |
| `node scripts/review-catalogue-batch-b.cjs` (idempotency re-run) | Exit 0 · 113/113 checks pass · 0 created · all four rows skipped as existing ACTIVE · 41 → 41 |
| `curl /product/<slug>` for all four | HTTP 200 for all four |
| `curl /api/products?category=groceries-household&pageSize=60` | HTTP 200 · `total=8` · contains all four existing and all four batch B slugs |
| `curl "/api/products?q=<produce>&category=groceries-household"` for cabbage, carrots, cucumbers, apple mangoes | HTTP 200 · `total=1` each · correct slug each time |
| Asset HTTP checks | HTTP 200 with `Content-Type: image/webp` for all four |
| Chromium 1440×1000 (script) | Product image `naturalWidth > 0` with exact stored alt; department card and search card images loaded; exact card alt = product name; 0 page errors |
| Read-only database read-back | All four `ACTIVE`, `isDemo=true`, `isSample=false`, NG/NGN, stock 25/0, department `groceries-household`, one image with expected URL and alt |

The creation-run guard also verified the REVIEW fingerprint before mutation:
the served page exposed the REVIEW catalogue note, the admin catalogue had
exactly 9 active departments, all six batch A rows were ACTIVE, a known
run-tagged audit-residue row was present, and the Groceries department existed
under the exact approved name. This is a REVIEW-preview refusal, not a
publication into an unidentified catalogue.

## 5. Residue audit (read-only)

Command (the connection string is supplied explicitly and never read from
`DATABASE_URL` or root `.env`; the value is not recorded here):

```text
REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/review-catalogue-residue-audit.ts --expect-db=naijadeals_review
```

Result: exit 0 · 321/321 checks pass · `current_database=naijadeals_review` ·
`DatabaseClassification: default=REVIEW` · all SQL inside
`BEGIN TRANSACTION READ ONLY` and rolled back.

### 5.1 Active baseline after batch A+B

| Measure | Value |
|---|---:|
| Active departments | 9 |
| Active products | 41 |
| Groceries & Household Essentials products | 8 |
| Batch A rows ACTIVE | 6 / 6 |
| Batch B rows ACTIVE | 4 / 4 |
| Active products in an inactive department | 0 |
| Active products flagged `isSample` | 0 |

### 5.2 Non-public inventory

| Class | Count |
|---|---:|
| Inactive departments | 40 |
| Non-ACTIVE products | 64 |
| **Total non-public records** | **104** |
| Run-tagged/run-owned records | 103 |
| — run-tagged departments | 40 |
| — run-tagged products | 63 |
| — archived workflow products | 55 |
| — DRAFT workflow products | 8 |
| Unrelated archived demo (not run-tagged) | 1 |

The one unrelated archived row is `demo-daily-sunscreen` (archived by
`scripts/review-catalogue-repair.ts:37-43` for an image/description mismatch).

The task brief estimated “~53” run-tagged products. The exact archived
workflow-product count is **55**: 13 timestamped workflow runs × 3 products = 39,
plus 8 legacy runs × 2 products = 16. In addition there are 8 DRAFT run-tagged
products and 40 inactive run-tagged departments, so 103 run-tagged records in
total.

### 5.3 Ownership by run tag / family

All current run-tagged residue is owned by `scripts/review-catalogue-workflow.cjs`
(including earlier revisions of that workflow); the one department without a
token, `review-workflow-demo`, is from an earlier workflow run and is recorded as
“unattributed earlier run”. The exact per-record ownership (run tag, family,
state, direct-page/search/category results) is in
`qa-artifacts/review-basket/catalogue-residue-audit.json`.

| Family | Count |
|---|---:|
| Alt-text probe department | 16 |
| Workflow run department | 21 |
| Earlier workflow demo department | 1 |
| Final acceptance department | 2 |
| Acceptance lifecycle product | 13 |
| Workflow publish/unpublish product | 26 |
| Incomplete draft product | 21 |
| Final acceptance product | 2 |
| Independent workflow product | 1 |
| **Run-tagged total** | **103** |

Run-tag groups:

- 13 timestamped runs (`20261112220518-ji8qmn` through
  `20261113132509-gxctv6`): each 2 departments + 3 products.
- 8 legacy runs (`2348vnj0je`, `2513guc9ym`, `28582b70i4`, `36467pacp0`,
  `40457d5vs0`, `47590u35kn`, `4818w39p4m`, `5219h1nmfn`): each 1 review
  department + 2 products; three also left an alt-probe department.
- 8 DRAFT products under `mwe1w12d`, `mwe1wwfo`, `mwe1io09`, `mwe1892s`,
  `mwe18qtc`, `mwe19gg1`, `mwe1ayh5`, `mwe1e4kv`.
- 1 untagged earlier department (`review-workflow-demo`).

### 5.4 Public exclusion evidence

| Surface | Coverage | Result |
|---|---|---|
| Public product API count | `/api/products` page 1 | `total=41`; 41 items; every slug active; no residue; no `isSample` |
| Public navigation | `/api/categories` | exactly the 9 active department slugs; no inactive department |
| Inactive category APIs | all 40 inactive departments | `total=0` and no item for every one |
| Rendered category pages | all 40 inactive departments in Chromium | no `article[data-product]` cards for every one; missing-department/empty state shown |
| Direct product pages | all 64 non-ACTIVE products | HTTP 404 for every one; response body does not contain the product name |
| Exact-name search | all 64 non-ACTIVE products | no result carrying that product slug |
| Run-tag search API | all 29 distinct run tokens | `total=0` for every token |
| Run-tag search pages | representative timestamp, legacy and `mwe` tokens | no product cards; “No products match” state |
| Storefront shelves | `/naijashop` in Chromium | cards only active products; no residue card; department links only active |
| All-departments page | `/naijashop/categories` in Chromium | sidebar exactly 9 active departments; product grid contains no residue |

The audit also asserts that no run-tagged department is active and no
run-tagged product is ACTIVE. Nothing was deleted, archived, deactivated,
renamed or edited by this audit.

### 5.5 Guard negative tests

The audit fails closed before connecting when selection is missing:

| Invocation | Result |
|---|---|
| No `REVIEW_DATABASE_URL` | Exit 2: “REVIEW_DATABASE_URL must be set explicitly; DATABASE_URL and root .env are never used as a fallback.” |
| `REVIEW_DATABASE_URL` names `naijadeals_core`, `--expect-db=naijadeals_review` | Exit 2: refuses the name mismatch before connecting |
| No `--expect-db` | Exit 2: “--expect-db=<database name> is required; there is no default database.” |

## 6. Database-selection guard findings (Task 3)

No `scripts/review-*` file imports `dotenv/config`. A bare
`npx tsx -e "..."` from the repository root leaves `DATABASE_URL` unset, so these
scripts do not automatically load the root `.env`. The fallback risk is ambient:
`lib/prisma.ts:5-8` constructs `PrismaClient` with no explicit datasource, so any
caller-supplied `DATABASE_URL` is used. The root `.env` currently points at
`naijadeals_core` (classified `TEST`), so REVIEW-only classification guards
refuse it; a different REVIEW-classified database would not be refused by a
classification-only guard.

| Script | DB access | Guard | Finding / file:line |
|---|---|---|---|
| `scripts/review-catalogue-batch-b.cjs` (new) | HTTP admin API only | REVIEW note + 9 active departments + batch A/residue fingerprint | No direct DB/env selection; refuses a target without the REVIEW indicator or expected catalogue fingerprint (`:60-73`, `:217-226`, `:281-320`) |
| `scripts/review-catalogue-residue-audit.ts` (new) | Explicit `pg` | Mandatory `REVIEW_DATABASE_URL` + `--expect-db` + `current_database()` + REVIEW classification + read-only transaction | Strongest guard; never reads `DATABASE_URL` or `.env` (`:182-235`) |
| `scripts/review-preview-guard.ts` | Prisma via `lib/prisma.ts` | Requires `REVIEW_EXPECTED_DATABASE` + REVIEW classification | No explicit URL selection, but the launcher supplies one (`:5`, `:11-25`) |
| `scripts/start-review-preview.cmd` | Sets `DATABASE_URL` | Requires `REVIEW_DATABASE_URL` and `REVIEW_EXPECTED_DATABASE`; never root `.env` | Correct launcher (`:5-13`) |
| `scripts/review-catalogue-seed.ts` | Prisma | Classification REVIEW only | No expected database name; can target any REVIEW-classified ambient `DATABASE_URL`; mutates catalogue (`:6`, `:137-142`) |
| `scripts/review-catalogue-repair.ts` | Prisma | Classification REVIEW only | Same; mutates products/categories (`:8`, `:11-12`) |
| `scripts/review-reindex.ts` | Prisma | Classification REVIEW only | Same; mutates the search index (`:2`, `:6-7`) |
| `scripts/review-admin-setup.ts` | Prisma | Classification REVIEW only | Same; mutates users/roles (`:4`, `:11-14`) |
| `scripts/review-customer-setup.ts` | Prisma | Classification REVIEW only | Same; mutates user/cart (`:8`, `:15-18`) |
| `scripts/review-scoped-admin-setup.ts` | Prisma | Classification REVIEW only | Same; mutates users/roles (`:4`, `:11-12`) |
| `scripts/review-catalogue-assets-audit.ts` | Prisma | `--expect-db` optional; classification REVIEW required | Read-only, but without `--expect-db` it can target any REVIEW-classified DB (`:24`, `:254-272`, `:625-632`) |
| `scripts/review-demo-metadata-audit.ts` | Prisma | `--expect-db` optional for read-only; required for `--apply` | Read-only mode can target any REVIEW-classified DB; `--apply` requires the name (`:22`, `:110-128`, `:132-138`) |
| `scripts/review-order-snapshot-journey.cjs` | `new PrismaClient()` | Classification check only records a boolean and **continues** | Highest residual risk: it creates/deletes an order if the fixture product/customer exist, even when the classification is not REVIEW (`:7`, `:11`, `:20-24`) |
| `scripts/review-catalogue-workflow.cjs` | HTTP admin API only | None for DB identity; asserts catalogue baseline 9/31 | Relies on the target preview; baseline is now stale at 9/41 (`:36`, `:43-44`) |
| `scripts/review-catalogue-admin-journey.cjs` | HTTP admin API only | None for DB identity | Relies on `REVIEW_BASE_URL` (`:8`) |
| `scripts/review-catalogue-scope-journey.cjs` | HTTP admin API only | None for DB identity | Relies on `REVIEW_BASE_URL` (`:7`) |
| `scripts/review-catalogue-batch-a.cjs` | HTTP admin API only | HTTP 200 only; no REVIEW indicator or catalogue fingerprint | Could be pointed at a different preview; batch B closes this for batch B only (`:45`, `:226-228`) |

Conclusion: no inspected review script auto-loads root `.env`. Root `.env`
(`naijadeals_core`, TEST) is refused by every REVIEW classification guard. The
remaining risks are ambient `DATABASE_URL` supplied by a caller, optional or
missing expected-database arguments in older scripts, and the non-aborting check
in `review-order-snapshot-journey.cjs`. The preview launcher already avoids root
`.env` by requiring `REVIEW_DATABASE_URL`. No script outside this batch's
ownership was modified.

## 7. Mismatches and follow-ups

1. **Stale workflow baseline.** `scripts/review-catalogue-workflow.cjs:43-44`
   still expects the 9/31 expansion state. The live REVIEW baseline is 9/41
   after batch B. Its owner must update `EXPANDED_BASELINE` before using the
   workflow as a baseline gate. Batch A recorded the same stale constant at 9/31.
2. **Historical docs.** `docs/handoff.md` and other programme records may still
   state 31 active products; they are outside this batch's ownership.
3. **Registry approval.** All four fresh assets remain
   `pending-owner-review`. Publication verifies subject accuracy and rendering,
   not owner approval.
4. **Guard defect outside ownership.**
   `scripts/review-order-snapshot-journey.cjs:20-24` records a failed
   classification check and proceeds. It should throw before any order write;
   not modified here.
5. **Batch A script fingerprint.** `scripts/review-catalogue-batch-a.cjs` checks
   only that the preview returns HTTP 200. Batch B adds the REVIEW indicator and
   catalogue fingerprint; batch A was intentionally not edited.
6. **Evidence location.** QA evidence is under `qa-artifacts/review-basket/` and
   is git-ignored. This document records the created ids, slugs, counts and
   executed results so the committed record remains self-contained.

## 8. Status

- Published and verified locally: 4 / 4 batch B products.
- Idempotency verified: second run created 0 rows and changed no counts.
- Residue audit verified: 321 / 321 checks pass; 104 non-public records, 103
  run-tagged/run-owned, none active or publicly discoverable.
- Deletion, deactivation, generation/spend, restart, deployment and push: not
  performed.
- Local commit: prepared after these results; no remote push.
