/**
 * Transactional seed-replacement tests for the Discover Africa registry.
 *
 * Runs against one run-owned DRAFT fixture (code QS). Exercises the exported
 * seedCountry() replacement exactly as scripts/seed-country-discovery.ts uses
 * it: replacement, stale-theme removal, rollback on a mid-write failure and two
 * concurrent replacements serializing to one complete set.
 *
 * Theme image mapping decisions are not changed by this test; it reuses an
 * approved illustration path.
 *
 * Run:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-seed-replacement-tests.ts
 */
import { randomUUID } from "node:crypto";
import { Client, type Client as PgClient } from "pg";
import { requireCountryReviewDatabase, sanitizeCountryReviewError } from "./lib/country-review-db";
import { seedCountry, type Country, type PreparedCountry, type PreparedTheme } from "./seed-country-discovery";

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

const IMAGE = {
  url: "/generated/countries/illustration-leaf.svg",
  alt: "Vector illustration of a leaf for the run-owned seed replacement fixture",
  kind: "ILLUSTRATION",
  provenance: "Original code-native NaijaDeals vector illustration; run-owned seed replacement fixture only"
};

function preparedCountry(run: string, variant: "A" | "B"): PreparedCountry {
  const themes: PreparedTheme[] = Array.from({ length: 6 }, (_, index) => ({
    key: `qa-seed-theme-${index + 1}`,
    label: `Seed replacement theme ${variant}${index + 1}`,
    association: `Run-owned seed replacement association ${variant} for theme ${index + 1}.`,
    image: IMAGE,
    sortOrder: index,
    sources: [1, 2].map((sourceIndex) => ({
      title: `Seed replacement source ${variant}${index + 1}-${sourceIndex}`,
      publisher: "NaijaDeals QA",
      url: `https://qa-seed-${run}.example.org/${variant.toLowerCase()}-${index + 1}-${sourceIndex}`,
      accessedAt: new Date("2026-11-13T00:00:00.000Z"),
      sortOrder: sourceIndex - 1
    }))
  }));
  const country: Country = {
    code: "QS",
    slug: `qa-seed-replacement-${run}`,
    name: `QA Seed Replacement ${variant}`,
    region: "West Africa",
    localizedNames: { en: `QA Seed Replacement ${variant}` },
    introduction:
      "Run-owned draft fixture used to verify that seed replacement is atomic and never leaves a country without its complete theme and source set.",
    themes: [],
    editorialStatus: "reviewed"
  };
  return { country, sortOrder: 9999, localizedNames: { en: country.name }, themes };
}

async function state(pg: PgClient) {
  const profile = await pg.query<{ name: string; slug: string; introduction: string }>(
    'select name, slug, introduction from "CountryProfile" where code = $1',
    ["QS"]
  );
  const themes = await pg.query<{ key: string; label: string; sources: number; urls: string[] }>(
    `select t.key, t.label,
            (select count(*)::int from "CountryThemeSource" s where s."themeId" = t.id) as sources,
            coalesce((select array_agg(s.url order by s."sortOrder") from "CountryThemeSource" s where s."themeId" = t.id), '{}') as urls
       from "CountryTheme" t where t."countryCode" = 'QS' order by t.key`
  );
  return { profile: profile.rows[0] ?? null, themes: themes.rows };
}

async function createFixture(pg: PgClient, run: string) {
  const stale = await pg.query<{ slug: string }>('select slug from "CountryProfile" where code = $1', ["QS"]);
  if (stale.rowCount) {
    if (!stale.rows[0].slug.startsWith("qa-seed-replacement-")) {
      throw new Error("Refusing to reuse code QS: an unrelated profile exists.");
    }
    await pg.query('delete from "CountryProfile" where code = $1', ["QS"]);
  }
  await pg.query(
    `insert into "CountryProfile" (
       code, slug, name, region, introduction, "editorialStatus", "publicationStatus",
       "homeFeatured", "sortOrder", "createdAt", "updatedAt"
     ) values ('QS',$1,'QA Seed Replacement initial','West Africa',$2,'REVIEWED'::"CountryEditorialStatus",'DRAFT'::"CountryPublicationStatus",false,9999,now(),now())`,
    [
      `qa-seed-replacement-${run}`,
      "Run-owned draft fixture initial introduction used before the seed replacement is exercised by the script."
    ]
  );
  for (let index = 1; index <= 6; index += 1) {
    const themeId = randomUUID();
    await pg.query(
      `insert into "CountryTheme" (
         id, "countryCode", key, label, association, "imageUrl", "imageAlt", "imageKind",
         "imageProvenance", "sortOrder", "editorialStatus", "createdAt", "updatedAt"
       ) values ($1,'QS',$2,$3,$4,$5,$6,'ILLUSTRATION',$7,$8,'REVIEWED'::"CountryEditorialStatus",now(),now())`,
      [
        themeId,
        `qa-seed-theme-${index}`,
        `Initial seed theme ${index}`,
        "Initial run-owned association long enough for validation.",
        IMAGE.url,
        IMAGE.alt,
        IMAGE.provenance,
        index - 1
      ]
    );
    await pg.query(
      `insert into "CountryThemeSource" (id, "themeId", title, publisher, url, "accessedAt", "sortOrder", "createdAt")
       values ($1,$2,'Initial source','NaijaDeals QA',$3,now(),0,now())`,
      [randomUUID(), themeId, `https://qa-seed-${run}.example.org/initial-${index}`]
    );
  }
  const staleThemeId = randomUUID();
  await pg.query(
    `insert into "CountryTheme" (
       id, "countryCode", key, label, association, "imageUrl", "imageAlt", "imageKind",
       "imageProvenance", "sortOrder", "editorialStatus", "createdAt", "updatedAt"
     ) values ($1,'QS','qa-seed-stale','Stale seed theme','Run-owned stale theme that replacement must remove.',$2,$3,'ILLUSTRATION',$4,99,'REVIEWED'::"CountryEditorialStatus",now(),now())`,
    [staleThemeId, IMAGE.url, IMAGE.alt, IMAGE.provenance]
  );
  await pg.query(
    `insert into "CountryThemeSource" (id, "themeId", title, publisher, url, "accessedAt", "sortOrder", "createdAt")
     values ($1,$2,'Stale source','NaijaDeals QA',$3,now(),0,now())`,
    [randomUUID(), staleThemeId, `https://qa-seed-${run}.example.org/stale`]
  );
}

async function main() {
  const target = await requireCountryReviewDatabase();
  const { PrismaClient } = await import("@prisma/client");
  // Dynamic import resolves Prisma after the guard has pointed DATABASE_URL at
  // the verified target; no unverified query can run first.
  const prisma = new PrismaClient();
  const pg = new Client({ connectionString: target.url, application_name: "naijadeals-country-seed-replacement" });
  await pg.connect();
  const countsBefore = await pg.query<{ profiles: number; themes: number; sources: number }>(
    `select (select count(*)::int from "CountryProfile") as profiles,
            (select count(*)::int from "CountryTheme") as themes,
            (select count(*)::int from "CountryThemeSource") as sources`
  );
  const run = randomUUID().slice(0, 8);

  try {
    await createFixture(pg, run);

    await check("seed replacement writes the complete country set and removes stale themes", async () => {
      const result = await seedCountry(prisma, preparedCountry(run, "A"));
      const after = await state(pg);
      assert(result.themes === 6 && result.sources === 12, `unexpected result ${result.themes}/${result.sources}`);
      assert(after.profile?.name === "QA Seed Replacement A", "profile was not replaced");
      assert(after.themes.length === 6, `stale theme remains: ${after.themes.length} themes`);
      assert(after.themes.every((theme) => theme.sources === 2), "not every theme has 2 sources");
      assert(after.themes.every((theme) => theme.urls.every((url) => url.includes("/a-"))), "sources mix replacement variants");
      return `6 themes, 12 sources, stale theme removed`;
    });

    await check("a mid-write failure rolls back without leaving a partial country", async () => {
      const prior = await state(pg);
      const broken = preparedCountry(run, "B");
      broken.themes[5].sources[0] = { ...broken.themes[5].sources[0], url: null as unknown as string };
      let failed = false;
      try {
        await seedCountry(prisma, broken);
      } catch {
        failed = true;
      }
      assert(failed, "broken replacement unexpectedly succeeded");
      const after = await state(pg);
      assert(JSON.stringify(prior) === JSON.stringify(after), "failed replacement changed the country record");
      return "constraint failure rolled back the complete replacement";
    });

    await check("two concurrent seed replacements serialize to one complete set", async () => {
      const [first, second] = await Promise.allSettled([
        seedCountry(prisma, preparedCountry(run, "A")),
        seedCountry(prisma, preparedCountry(run, "B"))
      ]);
      assert(first.status === "fulfilled" && second.status === "fulfilled", "a concurrent replacement was rejected");
      const after = await state(pg);
      assert(after.themes.length === 6, `expected 6 themes, found ${after.themes.length}`);
      const variantA = after.themes.every((theme) => theme.label.includes(" A") && theme.urls.every((url) => url.includes("/a-")));
      const variantB = after.themes.every((theme) => theme.label.includes(" B") && theme.urls.every((url) => url.includes("/b-")));
      assert(variantA || variantB, "concurrent replacement left a mixed theme/source set");
      assert(after.themes.every((theme) => theme.sources === 2), "concurrent replacement left a partial source set");
      return variantA ? "final set is wholly variant A" : "final set is wholly variant B";
    });
  } finally {
    await pg.query('delete from "SystemEvent" where "entityId" = $1', ["QS"]).catch(() => undefined);
    await pg.query('delete from "AuditLog" where "entityId" = $1', ["QS"]).catch(() => undefined);
    await pg.query('delete from "CountryProfile" where code = $1', ["QS"]).catch(() => undefined);
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
            restored: JSON.stringify(countsBefore.rows[0]) === JSON.stringify(countsAfter.rows[0])
          }
        },
        null,
        2
      )
    );
    if (JSON.stringify(countsBefore.rows[0]) !== JSON.stringify(countsAfter.rows[0])) process.exitCode = 1;
    await prisma.$disconnect();
    await pg.end();
  }

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_SEED_REPLACEMENT_TESTS_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
