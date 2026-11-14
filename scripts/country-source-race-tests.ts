/**
 * Concurrent country theme source-replacement race.
 *
 * Two editorial requests replace the same theme's source set at the same time.
 * Replacement semantics are "last writer wins with exactly one complete set".
 * A merge (sources from both requests surviving), a partial set, a unique-key
 * failure or a duplicate row is a defect.
 *
 * Modes:
 *   --expect=race    record the current defective behaviour and exit 0 when a
 *                    defect is observed (pre-fix evidence)
 *   --expect=fixed   require every iteration to serialize to exactly one set
 *
 * Run only against REVIEW:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-source-race-tests.ts --expect=race
 *
 * The fixture is run-owned, is never published and is deleted in a finally
 * block together with its audit/system-event rows. Accepted 54/324/362 rows
 * are not touched.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { requireCountryReviewDatabase, sanitizeCountryReviewError } from "./lib/country-review-db";

const MODE = process.argv.find((arg) => arg.startsWith("--expect="))?.slice("--expect=".length) ?? "fixed";
const ITERATIONS = Number(process.env.RACE_ITERATIONS ?? 12);

type Observation = {
  iteration: number;
  settled: Array<"fulfilled" | "rejected">;
  errors: string[];
  finalSourceCount: number;
  finalUrls: string[];
  outcome: "one-set" | "merged" | "partial" | "conflict" | "other";
};

function tag(runId: string) {
  return runId.slice(0, 8);
}

function uniqueUrls(runId: string, group: "a" | "b", count = 2) {
  return Array.from({ length: count }, (_, index) => `https://qa-race-${tag(runId)}.example.org/${group}${index + 1}`);
}

function sourceRows(runId: string, group: "a" | "b", urls: string[]) {
  return urls.map((url, index) => ({
    title: `Run-owned race source ${group.toUpperCase()}${index + 1}`,
    publisher: "NaijaDeals QA",
    url,
    accessedAt: new Date().toISOString().slice(0, 10)
  }));
}

async function main() {
  if (MODE !== "race" && MODE !== "fixed") {
    throw new Error("Use --expect=race or --expect=fixed.");
  }
  const target = await requireCountryReviewDatabase();
  const runId = randomUUID();
  const code = "QR";
  const slug = `qa-source-race-${tag(runId)}`;
  const themeId = randomUUID();
  const actorIds = [randomUUID(), randomUUID()];
  const pg = new Client({ connectionString: target.url, application_name: "naijadeals-country-source-race" });
  await pg.connect();

  const countsBefore = await pg.query<{ profiles: number; themes: number; sources: number }>(
    `select (select count(*)::int from "CountryProfile") as profiles,
            (select count(*)::int from "CountryTheme") as themes,
            (select count(*)::int from "CountryThemeSource") as sources`
  );

  try {
    const stale = await pg.query<{ slug: string }>('select slug from "CountryProfile" where code = $1', [code]);
    if (stale.rowCount) {
      if (!stale.rows[0].slug.startsWith("qa-source-race-")) {
        throw new Error(`Refusing to reuse code ${code}: an unrelated profile already uses it.`);
      }
      await pg.query('delete from "CountryProfile" where code = $1', [code]);
    }

    await pg.query(
      `insert into "CountryProfile" (
         code, slug, name, region, introduction, "editorialStatus", "publicationStatus",
         "homeFeatured", "sortOrder", "createdAt", "updatedAt"
       ) values ($1,$2,$3,$4,$5,'REVIEWED'::"CountryEditorialStatus",'DRAFT'::"CountryPublicationStatus",false,9999,now(),now())`,
      [code, slug, "QA Source Race", "West Africa", "Run-owned draft fixture for concurrent source-replacement verification. Not published."]
    );
    await pg.query(
      `insert into "CountryTheme" (
         id, "countryCode", key, label, association, "imageUrl", "imageAlt", "imageKind",
         "imageProvenance", "sortOrder", "editorialStatus", "createdAt", "updatedAt"
       ) values ($1,$2,'qa-race-theme','QA race theme','Run-owned fixture association for a concurrent replacement test.',
         '/generated/countries/illustration-fruit.svg','Vector illustration of fruit in a bowl','ILLUSTRATION',
         'Original code-native NaijaDeals vector illustration; QA fixture only',0,'REVIEWED'::"CountryEditorialStatus",now(),now())`,
      [themeId, code]
    );
    for (const [index, actorId] of actorIds.entries()) {
      await pg.query(
        `insert into "User" (id, email, name, "actorType", "createdAt", "updatedAt")
         values ($1,$2,$3,'ADMIN'::"ActorType",now(),now())`,
        [actorId, `qa-source-race-${tag(runId)}-${index}@review.local`, `QA race actor ${index + 1}`]
      );
    }

    const { updateCountryTheme } = await import("../lib/services/countries/discovery.service");
    const actors = actorIds.map(
      (id) =>
        ({ id, actorType: "ADMIN", roles: [], vendors: [] }) as unknown as Parameters<typeof updateCountryTheme>[0]
    );
    const aUrls = uniqueUrls(runId, "a");
    const bUrls = uniqueUrls(runId, "b");

    const observations: Observation[] = [];
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      await pg.query('delete from "CountryThemeSource" where "themeId" = $1', [themeId]);
      for (const [index, url] of aUrls.entries()) {
        await pg.query(
          `insert into "CountryThemeSource" (id, "themeId", title, publisher, url, "accessedAt", "sortOrder", "createdAt")
           values ($1,$2,$3,$4,$5,now(),$6,now())`,
          [randomUUID(), themeId, `Seed source ${index + 1}`, "NaijaDeals QA", url, index]
        );
      }

      const settled = await Promise.allSettled([
        updateCountryTheme(actors[0], { themeId, sources: sourceRows(runId, "a", aUrls) }),
        updateCountryTheme(actors[1], { themeId, sources: sourceRows(runId, "b", bUrls) })
      ]);
      const final = await pg.query<{ url: string }>(
        'select url from "CountryThemeSource" where "themeId" = $1 order by url',
        [themeId]
      );
      const finalUrls = final.rows.map((row) => row.url);
      const fromA = finalUrls.every((url) => aUrls.includes(url));
      const fromB = finalUrls.every((url) => bUrls.includes(url));
      const merged = finalUrls.some((url) => aUrls.includes(url)) && finalUrls.some((url) => bUrls.includes(url));
      const bothFulfilled = settled.every((row) => row.status === "fulfilled");
      const outcome: Observation["outcome"] = merged
        ? "merged"
        : finalUrls.length === 2 && (fromA || fromB)
          ? "one-set"
          : finalUrls.length === 0
            ? "partial"
            : !bothFulfilled
              ? "conflict"
              : "other";
      observations.push({
        iteration,
        settled: settled.map((row) => row.status),
        errors: settled
          .filter((row): row is PromiseRejectedResult => row.status === "rejected")
          .map((row) => String(row.reason instanceof Error ? row.reason.message : row.reason).slice(0, 160)),
        finalSourceCount: finalUrls.length,
        finalUrls,
        outcome
      });
    }

    const defects = observations.filter((row) => row.outcome !== "one-set");
    const merged = observations.filter((row) => row.outcome === "merged");
    console.log(
      JSON.stringify(
        {
          mode: MODE,
          iterations: ITERATIONS,
          defectCount: defects.length,
          mergedCount: merged.length,
          observations
        },
        null,
        2
      )
    );

    if (MODE === "race") {
      if (defects.length === 0) {
        console.log(
          "RACE_NOT_OBSERVED — concurrent updateCountryTheme source replacement serialized in every iteration; row-lock behaviour recorded."
        );
      } else {
        console.log(
          `RACE_REPRODUCED — ${defects.length}/${ITERATIONS} iterations left a defective source set (merged=${merged.length}).`
        );
      }
    } else if (defects.length > 0) {
      console.error(`RACE_FAILED — ${defects.length}/${ITERATIONS} iterations left a defective source set.`);
      process.exitCode = 1;
    } else {
      console.log(`RACE_SERIALIZED — all ${ITERATIONS} iterations left exactly one complete source set.`);
    }
  } finally {
    await pg.query(
      `delete from "SystemEvent" where "entityId" = any($1::text[]) or "actorId" = any($2::text[])`,
      [[code, themeId], actorIds]
    );
    await pg.query(
      `delete from "AuditLog" where "entityId" = any($1::text[]) or "actorId" = any($2::text[])`,
      [[code, themeId], actorIds]
    );
    await pg.query('delete from "CountryProfile" where code = $1', [code]);
    await pg.query('delete from "User" where id = any($1::text[])', [actorIds]);
    const countsAfter = await pg.query<{ profiles: number; themes: number; sources: number }>(
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
            restored:
              JSON.stringify(countsBefore.rows[0]) === JSON.stringify(countsAfter.rows[0])
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
  console.error(`COUNTRY_SOURCE_RACE_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
