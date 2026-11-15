/**
 * Discover Africa origin-review tests against REVIEW.
 *
 * Verifies server pagination and filters reach every eligible product, that a
 * region-scoped reviewer may record a foreign origin for a product in their
 * marketplace scope, that cross-market access is still refused, and that the
 * before/after audit content is recorded. Uses one run-owned product, vendor
 * and two reviewer users, deleted in a finally block.
 *
 * Run:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-origin-tests.ts
 */
import { randomUUID } from "node:crypto";
import { Client, type Client as PgClient } from "pg";
import { requireCountryReviewDatabase, sanitizeCountryReviewError } from "./lib/country-review-db";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(fn: () => Promise<unknown>, status: number, code?: string): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const failure = error as { status?: number; code?: string; message: string };
    assert(failure.status === status, `expected HTTP ${status}, received ${failure.status ?? "none"}: ${failure.message}`);
    if (code) assert(failure.code === code, `expected code ${code}, received ${failure.code ?? "none"}`);
    return `${failure.code ?? "error"}: ${failure.message}`;
  }
  throw new Error(`expected HTTP ${status}, but the call succeeded`);
}

type Fixture = { runId: string; productId: string; vendorId: string; ownerId: string; ngReviewerId: string; ghReviewerId: string };

async function createFixture(pg: PgClient, runId: string): Promise<Fixture> {
  const category = await pg.query<{ id: string }>(
    'select id from "Category" where "isActive" = true and "deprecatedAt" is null order by slug limit 1'
  );
  assert(category.rows[0], "no active category exists to attach the fixture product to");
  const productId = randomUUID();
  const vendorId = randomUUID();
  const ownerId = randomUUID();
  const ngReviewerId = randomUUID();
  const ghReviewerId = randomUUID();

  for (const [id, email, name, scope] of [
    [ownerId, `qa-origin-${runId}-owner@review.local`, "QA origin owner", null],
    [ngReviewerId, `qa-origin-${runId}-ng@review.local`, "QA NG origin reviewer", "NG"],
    [ghReviewerId, `qa-origin-${runId}-gh@review.local`, "QA GH origin reviewer", "GH"]
  ] as const) {
    await pg.query(
      `insert into "User" (id, email, name, "actorType", "scopeCountryCode", "createdAt", "updatedAt")
       values ($1,$2,$3,'ADMIN'::"ActorType",$4,now(),now())`,
      [id, email, name, scope]
    );
  }

  await pg.query(
    `insert into "Vendor" (
       id, "ownerId", name, slug, market, description, "pickupAddress", "pickupPhone",
       "countryCode", status, "trustScore", "commissionBps", "createdAt", "updatedAt"
     ) values ($1,$2,$3,$4,'Lagos',$5,'Run-owned QA pickup address','08000000000','NG','VERIFIED'::"VendorStatus",50,1000,now(),now())`,
    [
      vendorId,
      ownerId,
      `QA Origin Vendor ${runId.slice(0, 8)}`,
      `qa-origin-vendor-${runId.slice(0, 8)}`,
      "Run-owned vendor for origin-review verification."
    ]
  );
  await pg.query(
    `insert into "Product" (
       id, "vendorId", "categoryId", name, slug, description, "priceKobo",
       "countryCode", status, "isDemo", "isSample", "createdAt", "updatedAt"
     ) values ($1,$2,$3,$4,$5,$6,100000::bigint,'NG','ACTIVE'::"ProductStatus",false,false,now(),now())`,
    [
      productId,
      vendorId,
      category.rows[0].id,
      `QA Origin Product ${runId.slice(0, 8)}`,
      `qa-origin-product-${runId.slice(0, 8)}`,
      "Run-owned product for origin-review pagination and scope verification."
    ]
  );
  return { runId, productId, vendorId, ownerId, ngReviewerId, ghReviewerId };
}

async function main() {
  const target = await requireCountryReviewDatabase();
  const pg = new Client({ connectionString: target.url, application_name: "naijadeals-country-origin" });
  await pg.connect();
  const productCountBefore = await pg.query<{ n: number }>('select count(*)::int as n from "Product"');
  const runId = randomUUID().slice(0, 8);
  let fixture: Fixture | null = null;

  try {
    fixture = await createFixture(pg, runId);
    const { listProductsForOriginReview, updateProductOrigin } = await import(
      "../lib/services/countries/discovery.service"
    );
    const ngReviewer = {
      id: fixture.ngReviewerId,
      actorType: "ADMIN",
      scopeCountryCode: "NG",
      roles: [{ role: { name: "country_origin_reviewer" } }],
      vendors: []
    } as never;
    const ghReviewer = {
      id: fixture.ghReviewerId,
      actorType: "ADMIN",
      scopeCountryCode: "GH",
      roles: [{ role: { name: "country_origin_reviewer" } }],
      vendors: []
    } as never;
    const fixtureName = `QA Origin Product ${runId}`;

    await check("server pagination returns bounded pages with totals", async () => {
      const page = await listProductsForOriginReview({ page: 1, pageSize: 5 });
      assert(page.rows.length === 5, `expected 5 rows, found ${page.rows.length}`);
      assert(page.total >= 5, `unexpected total ${page.total}`);
      assert(page.pageSize === 5 && page.page === 1, "page metadata is wrong");
      assert(page.totalPages === Math.max(1, Math.ceil(page.total / 5)), "totalPages is wrong");
      assert(page.countries.length === 54, `origin country reference list has ${page.countries.length} rows`);
      assert(page.countries.some((country) => country.code === "GH"), "origin country reference list omits GH");
      const second = await listProductsForOriginReview({ page: 2, pageSize: 5 });
      assert(second.rows.length === 5, "second page is empty");
      const overlap = page.rows.filter((row) => second.rows.some((other) => other.id === row.id));
      assert(overlap.length === 0, "pages overlap");
      return `total=${page.total} totalPages=${page.totalPages} pageSize=${page.pageSize}`;
    });

    await check("every eligible product is reachable by paging (no 1000-row cap)", async () => {
      const first = await listProductsForOriginReview({ page: 1, pageSize: 100 });
      const ids = new Set<string>();
      let page = 1;
      let total = first.total;
      let pages = 0;
      while (page <= first.totalPages && page <= 100) {
        const current = await listProductsForOriginReview({ page, pageSize: 100 });
        total = current.total;
        for (const row of current.rows) ids.add(row.id);
        pages += 1;
        page += 1;
      }
      assert(ids.size === total, `collected ${ids.size} unique products but total is ${total}`);
      assert(ids.has(fixture!.productId), "fixture product was not reachable by paging");
      return `${ids.size}/${total} unique products over ${pages} pages`;
    });

    await check("page size is clamped and invalid page input is normalised", async () => {
      const huge = await listProductsForOriginReview({ page: -3, pageSize: 5000 });
      assert(huge.page === 1, `negative page normalised to ${huge.page}`);
      assert(huge.pageSize === 100, `page size clamped to ${huge.pageSize}`);
      return `page=${huge.page} pageSize=${huge.pageSize}`;
    });

    await check("search, market, origin and basis filters return consistent totals", async () => {
      const search = await listProductsForOriginReview({ search: fixtureName, pageSize: 25 });
      assert(search.total === 1 && search.rows[0]?.id === fixture!.productId, "fixture search did not return exactly the fixture");

      const gh = await listProductsForOriginReview({ market: "GH", pageSize: 25 });
      assert(gh.total === 0 && gh.rows.length === 0, `expected no GH-market products, found ${gh.total}`);

      const all = await listProductsForOriginReview({ pageSize: 1 });
      const recorded = await listProductsForOriginReview({ origin: "recorded", pageSize: 1 });
      const unrecorded = await listProductsForOriginReview({ origin: "unrecorded", pageSize: 1 });
      assert(
        recorded.total + unrecorded.total === all.total,
        `recorded ${recorded.total} + unrecorded ${unrecorded.total} != total ${all.total}`
      );
      const verified = await listProductsForOriginReview({ basis: "VERIFIED", pageSize: 1 });
      assert(verified.total <= recorded.total, "verified total exceeds recorded total");
      assert(all.summary.total === all.total, `summary.total ${all.summary.total} != total ${all.total}`);
      return `total=${all.total} recorded=${recorded.total} unrecorded=${unrecorded.total} verified=${verified.total}`;
    });

    await check("scoped reviewer lists only their own marketplace", async () => {
      const gh = await listProductsForOriginReview({ countryCodeScope: "GH", pageSize: 25 });
      assert(gh.total === 0 && gh.rows.length === 0, `GH scope saw ${gh.total} products`);
      const ng = await listProductsForOriginReview({ countryCodeScope: "NG", search: fixtureName, pageSize: 25 });
      assert(ng.total === 1 && ng.rows[0]?.id === fixture!.productId, "NG scope did not see the NG fixture");
      assert(ng.rows.every((row) => row.countryCode === "NG"), "NG scope returned a non-NG product");
      return "GH scope: 0 rows; NG scope: fixture visible";
    });

    await check("scoped reviewer can record a foreign origin for a product in scope", async () => {
      const updated = await updateProductOrigin(ngReviewer, {
        productId: fixture!.productId,
        originCountryCode: "GH",
        originBasis: "SELLER_DECLARED",
        originNote: "Seller declaration recorded by the run-owned NG-scoped reviewer."
      });
      assert(updated.originCountryCode === "GH", "foreign origin was not saved");
      assert(updated.originBasis === "SELLER_DECLARED", "declared basis was not saved");
      const row = await pg.query<{ market: string; origin: string }>(
        'select "countryCode" as market, "originCountryCode" as origin from "Product" where id = $1',
        [fixture!.productId]
      );
      assert(row.rows[0]?.market === "NG" && row.rows[0]?.origin === "GH", "product market or origin changed unexpectedly");
      const audit = await pg.query<{ metadata: Record<string, unknown> }>(
        `select metadata from "AuditLog" where "entityId" = $1 and action = 'product.origin.declare' order by "createdAt" desc limit 1`,
        [fixture!.productId]
      );
      const metadata = audit.rows[0]?.metadata as { before?: { originCountryCode?: string | null }; after?: { originCountryCode?: string } };
      assert(metadata?.before?.originCountryCode === null, "audit before.originCountryCode missing");
      assert(metadata?.after?.originCountryCode === "GH", "audit after.originCountryCode missing");
      return "NG fulfilment market, GH origin accepted for an NG-scoped reviewer";
    });

    await check("declared and verified labels are recorded with verification evidence", async () => {
      const note = "Original producer invoice and export certificate checked by the run-owned reviewer.";
      const verified = await updateProductOrigin(ngReviewer, {
        productId: fixture!.productId,
        originCountryCode: "GH",
        originBasis: "VERIFIED",
        originNote: note
      });
      assert(verified.originBasis === "VERIFIED", "verified basis was not saved");
      assert(verified.originVerifiedAt instanceof Date, "verification timestamp was not recorded");
      const shortNote = await expectFailure(
        () =>
          updateProductOrigin(ngReviewer, {
            productId: fixture!.productId,
            originCountryCode: "GH",
            originBasis: "VERIFIED",
            originNote: "too short"
          }),
        400,
        "validation_error"
      );
      const unregistered = await expectFailure(
        () =>
          updateProductOrigin(ngReviewer, {
            productId: fixture!.productId,
            originCountryCode: "ZZ",
            originBasis: "SELLER_DECLARED",
            originNote: "unregistered origin"
          }),
        400,
        "validation_error"
      );
      return `VERIFIED with timestamp; short note refused (${shortNote.split(":")[0]}); unregistered origin refused (${unregistered.split(":")[0]})`;
    });

    await check("origin filter reflects the verified record", async () => {
      const verified = await listProductsForOriginReview({ search: fixtureName, basis: "VERIFIED", pageSize: 25 });
      assert(verified.total === 1 && verified.rows[0]?.originBasis === "VERIFIED", "verified filter did not find the fixture");
      const declared = await listProductsForOriginReview({ search: fixtureName, basis: "SELLER_DECLARED", pageSize: 25 });
      assert(declared.total === 0, "seller-declared filter still returns the verified fixture");
      return "basis=VERIFIED finds it; basis=SELLER_DECLARED does not";
    });

    await check("a reviewer from another marketplace cannot change the product", async () => {
      const before = await pg.query<{ origin: string | null; basis: string | null }>(
        'select "originCountryCode" as origin, "originBasis" as basis from "Product" where id = $1',
        [fixture!.productId]
      );
      await expectFailure(
        () =>
          updateProductOrigin(ghReviewer, {
            productId: fixture!.productId,
            originCountryCode: "GH",
            originBasis: "SELLER_DECLARED",
            originNote: "cross-market attempt"
          }),
        403,
        "region_forbidden"
      );
      await expectFailure(
        () =>
          updateProductOrigin(ghReviewer, {
            productId: fixture!.productId,
            originCountryCode: null,
            originBasis: null
          }),
        403,
        "region_forbidden"
      );
      const after = await pg.query<{ origin: string | null; basis: string | null }>(
        'select "originCountryCode" as origin, "originBasis" as basis from "Product" where id = $1',
        [fixture!.productId]
      );
      assert(JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]), "refused cross-market access changed the product");
      return "GH reviewer refused 403 for both set and clear; record unchanged";
    });

    await check("in-scope reviewer can clear the origin record and the public inventory excludes it", async () => {
      const { listCountryOriginProducts } = await import("../lib/services/countries/discovery.service");
      const publishedBefore = await listCountryOriginProducts("GH");
      assert(publishedBefore.some((product) => product.id === fixture!.productId), "verified fixture was not visible in the public country inventory before clearing");
      const cleared = await updateProductOrigin(ngReviewer, {
        productId: fixture!.productId,
        originCountryCode: null,
        originBasis: null
      });
      assert(cleared.originCountryCode === null && cleared.originBasis === null, "origin was not cleared");
      const row = await pg.query<{ origin: string | null; verifiedAt: Date | null }>(
        'select "originCountryCode" as origin, "originVerifiedAt" as "verifiedAt" from "Product" where id = $1',
        [fixture!.productId]
      );
      assert(row.rows[0]?.origin === null && row.rows[0]?.verifiedAt === null, "verification residue remains after clearing");
      const publishedAfter = await listCountryOriginProducts("GH");
      assert(!publishedAfter.some((product) => product.id === fixture!.productId), "cleared origin remained in the public country inventory");
      return "origin and verification fields cleared; public GH inventory excluded the fixture";
    });
  } finally {
    if (fixture) {
      const entityIds = [fixture.productId, fixture.vendorId];
      const actorIds = [fixture.ownerId, fixture.ngReviewerId, fixture.ghReviewerId];
      await pg
        .query(`delete from "SystemEvent" where "entityId" = any($1::text[]) or "actorId" = any($2::text[])`, [entityIds, actorIds])
        .catch(() => undefined);
      await pg
        .query(`delete from "AuditLog" where "entityId" = any($1::text[]) or "actorId" = any($2::text[])`, [entityIds, actorIds])
        .catch(() => undefined);
      await pg.query('delete from "Product" where id = $1', [fixture.productId]);
      await pg.query('delete from "Vendor" where id = $1', [fixture.vendorId]);
      await pg.query('delete from "User" where id = any($1::text[])', [actorIds]);
    }
    const productCountAfter = await pg.query<{ n: number }>('select count(*)::int as n from "Product"');
    console.log(
      JSON.stringify(
        {
          cleanup: {
            productCountBefore: productCountBefore.rows[0].n,
            productCountAfter: productCountAfter.rows[0].n,
            restored: productCountBefore.rows[0].n === productCountAfter.rows[0].n
          }
        },
        null,
        2
      )
    );
    if (productCountBefore.rows[0].n !== productCountAfter.rows[0].n) process.exitCode = 1;
    await pg.end();
  }

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_ORIGIN_TESTS_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
