/**
 * Concurrent publish vs theme edit.
 *
 * A country is validated then published without a transaction or row lock.
 * A concurrent theme edit can remove required media between the validation
 * read and the publication write, leaving a PUBLISHED theme without alt text.
 *
 * The interleaving is made deterministic by holding a PostgreSQL row lock on
 * the country profile, starting publication (its validation read succeeds, its
 * UPDATE waits), applying the theme edit, then releasing the lock.
 *
 * Modes:
 *   --expect=race    record the current defective behaviour (pre-fix evidence)
 *   --expect=fixed   require the publication invariant to hold under the same
 *                    interleaving (no PUBLISHED theme without image/alt/source)
 *
 * Run only against REVIEW:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-publish-race-tests.ts --expect=race
 *
 * The run-owned fixture is deleted in a finally block. Accepted countries are
 * never unpublished or edited.
 */
import { randomUUID } from "node:crypto";
import { Client, type Client as PgClient } from "pg";
import { requireCountryReviewDatabase, sanitizeCountryReviewError } from "./lib/country-review-db";

const MODE = process.argv.find((arg) => arg.startsWith("--expect="))?.slice("--expect=".length) ?? "fixed";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Fixture = {
  code: string;
  slug: string;
  themeIds: string[];
  actorId: string;
};

async function createFixture(pg: PgClient, runId: string): Promise<Fixture> {
  const code = "QP";
  const slug = `qa-publish-race-${runId.slice(0, 8)}`;
  const stale = await pg.query<{ slug: string }>('select slug from "CountryProfile" where code = $1', [code]);
  if (stale.rowCount) {
    if (!stale.rows[0].slug.startsWith("qa-publish-race-")) {
      throw new Error(`Refusing to reuse code ${code}: an unrelated profile already uses it.`);
    }
    await pg.query('delete from "CountryProfile" where code = $1', [code]);
  }

  const actorId = randomUUID();
  await pg.query(
    `insert into "User" (id, email, name, "actorType", "createdAt", "updatedAt")
     values ($1,$2,$3,'ADMIN'::"ActorType",now(),now())`,
    [actorId, `qa-publish-race-${runId.slice(0, 8)}@review.local`, "QA publish race actor"]
  );
  await pg.query(
    `insert into "CountryProfile" (
       code, slug, name, region, introduction, "editorialStatus", "publicationStatus",
       "homeFeatured", "sortOrder", "createdAt", "updatedAt"
     ) values ($1,$2,'QA Publish Race','West Africa',$3,'REVIEWED'::"CountryEditorialStatus",'DRAFT'::"CountryPublicationStatus",false,9999,now(),now())`,
    [
      code,
      slug,
      "Run-owned draft fixture for a concurrent publication and theme-edit check. It is deleted after the test and is never a public country guide."
    ]
  );

  const themeIds: string[] = [];
  for (let index = 1; index <= 6; index += 1) {
    const themeId = randomUUID();
    themeIds.push(themeId);
    await pg.query(
      `insert into "CountryTheme" (
         id, "countryCode", key, label, association, "imageUrl", "imageAlt", "imageKind",
         "imageProvenance", "sortOrder", "editorialStatus", "createdAt", "updatedAt"
       ) values ($1,$2,$3,$4,$5,'/generated/countries/illustration-fruit.svg',$6,'ILLUSTRATION',
         'Original code-native NaijaDeals vector illustration; QA fixture only',$7,'REVIEWED'::"CountryEditorialStatus",now(),now())`,
      [
        themeId,
        code,
        `qa-publish-theme-${index}`,
        `QA publish theme ${index}`,
        "Run-owned fixture association long enough for publication validation.",
        `Vector illustration of fruit in a bowl, QA fixture theme ${index}`,
        index - 1
      ]
    );
    await pg.query(
      `insert into "CountryThemeSource" (id, "themeId", title, publisher, url, "accessedAt", "sortOrder", "createdAt")
       values ($1,$2,$3,'NaijaDeals QA',$4,now(),0,now())`,
      [
        randomUUID(),
        themeId,
        `Run-owned source ${index}`,
        `https://qa-publish-race-${runId.slice(0, 8)}.example.org/source-${index}`
      ]
    );
  }
  return { code, slug, themeIds, actorId };
}

async function main() {
  if (MODE !== "race" && MODE !== "fixed") throw new Error("Use --expect=race or --expect=fixed.");
  const target = await requireCountryReviewDatabase();
  const runId = randomUUID();
  const pg = new Client({ connectionString: target.url, application_name: "naijadeals-country-publish-race" });
  await pg.connect();
  const lock = new Client({ connectionString: target.url, application_name: "naijadeals-country-publish-lock" });
  await lock.connect();
  const countsBefore = await pg.query(
    `select (select count(*)::int from "CountryProfile") as profiles,
            (select count(*)::int from "CountryTheme") as themes,
            (select count(*)::int from "CountryThemeSource") as sources`
  );
  let fixture: Fixture | null = null;

  try {
    fixture = await createFixture(pg, runId);
    const { publishCountry, updateCountryTheme } = await import("../lib/services/countries/discovery.service");
    const actor = { id: fixture.actorId, actorType: "ADMIN", roles: [], vendors: [] } as unknown as Parameters<
      typeof publishCountry
    >[0];

    // Hold the country profile row so publication's validation read completes
    // but its publication UPDATE must wait.
    await lock.query("BEGIN");
    await lock.query('select code from "CountryProfile" where code = $1 for update', [fixture.code]);

    const publishPromise = publishCountry(actor, fixture.code);
    publishPromise.catch(() => undefined);
    await sleep(500);

    // Start the edit without awaiting it: the fixed implementation makes it
    // wait for the same profile lock, so the external lock must be released
    // before either service call can finish.
    const editPromise = updateCountryTheme(actor, { themeId: fixture.themeIds[0], imageAlt: null });
    editPromise.catch(() => undefined);
    await sleep(400);
    await lock.query("COMMIT");
    const [publishResult, editResult] = await Promise.all([
      Promise.allSettled([publishPromise]).then((rows) => rows[0]),
      Promise.allSettled([editPromise]).then((rows) => rows[0])
    ]);
    await sleep(150);

    const profile = await pg.query<{ publicationStatus: string }>(
      'select "publicationStatus"::text as "publicationStatus" from "CountryProfile" where code = $1',
      [fixture.code]
    );
    const theme = await pg.query<{ imageUrl: string | null; imageAlt: string | null; sources: number }>(
      `select t."imageUrl", t."imageAlt",
              (select count(*)::int from "CountryThemeSource" s where s."themeId" = t.id) as sources
         from "CountryTheme" t where t.id = $1`,
      [fixture.themeIds[0]]
    );
    const published = profile.rows[0]?.publicationStatus === "PUBLISHED";
    const row = theme.rows[0];
    const violation = published && (!row?.imageUrl || !row?.imageAlt || row.sources === 0);

    const summary = {
      mode: MODE,
      fixture: { code: fixture.code, slug: fixture.slug, themes: fixture.themeIds.length },
      publish: publishResult?.status,
      publishError:
        publishResult?.status === "rejected" ? sanitizeCountryReviewError(publishResult.reason) : null,
      edit: editResult?.status,
      editError: editResult?.status === "rejected" ? sanitizeCountryReviewError(editResult.reason) : null,
      finalPublicationStatus: profile.rows[0]?.publicationStatus ?? null,
      themeAfter: row ?? null,
      invariantViolated: violation
    };
    console.log(JSON.stringify(summary, null, 2));

    if (MODE === "race") {
      if (violation) {
        console.log("PUBLISH_RACE_REPRODUCED — a PUBLISHED theme lost its required alt text under the interleaving.");
      } else {
        console.log("PUBLISH_RACE_NOT_OBSERVED — the interleaving did not leave a PUBLISHED theme without required media.");
      }
    } else if (violation) {
      console.error("PUBLISH_RACE_FAILED — a PUBLISHED theme is missing required media after the interleaving.");
      process.exitCode = 1;
    } else {
      console.log("PUBLISH_RACE_SERIALIZED — publication validation and the concurrent edit preserved the invariant.");
    }
  } finally {
    await lock.query("ROLLBACK").catch(() => undefined);
    await lock.end().catch(() => undefined);
    if (fixture) {
      await pg
        .query(`delete from "SystemEvent" where "entityId" = any($1::text[]) or "actorId" = $2`, [
          [fixture.code, ...fixture.themeIds],
          fixture.actorId
        ])
        .catch(() => undefined);
      await pg
        .query(`delete from "AuditLog" where "entityId" = any($1::text[]) or "actorId" = $2`, [
          [fixture.code, ...fixture.themeIds],
          fixture.actorId
        ])
        .catch(() => undefined);
      await pg.query('delete from "CountryProfile" where code = $1', [fixture.code]);
      await pg.query('delete from "User" where id = $1', [fixture.actorId]);
    }
    const countsAfter = await pg.query(
      `select (select count(*)::int from "CountryProfile") as profiles,
              (select count(*)::int from "CountryTheme") as themes,
              (select count(*)::int from "CountryThemeSource") as sources`
    );
    console.log(
      JSON.stringify(
        {
          cleanup: {
            countsBefore: countsBefore.rows[0],
            countsAfter: countsAfter.rows[0],
            restored: JSON.stringify(countsBefore.rows[0]) === JSON.stringify(countsAfter.rows[0])
          }
        },
        null,
        2
      )
    );
    await pg.end();
  }
}

main().catch((error) => {
  console.error(`COUNTRY_PUBLISH_RACE_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
