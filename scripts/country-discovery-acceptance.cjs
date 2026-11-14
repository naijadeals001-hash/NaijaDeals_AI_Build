/**
 * Accepted-country discovery acceptance against a running REVIEW preview.
 * Usage: DATABASE_URL=<review> BASE_URL=http://localhost:3047 node scripts/country-discovery-acceptance.cjs
 */
const { readFileSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3047";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function credential(path) {
  const [email, password] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  return { email, password };
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
async function req(path, cookie, init = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.body ? { "Content-Type": "application/json", Origin: BASE } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {})
    }
  });
}
async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  let databaseName = "";
  try { databaseName = new URL(databaseUrl).pathname.replace(/^\//, ""); } catch {}
  if (!databaseName || !/(review|test)/i.test(databaseName)) {
    throw new Error(`Refusing acceptance on ${databaseName || "an unidentified database"}; set DATABASE_URL to an isolated REVIEW/test database.`);
  }
  const classifications = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!classifications.some((row) => row.classification === "REVIEW")) {
    throw new Error(`Refusing acceptance: ${databaseName} is not classified REVIEW.`);
  }
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
  check("every theme has image + alt", profiles.every((row) => row.themes.every((theme) => theme.imageUrl && theme.imageAlt)));
  check("all themes editorially reviewed", profiles.every((row) => row.themes.every((theme) => theme.editorialStatus === "REVIEWED")));

  const directory = await req("/naijashop/countries");
  const directoryHtml = await directory.text();
  const slugs = new Set([...directoryHtml.matchAll(/href="\/naijashop\/countries\/([a-z0-9-]+)"/g)].map((m) => m[1]));
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
  const ghProfile = profiles.find((row) => row.code === "GH");
  const ghWrite = await req("/api/admin/country-discovery", scopedCookie, {
    method: "PATCH",
    body: JSON.stringify({ code: "GH", introduction: ghProfile.introduction })
  });
  check("GH-scoped admin can edit GH", ghWrite.status === 200, String(ghWrite.status));

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
  const dzTheme = profiles.find((row) => row.code === "DZ").themes[0];
  const foreignTheme = await req("/api/admin/country-discovery/themes", scopedCookie, {
    method: "PATCH",
    body: JSON.stringify({ themeId: dzTheme.id, label: "Foreign edit" })
  });
  check("GH-scoped admin cannot edit a DZ theme", foreignTheme.status === 403, String(foreignTheme.status));
  const roles = await prisma.role.findMany({ where: { name: { in: ["country_publisher", "country_origin_reviewer"] } }, select: { name: true } });
  check("separated country roles exist", roles.length === 2, roles.map((role) => role.name).join(","));

  const ngProduct = await prisma.product.findFirst({ where: { countryCode: "NG" }, select: { id: true } });
  const originForbidden = await req("/api/admin/country-discovery/origin", scopedCookie, {
    method: "PATCH",
    body: JSON.stringify({ productId: ngProduct.id, originCountryCode: "GH", originBasis: "SELLER_DECLARED", originNote: "scope check" })
  });
  check("GH-scoped admin cannot review an NG product origin", originForbidden.status === 403, String(originForbidden.status));
  const anonymousMutation = await req("/api/admin/country-discovery", null, { method: "PATCH", body: JSON.stringify({ code: "DZ", sortOrder: 1 }) });
  check("anonymous admin mutation is refused", [401, 403].includes(anonymousMutation.status), String(anonymousMutation.status));

  const publishedTheme = profiles.find((row) => row.code === "DZ").themes[0];
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
  const driftCountry = await req("/api/admin/country-discovery", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ code: "DZ", editorialStatus: "NEEDS_REVIEW" })
  });
  check("published country cannot be marked unreviewed in place", driftCountry.status === 409, String(driftCountry.status));

  const unpublish = await req("/api/admin/country-discovery", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ code: "DZ", action: "unpublish" })
  });
  check("super admin can unpublish DZ", unpublish.status === 200, String(unpublish.status));
  check("unpublished country is 404 publicly", (await req("/naijashop/countries/algeria")).status === 404);
  check("unpublished country is 200 in authorized preview", (await req("/naijashop/countries/algeria?preview=1", adminCookie)).status === 200);
  const republish = await req("/api/admin/country-discovery", adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ code: "DZ", action: "publish" })
  });
  check("super admin can republish DZ", republish.status === 200, String(republish.status));
  check("republished country is public again", (await req("/naijashop/countries/algeria")).status === 200);

  const summary = {
    passed: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
