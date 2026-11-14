/**
 * Discover Africa acceptance against a running candidate build on REVIEW.
 *
 * This script is intentionally NOT run against the current canonical 3047
 * preview: the coordinator builds the candidate from the reviewed workspace and
 * runs this file. It never unpublishes an accepted country. Draft publication,
 * public visibility and permission separation are exercised on a uniquely
 * run-owned DRAFT fixture that is deleted afterwards.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=<review connection> BASE_URL=http://localhost:<candidate> \
 *     COUNTRY_ROLE_CREDENTIALS=<dir from scripts/review-country-role-setup.ts setup> \
 *     node scripts/country-discovery-acceptance.cjs
 *
 * The shared TypeScript guard is registered through tsx in this CommonJS
 * entrypoint so the URL, current_database() and REVIEW classification are
 * verified exactly as the seed and fixture scripts verify them.
 */
require("tsx/cjs");
const { existsSync, readFileSync, rmSync } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { verifyCountryReviewDatabase, sanitizeCountryReviewError } = require("./lib/country-review-db.ts");
const { cleanupReviewCountryRoles } = require("./review-country-role-setup.ts");

const BASE = process.env.BASE_URL || "http://localhost:3047";
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  console.log(`${status === "PASS" ? "PASS" : status === "BLOCKED" ? "BLOCKED" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function check(name, ok, detail = "") {
  record(name, ok ? "PASS" : "FAIL", detail);
}
function blocked(name, detail) {
  record(name, "BLOCKED", detail);
}

function credential(pathname) {
  const [email, password] = readFileSync(pathname, "utf8").trim().split(/\r?\n/);
  return { email, password };
}
function roleCredentials(directory, key) {
  if (!directory) return null;
  const file = path.join(directory, `${key}.json`);
  if (!existsSync(file)) return null;
  const value = JSON.parse(readFileSync(file, "utf8"));
  return { email: value.email, password: value.password, userId: value.userId };
}

async function login({ email, password }) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`login failed for ${email}: ${response.status}`);
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies.map((value) => value.split(";")[0]).join("; ");
}
async function req(pathname, cookie, init = {}) {
  return fetch(`${BASE}${pathname}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.body ? { "Content-Type": "application/json", Origin: BASE } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {})
    }
  });
}
async function jsonBody(response) {
  return response.json().catch(() => null);
}

function isRecordedWorkflowFixture(profile) {
  return profile.slug.startsWith("qa-acceptance-");
}

async function createDraftFixture(prisma, run) {
  const code = "QT";
  const slug = `qa-acceptance-${run.slice(0, 8)}`;
  const existing = await prisma.countryProfile.findUnique({ where: { code } });
  if (existing) {
    if (!isRecordedWorkflowFixture(existing)) {
      throw new Error(`Refusing to reuse country code ${code}: an unrelated profile exists.`);
    }
    await prisma.countryProfile.delete({ where: { code } });
  }
  const themes = Array.from({ length: 6 }, (_, index) => ({
    key: `qa-acceptance-theme-${index + 1}`,
    label: `QA acceptance theme ${index + 1}`,
    association: "Run-owned acceptance association long enough for country publication validation.",
    imageUrl: "/generated/countries/illustration-fruit.svg",
    imageAlt: `Vector illustration of fruit in a bowl, QA acceptance theme ${index + 1}`,
    imageKind: "ILLUSTRATION",
    imageProvenance: "Original code-native NaijaDeals vector illustration; run-owned acceptance fixture only",
    sortOrder: index,
    editorialStatus: "REVIEWED",
    sources: {
      create: [
        {
          title: `Run-owned acceptance source ${index + 1}`,
          publisher: "NaijaDeals QA",
          url: `https://qa-acceptance-${run.slice(0, 8)}.example.org/source-${index + 1}`,
          accessedAt: new Date(),
          sortOrder: 0
        }
      ]
    }
  }));
  const profile = await prisma.countryProfile.create({
    data: {
      code,
      slug,
      name: "QA Acceptance Fixture",
      region: "West Africa",
      localizedNames: { en: "QA Acceptance Fixture" },
      introduction:
        "Run-owned draft fixture used to verify Discover Africa preview, publication and unpublishing. It is deleted at the end of acceptance and is never an accepted country guide.",
      editorialStatus: "REVIEWED",
      publicationStatus: "DRAFT",
      homeFeatured: false,
      sortOrder: 9999,
      themes: { create: themes }
    },
    include: { themes: { include: { sources: true } } }
  });
  return { profile, code, slug };
}

async function createProductFixture(prisma, run) {
  const category = await prisma.category.findFirst({
    where: { isActive: true, deprecatedAt: null },
    orderBy: { slug: "asc" },
    select: { id: true }
  });
  if (!category) throw new Error("No active category exists for the run-owned origin product.");
  const slugBase = `qa-acceptance-product-${run.slice(0, 8)}`;
  const owner = await prisma.user.create({
    data: { email: `qa-acceptance-${run}-owner@review.local`, name: "QA acceptance owner", actorType: "CUSTOMER" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id,
      name: `QA Acceptance Vendor ${run.slice(0, 8)}`,
      slug: `qa-acceptance-vendor-${run.slice(0, 8)}`,
      market: "Lagos",
      description: "Run-owned acceptance vendor.",
      pickupAddress: "Run-owned acceptance pickup address",
      pickupPhone: "08000000000",
      countryCode: "NG",
      status: "VERIFIED"
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `QA Acceptance Product ${run.slice(0, 8)}`,
      slug: slugBase,
      description: "Run-owned acceptance product for origin scope verification.",
      priceKobo: BigInt(100000),
      countryCode: "NG",
      status: "ACTIVE",
      isDemo: false,
      isSample: false
    }
  });
  return { owner, vendor, product };
}

async function main() {
  const target = await verifyCountryReviewDatabase();
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  const run = randomUUID();
  const credentialsDir = process.argv.find((arg) => arg.startsWith("--credentials-dir="))?.slice("--credentials-dir=".length) || process.env.COUNTRY_ROLE_CREDENTIALS || "";
  let roleRun = null;
  if (credentialsDir && existsSync(path.join(credentialsDir, "manifest.json"))) {
    try {
      roleRun = JSON.parse(readFileSync(path.join(credentialsDir, "manifest.json"), "utf8")).run ?? null;
    } catch {
      roleRun = null;
    }
  }
  let fixture = null;
  let productFixture = null;
  const countsBefore = await prisma.$transaction([
    prisma.countryProfile.count(),
    prisma.countryProfile.count({ where: { publicationStatus: "PUBLISHED" } }),
    prisma.countryTheme.count(),
    prisma.countryThemeSource.count()
  ]);

  try {
    const admin = credential("qa-artifacts/review-basket/.admin-credential");
    const scoped = credential("qa-artifacts/review-basket/.gh-admin-credential");
    const adminCookie = await login(admin);
    const scopedCookie = await login(scoped);

    const profiles = await prisma.countryProfile.findMany({ include: { themes: { include: { sources: true } } } });
    const published = profiles.filter((row) => row.publicationStatus === "PUBLISHED");
    const themeCount = profiles.reduce((sum, row) => sum + row.themes.length, 0);
    const sourceCount = profiles.reduce((sum, row) => sum + row.themes.reduce((n, theme) => n + theme.sources.length, 0), 0);
    check("54 country profiles exist", profiles.length === 54, String(profiles.length));
    check("54 country profiles published", published.length === 54, String(published.length));
    check("324 themes exist", themeCount === 324, String(themeCount));
    check("362 source records exist", sourceCount === 362, String(sourceCount));
    check("every theme has a source", profiles.every((row) => row.themes.every((theme) => theme.sources.length > 0)));
    check("every theme has image + alt + kind + provenance", profiles.every((row) => row.themes.every((theme) => theme.imageUrl && theme.imageAlt && theme.imageKind && theme.imageProvenance)));
    check("all themes editorially reviewed", profiles.every((row) => row.themes.every((theme) => theme.editorialStatus === "REVIEWED")));

    const directory = await req("/naijashop/countries");
    const directoryHtml = await directory.text();
    const slugs = new Set([...directoryHtml.matchAll(/href="\/naijashop\/countries\/([a-z0-9-]+)"/g)].map((match) => match[1]));
    check("directory returns 200", directory.status === 200, String(directory.status));
    check("directory lists all 54 slugs", slugs.size === 54, String(slugs.size));
    check("directory states 54 of 54", /54(?:<!-- -->)? of (?:<!-- -->)?54(?:<!-- -->)? country guides shown/.test(directoryHtml));

    let pagesOk = 0;
    let themesOk = 0;
    for (const row of profiles) {
      const response = await req(`/naijashop/countries/${row.slug}`);
      const html = await response.text();
      if (response.status === 200 && html.includes("data-country-hero") && html.includes("Known for") && html.includes("Available on NaijaDeals")) pagesOk += 1;
      if (row.themes.every((theme) => html.includes(theme.label))) themesOk += 1;
    }
    check("all 54 country pages render", pagesOk === 54, `${pagesOk}/54`);
    check("all 54 pages show their six theme labels", themesOk === 54, `${themesOk}/54`);
    check("unknown country is 404", (await req("/naijashop/countries/not-a-country")).status === 404);
    check("Western Sahara is documented separately, not a 55th page", (await req("/naijashop/countries/western-sahara")).status === 404);

    const ghLeak = await prisma.product.findMany({
      where: { vendor: { countryCode: "GH" }, OR: [{ originCountryCode: null }, { originCountryCode: { not: "GH" } }] },
      select: { name: true },
      take: 3
    });
    const ghHtml = await (await req("/naijashop/countries/ghana")).text();
    check("Ghana seller location is not used as origin", ghLeak.every((product) => !ghHtml.includes(product.name)), `${ghLeak.length} non-GH-origin seller products checked`);

    const browse = await req("/naijashop/countries/ghana", null, { headers: { Cookie: "nd_country=NG" } });
    const setCookie = browse.headers.getSetCookie?.() ?? [];
    check("browsing a country does not change delivery country", browse.status === 200 && !setCookie.some((value) => /nd_country=GH/i.test(value)), setCookie.join(" | ") || "no country cookie written");

    const adminList = await req("/api/admin/country-discovery", adminCookie);
    const adminRows = await adminList.json();
    check("admin can read 54 editorial rows", adminList.status === 200 && adminRows.length === 54, `${adminList.status}`);

    const dzForbidden = await req("/api/admin/country-discovery", scopedCookie, {
      method: "PATCH",
      body: JSON.stringify({ code: "DZ", sortOrder: 1 })
    });
    check("GH-scoped admin cannot edit DZ", dzForbidden.status === 403, String(dzForbidden.status));
    const publishForbidden = await req("/api/admin/country-discovery", scopedCookie, {
      method: "PATCH",
      body: JSON.stringify({ code: "DZ", action: "unpublish" })
    });
    check("GH-scoped admin cannot publish/unpublish DZ", publishForbidden.status === 403, String(publishForbidden.status));
    const ghPublishForbidden = await req("/api/admin/country-discovery", scopedCookie, {
      method: "PATCH",
      body: JSON.stringify({ code: "GH", action: "unpublish" })
    });
    check("ordinary admin role cannot publish even its own country", ghPublishForbidden.status === 403, String(ghPublishForbidden.status));
    const foreignAudit = await req("/api/admin/country-discovery/audit?code=DZ", scopedCookie);
    check("GH-scoped admin cannot read DZ audit", foreignAudit.status === 403, String(foreignAudit.status));

    const dzProfile = profiles.find((row) => row.code === "DZ");
    const publishedTheme = dzProfile.themes[0];
    const driftTheme = await req("/api/admin/country-discovery/themes", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ themeId: publishedTheme.id, imageUrl: null })
    });
    check("published theme cannot lose its image without unpublishing", driftTheme.status === 409, String(driftTheme.status));
    const emptyImage = await req("/api/admin/country-discovery/themes", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ themeId: publishedTheme.id, imageUrl: "" })
    });
    check("empty image path cannot bypass the published-theme lock", emptyImage.status === 409, String(emptyImage.status));
    const imageWithoutProvenance = await req("/api/admin/country-discovery/themes", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({
        themeId: publishedTheme.id,
        imageUrl: "/generated/countries/illustration-fruit.svg",
        imageAlt: "Acceptance replacement alt",
        imageKind: "ILLUSTRATION"
      })
    });
    check("published image change without provenance is refused", imageWithoutProvenance.status === 409 || imageWithoutProvenance.status === 400, String(imageWithoutProvenance.status));
    const driftCountry = await req("/api/admin/country-discovery", adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ code: "DZ", editorialStatus: "NEEDS_REVIEW" })
    });
    check("published country cannot be marked unreviewed in place", driftCountry.status === 409, String(driftCountry.status));

    const roles = await prisma.role.findMany({ where: { name: { in: ["country_editor", "country_publisher", "country_origin_reviewer"] } }, select: { name: true } });
    check("separated country roles exist", roles.length === 3, roles.map((role) => role.name).join(","));

    fixture = await createDraftFixture(prisma, run);
    productFixture = await createProductFixture(prisma, run);
    const fixtureSlug = fixture.slug;
    const fixtureCode = fixture.code;
    const fixtureThemeId = fixture.profile.themes[0].id;
    const fixtureLabels = fixture.profile.themes.map((theme) => theme.label);

    check("run-owned draft is not public", (await req(`/naijashop/countries/${fixtureSlug}`)).status === 404);

    // ---- Credentialed role matrix -----------------------------------------
    const editorCred = roleCredentials(credentialsDir, "editor");
    const publisherCred = roleCredentials(credentialsDir, "publisher");
    const originCred = roleCredentials(credentialsDir, "origin");
    const adminProbeCred = roleCredentials(credentialsDir, "admin");
    const editorGhCred = roleCredentials(credentialsDir, "editor-gh");
    const publisherGhCred = roleCredentials(credentialsDir, "publisher-gh");
    const originNgCred = roleCredentials(credentialsDir, "origin-ng");
    const originGhCred = roleCredentials(credentialsDir, "origin-gh");
    const platformRoleCreds = [editorCred, publisherCred, originCred, adminProbeCred];
    const scopedRoleCreds = [editorGhCred, publisherGhCred, originNgCred, originGhCred];

    if (platformRoleCreds.some((value) => !value) || scopedRoleCreds.some((value) => !value)) {
      blocked(
        "dedicated editor/publisher/origin/scoped permission matrix",
        "COUNTRY_ROLE_CREDENTIALS was not supplied. Run: REVIEW_DATABASE_URL=… npx tsx scripts/review-country-role-setup.ts setup --run=<run> and pass its directory."
      );
    } else {
      const editorCookie = await login(editorCred);
      const publisherCookie = await login(publisherCred);
      const originCookie = await login(originCred);
      const adminProbeCookie = await login(adminProbeCred);
      const editorGhCookie = await login(editorGhCred);
      const publisherGhCookie = await login(publisherGhCred);
      const originNgCookie = await login(originNgCred);
      const originGhCookie = await login(originGhCred);

      const editorList = await req("/api/admin/country-discovery", editorCookie);
      const editorRows = await editorList.json();
      check("dedicated country_editor can read 54 editorial rows", editorList.status === 200 && editorRows.length === 54, `${editorList.status}`);
      const editorEdit = await req("/api/admin/country-discovery", editorCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, introduction: fixture.profile.introduction })
      });
      check("country_editor can edit country content", editorEdit.status === 200, String(editorEdit.status));
      const editorTheme = await req("/api/admin/country-discovery/themes", editorCookie, {
        method: "PATCH",
        body: JSON.stringify({ themeId: fixtureThemeId, label: fixture.profile.themes[0].label })
      });
      check("country_editor can edit theme content", editorTheme.status === 200, String(editorTheme.status));
      const editorPublish = await req("/api/admin/country-discovery", editorCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "publish" })
      });
      check("country_editor cannot publish", editorPublish.status === 403, String(editorPublish.status));
      const editorUnpublish = await req("/api/admin/country-discovery", editorCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "unpublish" })
      });
      check("country_editor cannot unpublish", editorUnpublish.status === 403, String(editorUnpublish.status));
      const editorOrigin = await req("/api/admin/country-discovery/origin", editorCookie);
      check("country_editor cannot open origin review", editorOrigin.status === 403, String(editorOrigin.status));

      const publisherEdit = await req("/api/admin/country-discovery", publisherCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, introduction: fixture.profile.introduction })
      });
      check("country_publisher cannot edit country content", publisherEdit.status === 403, String(publisherEdit.status));
      const publisherOrigin = await req("/api/admin/country-discovery/origin", publisherCookie);
      check("country_publisher cannot open origin review", publisherOrigin.status === 403, String(publisherOrigin.status));

      const originList = await req("/api/admin/country-discovery/origin?page=1&pageSize=5", originCookie);
      const originPage = await jsonBody(originList);
      check(
        "origin reviewer receives paginated rows with totals",
        originList.status === 200 &&
          Array.isArray(originPage?.rows) &&
          originPage.rows.length <= 5 &&
          Number.isInteger(originPage.total) &&
          originPage.summary?.total === originPage.total &&
          Array.isArray(originPage.countries) &&
          originPage.countries.length === 54,
        `status=${originList.status} total=${originPage?.total} pageSize=${originPage?.pageSize} countries=${originPage?.countries?.length}`
      );
      const originPublish = await req("/api/admin/country-discovery", originCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "publish" })
      });
      check("origin reviewer cannot publish", originPublish.status === 403, String(originPublish.status));
      const originEdit = await req("/api/admin/country-discovery", originCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, introduction: fixture.profile.introduction })
      });
      check("origin reviewer cannot edit country content", originEdit.status === 403, String(originEdit.status));

      const adminPublish = await req("/api/admin/country-discovery", adminProbeCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "publish" })
      });
      check("ordinary admin cannot publish", adminPublish.status === 403, String(adminPublish.status));
      const adminOrigin = await req("/api/admin/country-discovery/origin", adminProbeCookie);
      check("ordinary admin cannot open origin review", adminOrigin.status === 403, String(adminOrigin.status));
      const adminEdit = await req("/api/admin/country-discovery", adminProbeCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, introduction: fixture.profile.introduction })
      });
      check("ordinary admin can still edit country content", adminEdit.status === 200, String(adminEdit.status));

      const editorGhList = await req("/api/admin/country-discovery", editorGhCookie);
      const editorGhRows = await editorGhList.json();
      check("GH-scoped editor list is limited to GH", editorGhList.status === 200 && Array.isArray(editorGhRows) && editorGhRows.length === 1 && editorGhRows[0]?.code === "GH", `${editorGhList.status} rows=${Array.isArray(editorGhRows) ? editorGhRows.length : "?"}`);
      const editorGhFixtureEdit = await req("/api/admin/country-discovery", editorGhCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, introduction: fixture.profile.introduction })
      });
      check("GH-scoped editor cannot edit another market", editorGhFixtureEdit.status === 403, String(editorGhFixtureEdit.status));
      const ghProfile = profiles.find((row) => row.code === "GH");
      const editorGhEdit = await req("/api/admin/country-discovery", editorGhCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: "GH", introduction: ghProfile.introduction })
      });
      check("GH-scoped editor can edit GH", editorGhEdit.status === 200, String(editorGhEdit.status));
      const editorGhPublish = await req("/api/admin/country-discovery", editorGhCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: "GH", action: "publish" })
      });
      check("GH-scoped editor cannot publish", editorGhPublish.status === 403, String(editorGhPublish.status));
      check("GH-scoped editor cannot read DZ audit", (await req("/api/admin/country-discovery/audit?code=DZ", editorGhCookie)).status === 403);
      check("GH-scoped editor can read GH audit", (await req("/api/admin/country-discovery/audit?code=GH", editorGhCookie)).status === 200);
      const publisherGhPublish = await req("/api/admin/country-discovery", publisherGhCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "publish" })
      });
      check("GH-scoped publisher cannot publish another market", publisherGhPublish.status === 403, String(publisherGhPublish.status));

      const foreignOrigin = await req("/api/admin/country-discovery/origin", originNgCookie, {
        method: "PATCH",
        body: JSON.stringify({
          productId: productFixture.product.id,
          originCountryCode: "GH",
          originBasis: "SELLER_DECLARED",
          originNote: "Run-owned acceptance foreign-origin declaration for an NG-market product."
        })
      });
      check("NG-scoped origin reviewer can record a GH origin for an NG product", foreignOrigin.status === 200, String(foreignOrigin.status));
      const verifiedOrigin = await req("/api/admin/country-discovery/origin", originNgCookie, {
        method: "PATCH",
        body: JSON.stringify({
          productId: productFixture.product.id,
          originCountryCode: "GH",
          originBasis: "VERIFIED",
          originNote: "Run-owned acceptance verification: producer invoice and export certificate were checked by the reviewer."
        })
      });
      const verifiedBody = await jsonBody(verifiedOrigin);
      check(
        "NG-scoped origin reviewer can record a verified foreign origin",
        verifiedOrigin.status === 200 && verifiedBody?.originBasis === "VERIFIED" && Boolean(verifiedBody?.originVerifiedAt),
        `${verifiedOrigin.status} basis=${verifiedBody?.originBasis}`
      );
      const filteredOrigins = await req(
        `/api/admin/country-discovery/origin?search=${encodeURIComponent(productFixture.product.name)}&origin=recorded&basis=VERIFIED&page=1&pageSize=5`,
        originNgCookie
      );
      const filteredBody = await jsonBody(filteredOrigins);
      check(
        "origin filters return the verified run-owned record",
        filteredOrigins.status === 200 && filteredBody?.total === 1 && filteredBody?.rows?.[0]?.id === productFixture.product.id,
        `status=${filteredOrigins.status} total=${filteredBody?.total}`
      );
      const crossOrigin = await req("/api/admin/country-discovery/origin", originGhCookie, {
        method: "PATCH",
        body: JSON.stringify({
          productId: productFixture.product.id,
          originCountryCode: "GH",
          originBasis: "SELLER_DECLARED",
          originNote: "Cross-market acceptance attempt."
        })
      });
      check("GH-scoped origin reviewer cannot change an NG product", crossOrigin.status === 403, String(crossOrigin.status));
    }

    // ---- Draft preview → publish → public 200 → unpublish → public 404 ----
    if (platformRoleCreds.every(Boolean)) {
      const editorCookie = await login(editorCred);
      const publisherCookie = await login(publisherCred);
      const preview = await req(`/naijashop/countries/${fixtureSlug}?preview=1`, editorCookie);
      const previewHtml = await preview.text();
      check(
        "authorized draft preview renders with all six theme labels",
        preview.status === 200 && previewHtml.includes("DRAFT PREVIEW") && fixtureLabels.every((label) => previewHtml.includes(label)),
        String(preview.status)
      );
      const foreignPreview = await req(`/naijashop/countries/${fixtureSlug}?preview=1`, editorGhCookie);
      check("GH-scoped editor cannot preview another market's draft", foreignPreview.status === 404, String(foreignPreview.status));
      const publish = await req("/api/admin/country-discovery", publisherCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "publish" })
      });
      check("publisher publishes the run-owned fixture", publish.status === 200, String(publish.status));
      const publicPage = await req(`/naijashop/countries/${fixtureSlug}`);
      const publicHtml = await publicPage.text();
      check(
        "published fixture is public with all six theme labels",
        publicPage.status === 200 && fixtureLabels.every((label) => publicHtml.includes(label)),
        String(publicPage.status)
      );
      const unpublish = await req("/api/admin/country-discovery", publisherCookie, {
        method: "PATCH",
        body: JSON.stringify({ code: fixtureCode, action: "unpublish" })
      });
      check("publisher unpublishes the run-owned fixture", unpublish.status === 200, String(unpublish.status));
      check("unpublished fixture is not public", (await req(`/naijashop/countries/${fixtureSlug}`)).status === 404);
      const previewAgain = await req(`/naijashop/countries/${fixtureSlug}?preview=1`, editorCookie);
      check("unpublished fixture remains available to authorized preview", previewAgain.status === 200, String(previewAgain.status));
    } else {
      blocked("draft preview → publish → public → unpublish lifecycle", "Dedicated editor/publisher credentials were not supplied.");
    }

    const acceptedStillPublic = await req(`/naijashop/countries/${dzProfile.slug}`);
    check("accepted DZ country remains published after fixture unpublishing", acceptedStillPublic.status === 200, String(acceptedStillPublic.status));
    check(
      "no accepted country was unpublished",
      (await prisma.countryProfile.count({ where: { publicationStatus: "PUBLISHED" } })) === 54,
      String(await prisma.countryProfile.count({ where: { publicationStatus: "PUBLISHED" } }))
    );
  } finally {
    if (fixture) {
      const themeIds = fixture.profile.themes.map((theme) => theme.id);
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [fixture.code, ...themeIds] } } }).catch(() => undefined);
      await prisma.systemEvent.deleteMany({ where: { entityId: { in: [fixture.code, ...themeIds] } } }).catch(() => undefined);
      await prisma.countryProfile.delete({ where: { code: fixture.code } }).catch(() => undefined);
    }
    if (productFixture) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [productFixture.product.id, productFixture.vendor.id] } } }).catch(() => undefined);
      await prisma.systemEvent.deleteMany({ where: { entityId: { in: [productFixture.product.id, productFixture.vendor.id] } } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: productFixture.product.id } }).catch(() => undefined);
      await prisma.vendor.delete({ where: { id: productFixture.vendor.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: productFixture.owner.id } }).catch(() => undefined);
    }
    if (roleRun) {
      const cleanup = await cleanupReviewCountryRoles(prisma, roleRun).catch((error) => ({
        removed: 0,
        remaining: 1,
        emails: [String(error?.message || "cleanup failed")]
      }));
      check("run-owned role accounts were removed", cleanup.remaining === 0, `removed=${cleanup.removed} remaining=${cleanup.remaining}`);
      if (process.env.KEEP_COUNTRY_ROLE_CREDENTIALS !== "1") {
        rmSync(credentialsDir, { recursive: true, force: true });
      }
    } else if (credentialsDir) {
      blocked("run-owned role account cleanup", "manifest.json was not found in COUNTRY_ROLE_CREDENTIALS.");
    }
    const countsAfter = await prisma.$transaction([
      prisma.countryProfile.count(),
      prisma.countryProfile.count({ where: { publicationStatus: "PUBLISHED" } }),
      prisma.countryTheme.count(),
      prisma.countryThemeSource.count()
    ]);
    check("accepted 54/324/362 counts restored after fixture deletion", JSON.stringify(countsBefore) === JSON.stringify(countsAfter), `${countsBefore.join("/")} → ${countsAfter.join("/")}`);
    const fixtureRowsGone = productFixture
      ? (await prisma.product.count({ where: { id: productFixture.product.id } })) === 0 &&
        (await prisma.vendor.count({ where: { id: productFixture.vendor.id } })) === 0 &&
        (await prisma.user.count({ where: { id: productFixture.owner.id } })) === 0
      : true;
    check("run-owned origin product, vendor and owner were removed", fixtureRowsGone, String(fixtureRowsGone));
    await prisma.$disconnect();
  }

  const failed = results.filter((row) => row.status === "FAIL").length;
  const blockedCount = results.filter((row) => row.status === "BLOCKED").length;
  console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, failed, blocked: blockedCount, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_DISCOVERY_ACCEPTANCE_FAILED: ${sanitizeCountryReviewError(error)}`);
  process.exitCode = 1;
});
