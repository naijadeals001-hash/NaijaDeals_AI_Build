/**
 * Discover Africa publication-integrity tests against REVIEW.
 *
 * Creates one run-owned DRAFT country fixture (6 themes, sourced, imaged with
 * kind + provenance), exercises publication refusals, the published-media
 * reject-or-valid rules, source atomicity, audit before/after content and the
 * draft → publish → unpublish lifecycle, then deletes the fixture and asserts
 * the accepted 54/324/362 counts are restored.
 *
 * Accepted countries are never unpublished or edited.
 *
 * Run:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-publication-integrity-tests.ts
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

type ApiFailure = { status?: number; code?: string; message: string };

async function expectFailure(fn: () => Promise<unknown>, status: number, code?: string): Promise<ApiFailure> {
  try {
    await fn();
  } catch (error) {
    const failure = error as ApiFailure;
    assert(failure.status === status, `expected HTTP ${status}, received ${failure.status ?? "no status"}: ${failure.message}`);
    if (code) assert(failure.code === code, `expected code ${code}, received ${failure.code ?? "none"}`);
    return failure;
  }
  throw new Error(`expected HTTP ${status}, but the call succeeded`);
}

type Fixture = { code: string; slug: string; themeIds: string[]; actorId: string };

async function counts(pg: PgClient) {
  const row = await pg.query<{ profiles: number; themes: number; sources: number }>(
    `select (select count(*)::int from "CountryProfile") as profiles,
            (select count(*)::int from "CountryTheme") as themes,
            (select count(*)::int from "CountryThemeSource") as sources`
  );
  return row.rows[0];
}

async function createFixture(pg: PgClient, runId: string): Promise<Fixture> {
  const code = "QF";
  const slug = `qa-publication-${runId.slice(0, 8)}`;
  const stale = await pg.query<{ slug: string }>('select slug from "CountryProfile" where code = $1', [code]);
  if (stale.rowCount) {
    if (!stale.rows[0].slug.startsWith("qa-publication-")) {
      throw new Error(`Refusing to reuse code ${code}: an unrelated profile already uses it.`);
    }
    await pg.query('delete from "CountryProfile" where code = $1', [code]);
  }

  const actorId = randomUUID();
  await pg.query(
    `insert into "User" (id, email, name, "actorType", "createdAt", "updatedAt")
     values ($1,$2,$3,'ADMIN'::"ActorType",now(),now())`,
    [actorId, `qa-publication-${runId.slice(0, 8)}@review.local`, "QA publication actor"]
  );
  await pg.query(
    `insert into "CountryProfile" (
       code, slug, name, region, introduction, "editorialStatus", "publicationStatus",
       "homeFeatured", "sortOrder", "createdAt", "updatedAt"
     ) values ($1,$2,'QA Publication Fixture','West Africa',$3,'REVIEWED'::"CountryEditorialStatus",'DRAFT'::"CountryPublicationStatus",false,9999,now(),now())`,
    [
      code,
      slug,
      "Run-owned draft fixture for publication-integrity verification. It is deleted after the test and is never shown as a public country guide."
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
       ) values ($1,$2,$3,$4,$5,$6,$7,'ILLUSTRATION',$8,$9,'REVIEWED'::"CountryEditorialStatus",now(),now())`,
      [
        themeId,
        code,
        `qa-publication-theme-${index}`,
        `QA publication theme ${index}`,
        "Run-owned fixture association long enough to satisfy editorial validation.",
        "/generated/countries/illustration-fruit.svg",
        `Vector illustration of fruit in a bowl, QA publication theme ${index}`,
        "Original code-native NaijaDeals vector illustration; run-owned QA fixture only",
        index - 1
      ]
    );
    await pg.query(
      `insert into "CountryThemeSource" (id, "themeId", title, publisher, url, "accessedAt", "sortOrder", "createdAt")
       values ($1,$2,$3,'NaijaDeals QA',$4,now(),0,now())`,
      [
        randomUUID(),
        themeId,
        `Run-owned publication source ${index}`,
        `https://qa-publication-${runId.slice(0, 8)}.example.org/source-${index}`
      ]
    );
  }
  return { code, slug, themeIds, actorId };
}

async function themeState(pg: PgClient, themeId: string) {
  const row = await pg.query<{
    imageUrl: string | null;
    imageAlt: string | null;
    imageKind: string | null;
    imageProvenance: string | null;
    editorialStatus: string;
    sources: Array<{ title: string; url: string }>;
  }>(
    `select t."imageUrl", t."imageAlt", t."imageKind", t."imageProvenance",
            t."editorialStatus"::text as "editorialStatus",
            coalesce(
              (select json_agg(json_build_object('title', s.title, 'url', s.url) order by s."sortOrder")
                 from "CountryThemeSource" s where s."themeId" = t.id),
              '[]'::json
            ) as sources
       from "CountryTheme" t where t.id = $1`,
    [themeId]
  );
  const value = row.rows[0];
  if (!value) throw new Error("fixture theme disappeared");
  return value;
}

async function latestThemeAudit(pg: PgClient, themeId: string) {
  const row = await pg.query<{ action: string; metadata: Record<string, unknown> }>(
    `select action, metadata from "AuditLog" where "entityId" = $1 order by "createdAt" desc limit 1`,
    [themeId]
  );
  const value = row.rows[0];
  if (!value) throw new Error("no audit row for the fixture theme");
  return value;
}

async function main() {
  const target = await requireCountryReviewDatabase();
  const pg = new Client({ connectionString: target.url, application_name: "naijadeals-country-publication" });
  await pg.connect();
  const before = await counts(pg);
  const runId = randomUUID();
  let fixture: Fixture | null = null;

  try {
    const service = await import("../lib/services/countries/discovery.service");
    const { publishCountry, unpublishCountry, updateCountryProfile, updateCountryTheme } = service;
    fixture = await createFixture(pg, runId);
    const actor = { id: fixture.actorId, actorType: "ADMIN", roles: [], vendors: [] } as unknown as Parameters<
      typeof publishCountry
    >[0];
    const theme = async (index = 0) => {
      assert(fixture, "fixture missing");
      const id = fixture.themeIds[index];
      return themeState(pg, id);
    };
    const update = async (index: number, input: Record<string, unknown>) => {
      assert(fixture, "fixture missing");
      return updateCountryTheme(actor, { themeId: fixture.themeIds[index], ...input });
    };

    await check("fixture is a run-owned DRAFT with 6 sourced imaged themes", async () => {
      const row = await pg.query<{ publicationStatus: string }>(
        'select "publicationStatus"::text as "publicationStatus" from "CountryProfile" where code = $1',
        [fixture!.code]
      );
      assert(row.rows[0]?.publicationStatus === "DRAFT", "fixture is not DRAFT");
      const states = await Promise.all(fixture!.themeIds.map((id) => themeState(pg, id)));
      assert(states.every((state) => state.imageUrl && state.imageAlt && state.imageKind && state.imageProvenance && state.sources.length === 1), "fixture theme is incomplete");
      return `${fixture!.code}/${fixture!.slug} themes=6`;
    });

    await check("publication refuses a theme without an image", async () => {
      await update(0, { imageUrl: null });
      await expectFailure(() => publishCountry(actor, fixture!.code), 409, "country_incomplete");
      await update(0, {
        imageUrl: "/generated/countries/illustration-fruit.svg",
        imageAlt: "Vector illustration of fruit in a bowl, QA publication theme 1",
        imageKind: "ILLUSTRATION",
        imageProvenance: "Original code-native NaijaDeals vector illustration; run-owned QA fixture only"
      });
      return "missing image refused without publishing";
    });

    await check("publication refuses a theme without alt text", async () => {
      await update(0, { imageAlt: null });
      await expectFailure(() => publishCountry(actor, fixture!.code), 409, "country_incomplete");
      await update(0, { imageAlt: "Vector illustration of fruit in a bowl, QA publication theme 1" });
      return "missing alt refused";
    });

    await check("publication refuses a theme without image provenance", async () => {
      await update(0, { imageProvenance: null });
      await expectFailure(() => publishCountry(actor, fixture!.code), 409, "country_incomplete");
      await update(0, { imageProvenance: "Original code-native NaijaDeals vector illustration; run-owned QA fixture only" });
      return "missing provenance refused";
    });

    await check("publication refuses an unsourced theme", async () => {
      await pg.query('delete from "CountryThemeSource" where "themeId" = $1', [fixture!.themeIds[0]]);
      await expectFailure(() => publishCountry(actor, fixture!.code), 409, "country_incomplete");
      await update(0, {
        sources: [
          {
            title: "Run-owned publication source restored",
            url: `https://qa-publication-${runId.slice(0, 8)}.example.org/restored-1`,
            accessedAt: new Date().toISOString().slice(0, 10)
          }
        ]
      });
      return "unsourced theme refused";
    });

    await check("publication refuses an unreviewed theme", async () => {
      await update(1, { editorialStatus: "NEEDS_REVIEW" });
      await expectFailure(() => publishCountry(actor, fixture!.code), 409, "country_incomplete");
      await update(1, { editorialStatus: "REVIEWED" });
      return "unreviewed theme refused";
    });

    await check("valid publication succeeds and records before/after audit", async () => {
      await publishCountry(actor, fixture!.code);
      const row = await pg.query<{ publicationStatus: string }>(
        'select "publicationStatus"::text as "publicationStatus" from "CountryProfile" where code = $1',
        [fixture!.code]
      );
      assert(row.rows[0]?.publicationStatus === "PUBLISHED", "fixture did not publish");
      const audit = await pg.query<{ metadata: Record<string, unknown> }>(
        `select metadata from "AuditLog" where "entityId" = $1 and action = 'country.publish' order by "createdAt" desc limit 1`,
        [fixture!.code]
      );
      const metadata = audit.rows[0]?.metadata as { before?: { publicationStatus?: string }; after?: { publicationStatus?: string } } | undefined;
      assert(metadata?.before?.publicationStatus === "DRAFT", "publish audit lacks the previous DRAFT state");
      assert(metadata?.after?.publicationStatus === "PUBLISHED", "publish audit lacks the PUBLISHED state");
      return "PUBLISHED with audit DRAFT → PUBLISHED";
    });

    await check("published theme refuses image removal and empty paths", async () => {
      const initial = await theme();
      await expectFailure(() => update(0, { imageUrl: null }), 409, "published_country_locked");
      await expectFailure(() => update(0, { imageUrl: "" }), 409, "published_country_locked");
      const after = await theme();
      assert(JSON.stringify(initial) === JSON.stringify(after), "refused removal changed the theme");
      return "null and empty image paths refused without change";
    });

    await check("published image change without matching alt text is refused atomically", async () => {
      const initial = await theme();
      await expectFailure(
        () =>
          update(0, {
            imageUrl: "/generated/countries/illustration-leaf.svg",
            imageKind: "ILLUSTRATION",
            imageProvenance: "Original code-native NaijaDeals vector illustration; run-owned QA fixture replacement"
          }),
        400,
        "validation_error"
      );
      const after = await theme();
      assert(JSON.stringify(initial) === JSON.stringify(after), "refused image change left partial data");
      return "image change without alt refused; theme unchanged";
    });

    await check("published image change without kind or provenance is refused atomically", async () => {
      const initial = await theme();
      await expectFailure(
        () =>
          update(0, {
            imageUrl: "/generated/countries/illustration-leaf.svg",
            imageAlt: "Vector illustration of a tobacco leaf for the QA fixture"
          }),
        400
      );
      const after = await theme();
      assert(JSON.stringify(initial) === JSON.stringify(after), "refused image change left partial data");
      return "image change without provenance refused; theme unchanged";
    });

    await check("published image change with alt + kind + provenance is accepted and audited", async () => {
      const prior = await theme();
      const provenance = "Original code-native NaijaDeals vector illustration; QA replacement with recorded provenance";
      await update(0, {
        imageUrl: "/generated/countries/illustration-leaf.svg",
        imageAlt: "Vector illustration of a tobacco leaf for the QA fixture",
        imageKind: "ILLUSTRATION",
        imageProvenance: provenance
      });
      const after = await theme();
      assert(after.imageUrl === "/generated/countries/illustration-leaf.svg", "new image was not saved");
      assert(after.imageKind === "ILLUSTRATION", "image kind was not saved");
      assert(after.imageProvenance === provenance, "image provenance was not saved");
      const audit = await latestThemeAudit(pg, fixture!.themeIds[0]);
      const metadata = audit.metadata as {
        before?: { imageUrl?: string; imageProvenance?: string };
        after?: { imageUrl?: string; imageProvenance?: string };
      };
      assert(metadata.before?.imageUrl === prior.imageUrl, "audit before.imageUrl is inaccurate");
      assert(metadata.after?.imageUrl === after.imageUrl, "audit after.imageUrl is inaccurate");
      assert(metadata.before?.imageProvenance === prior.imageProvenance, "audit before.imageProvenance is missing");
      assert(metadata.after?.imageProvenance === provenance, "audit after.imageProvenance is missing");
      return "image, alt, kind and provenance saved atomically with before/after audit";
    });

    await check("published theme refuses empty sources and duplicate source URLs", async () => {
      const initial = await theme();
      await expectFailure(() => update(0, { sources: [] }), 409, "published_country_locked");
      await expectFailure(
        () =>
          update(0, {
            sources: [
              { title: "Duplicate A", url: `https://qa-publication-${runId.slice(0, 8)}.example.org/duplicate`, accessedAt: "2026-11-13" },
              { title: "Duplicate B", url: `https://qa-publication-${runId.slice(0, 8)}.example.org/duplicate`, accessedAt: "2026-11-13" }
            ]
          }),
        400,
        "validation_error"
      );
      const after = await theme();
      assert(JSON.stringify(initial.sources) === JSON.stringify(after.sources), "refused source replacement changed sources");
      return "empty sources 409; duplicate URLs 400; sources unchanged";
    });

    await check("published source replacement serializes to exactly one complete set", async () => {
      const urls = [
        `https://qa-publication-${runId.slice(0, 8)}.example.org/replaced-1`,
        `https://qa-publication-${runId.slice(0, 8)}.example.org/replaced-2`
      ];
      await update(0, {
        sources: urls.map((url, index) => ({ title: `Replacement ${index + 1}`, url, accessedAt: "2026-11-13" }))
      });
      const after = await theme();
      assert(after.sources.length === 2, `expected 2 sources, found ${after.sources.length}`);
      assert(after.sources.every((source) => urls.includes(source.url)), "source set contains unrelated rows");
      const audit = await latestThemeAudit(pg, fixture!.themeIds[0]);
      const metadata = audit.metadata as { before?: { sources?: unknown[] }; after?: { sources?: unknown[] } };
      assert(Array.isArray(metadata.before?.sources), "audit before.sources is missing");
      assert(Array.isArray(metadata.after?.sources) && metadata.after.sources.length === 2, "audit after.sources is missing");
      return "exactly 2 replacement sources with before/after source content in the audit";
    });

    await check("published theme refuses alt, provenance and review removal", async () => {
      const initial = await theme();
      await expectFailure(() => update(0, { imageAlt: null }), 409, "published_country_locked");
      await expectFailure(() => update(0, { imageProvenance: null }), 409, "published_country_locked");
      await expectFailure(() => update(0, { editorialStatus: "NEEDS_REVIEW" }), 409, "published_country_locked");
      const after = await theme();
      assert(JSON.stringify(initial) === JSON.stringify(after), "refused published edit changed the theme");
      return "alt/provenance/review removal refused without change";
    });

    await check("unpublish preserves every theme and source", async () => {
      await unpublishCountry(actor, fixture!.code);
      const states = await Promise.all(fixture!.themeIds.map((id) => themeState(pg, id)));
      assert(states.length === 6 && states.every((state) => state.sources.length > 0), "unpublish removed content");
      const row = await pg.query<{ publicationStatus: string }>(
        'select "publicationStatus"::text as "publicationStatus" from "CountryProfile" where code = $1',
        [fixture!.code]
      );
      assert(row.rows[0]?.publicationStatus === "DRAFT", "fixture is not DRAFT after unpublish");
      return "DRAFT with 6 themed source sets preserved";
    });

    await check("unpublished draft records before/after media, alt, provenance and source content", async () => {
      const prior = await theme(1);
      await update(1, {
        imageUrl: "/generated/countries/illustration-flower.svg",
        imageAlt: "Vector illustration of a flower for the QA publication fixture",
        imageKind: "ILLUSTRATION",
        imageProvenance: "Original code-native NaijaDeals vector illustration; QA draft audit check",
        sources: [
          {
            title: "Draft audit source",
            url: `https://qa-publication-${runId.slice(0, 8)}.example.org/draft-audit`,
            accessedAt: "2026-11-13"
          }
        ]
      });
      const audit = await latestThemeAudit(pg, fixture!.themeIds[1]);
      const metadata = audit.metadata as {
        before?: { imageUrl?: string; imageAlt?: string; imageProvenance?: string; sources?: unknown[] };
        after?: { imageUrl?: string; imageAlt?: string; imageProvenance?: string; sources?: unknown[] };
      };
      assert(metadata.before?.imageUrl === prior.imageUrl, "draft audit before.imageUrl missing");
      assert(metadata.before?.imageAlt === prior.imageAlt, "draft audit before.imageAlt missing");
      assert(metadata.before?.imageProvenance === prior.imageProvenance, "draft audit before.imageProvenance missing");
      assert(Array.isArray(metadata.before?.sources) && metadata.before.sources.length === 1, "draft audit before.sources missing");
      assert(metadata.after?.imageUrl === "/generated/countries/illustration-flower.svg", "draft audit after.imageUrl missing");
      assert(metadata.after?.imageAlt === "Vector illustration of a flower for the QA publication fixture", "draft audit after.imageAlt missing");
      assert(metadata.after?.imageProvenance === "Original code-native NaijaDeals vector illustration; QA draft audit check", "draft audit after.imageProvenance missing");
      assert(Array.isArray(metadata.after?.sources) && metadata.after.sources.length === 1, "draft audit after.sources missing");
      return "before/after image, alt, provenance and sources recorded for the unpublished draft";
    });

    await check("unpublished draft records country introduction before/after content", async () => {
      const before = await pg.query<{ introduction: string }>(
        'select introduction from "CountryProfile" where code = $1',
        [fixture!.code]
      );
      const nextIntroduction =
        "Run-owned draft introduction updated by the publication-integrity test so the audit content can be verified for an unpublished country.";
      assert(nextIntroduction.length >= 80, "test introduction is too short");
      await updateCountryProfile(actor, { code: fixture!.code, introduction: nextIntroduction });
      const audit = await pg.query<{ metadata: Record<string, unknown> }>(
        `select metadata from "AuditLog" where "entityId" = $1 and action = 'country.editorial.update' order by "createdAt" desc limit 1`,
        [fixture!.code]
      );
      const metadata = audit.rows[0]?.metadata as {
        before?: { introduction?: string };
        after?: { introduction?: string };
      };
      assert(metadata?.before?.introduction === before.rows[0].introduction, "draft audit before.introduction is inaccurate");
      assert(metadata?.after?.introduction === nextIntroduction, "draft audit after.introduction is inaccurate");
      return "before/after introduction content recorded for the unpublished draft";
    });

    await check("accepted country counts are untouched while the fixture exists", async () => {
      const current = await counts(pg);
      assert(current.profiles === before.profiles + 1, `profile count changed unexpectedly: ${current.profiles}`);
      assert(current.themes === before.themes + 6, `theme count changed unexpectedly: ${current.themes}`);
      const fixtureSources = await pg.query<{ n: number }>(
        `select count(*)::int as n from "CountryThemeSource" where "themeId" = any($1::text[])`,
        [fixture!.themeIds]
      );
      assert(
        current.sources === before.sources + fixtureSources.rows[0].n,
        "source count differs from fixture-only additions"
      );
      const published = await pg.query<{ n: number }>(
        `select count(*)::int as n from "CountryProfile" where "publicationStatus" = 'PUBLISHED'`
      );
      assert(published.rows[0].n === 54, `expected 54 accepted published countries, found ${published.rows[0].n}`);
      return `accepted 54 profiles plus one DRAFT fixture; published=${published.rows[0].n}`;
    });
  } finally {
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
    const after = await counts(pg);
    console.log(JSON.stringify({ cleanup: { before, after, restored: JSON.stringify(before) === JSON.stringify(after) } }, null, 2));
    if (JSON.stringify(before) !== JSON.stringify(after)) process.exitCode = 1;
    await pg.end();
  }

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_PUBLICATION_TESTS_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
