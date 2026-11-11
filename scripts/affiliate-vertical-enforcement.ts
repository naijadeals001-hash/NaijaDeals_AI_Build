import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { createLink, recordConversion } from "../lib/services/affiliate/service";

const DB = "naijadeals_affiliate_test";
const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const PASSWORD = `Vertical-${randomUUID()}`;
const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(c: unknown, m: string): void { if (!c) throw new Error(m); }
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (e) { failures += 1; rows.push({ name, status: "FAIL", detail: String(inspect(e, { depth: 3 })).slice(0, 700) }); }
}
async function http(method: string, path: string, cookie: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: any = null; if (t) { try { b = JSON.parse(t); } catch { b = t; } }
  return { status: r.status, body: b };
}
async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert(r.status === 200, `login ${r.status}`);
  return r.headers.getSetCookie().map((v) => v.split(";")[0].trim()).join("; ");
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = db[0]?.db ?? "";
  if (actual !== DB) throw new Error(`Refusing to run on "${actual}".`);
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await prisma.user.create({ data: { email: `vert-${runId}-admin@example.test`, name: "Vertical admin", actorType: "ADMIN", passwordHash } });
  const role = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
  const cookie = await login(admin.email);
  const affiliate = await prisma.user.create({ data: { email: `vert-${runId}-aff@example.test`, name: "Vertical affiliate", actorType: "CUSTOMER", passwordHash } });
  const profile = await prisma.affiliateProfile.create({ data: { userId: affiliate.id, termsVersion: "vert", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() } });
  let stayCampaign = "";

  await check("1. Campaign creation rejects an unsupported vertical", async () => {
    const r = await http("POST", "/api/admin/affiliate-campaigns", cookie, { slug: `vert-stay-${runId}`, name: "Stay campaign", vertical: "stay", commissionBps: 500, budgetKobo: "1000000" });
    assert(r.status === 400 && r.body.code === "unsupported_vertical", `got ${r.status} ${JSON.stringify(r.body)}`);
    return "stay rejected 400 unsupported_vertical";
  });

  await check("2. Activation refuses a stale unsupported campaign", async () => {
    const existing = await prisma.affiliateCampaign.create({ data: { slug: `vert-stale-${runId}`, name: "Stale stay", vertical: "stay", status: "DRAFT", commissionBps: 500, budgetKobo: 1_000_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1 } });
    stayCampaign = existing.id;
    const r = await http("PATCH", `/api/admin/affiliate-campaigns/${existing.id}`, cookie, { status: "ACTIVE" });
    assert(r.status === 409 && r.body.code === "unsupported_vertical", `got ${r.status} ${JSON.stringify(r.body)}`);
    return "stale stay campaign cannot activate (409 unsupported_vertical)";
  });

  await check("3. Discovery and link creation exclude unsupported verticals", async () => {
    await prisma.affiliateCampaign.update({ where: { id: stayCampaign }, data: { status: "ACTIVE" } });
    const affCookie = await login(affiliate.email);
    const discovery = await http("GET", "/api/affiliate/links?take=50", affCookie);
    assert(discovery.status === 200, `discovery ${discovery.status}`);
    assert(!discovery.body.rows.some((row: { id: string }) => row.id === stayCampaign), "unsupported campaign discoverable");
    const r = await http("POST", "/api/affiliate/links", affCookie, { campaignId: stayCampaign, destination: "/" });
    assert(r.status === 409 && r.body.code === "unsupported_vertical", `link got ${r.status} ${JSON.stringify(r.body)}`);
    let blocked = false;
    try { await createLink({ affiliateId: profile.id, campaignId: stayCampaign, destination: "/" }); }
    catch (e) { blocked = (e as { code?: string }).code === "unsupported_vertical"; }
    assert(blocked, "createLink did not enforce the registry");
    return "hidden from discovery; API and service link creation refused";
  });

  await check("4. Stale links record no touch and cannot convert", async () => {
    const link = await prisma.affiliateLink.create({ data: { affiliateId: profile.id, campaignId: stayCampaign, code: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(), destination: "/" } });
    const visitor = randomUUID().replace(/-/g, "");
    const landing = await fetch(`${BASE}/r/${link.code}`, { headers: { Cookie: `nd_visitor=${visitor}; nd_consent=all` }, redirect: "manual" });
    assert(landing.status === 302 && String(landing.headers.get("location")).endsWith("/"), `landing ${landing.headers.get("location")}`);
    assert((await prisma.attributionTouch.count({ where: { linkId: link.id } })) === 0, "stale link recorded a touch");
    // Insert a consented touch directly to prove the conversion guard itself,
    // independently of the landing guard that already refused to record one.
    await prisma.attributionTouch.create({ data: { linkId: link.id, visitorKey: visitor, consent: true, expiresAt: new Date(Date.now() + 86_400_000) } });
    const converted = await recordConversion({ entityType: "StayReservation", entityId: `vert-stay-${runId}`, basisKobo: 100_000n, visitorKey: visitor });
    assert(!converted.created && converted.reason === "unsupported_vertical", `conversion ${JSON.stringify(converted)}`);
    return "302 home, zero touches, conversion refused unsupported_vertical";
  });

  await check("5. A supported shop campaign still works", async () => {
    const created = await http("POST", "/api/admin/affiliate-campaigns", cookie, { slug: `vert-shop-${runId}`, name: "Shop campaign", vertical: "shop", commissionBps: 500, budgetKobo: "1000000" });
    assert(created.status === 201, `shop create ${created.status} ${JSON.stringify(created.body)}`);
    const activated = await http("PATCH", `/api/admin/affiliate-campaigns/${created.body.id}`, cookie, { status: "ACTIVE" });
    assert(activated.status === 200, `shop activation ${activated.status}`);
    const affCookie = await login(affiliate.email);
    const link = await http("POST", "/api/affiliate/links", affCookie, { campaignId: created.body.id, destination: "/product/control" });
    assert(link.status === 201, `shop link ${link.status} ${JSON.stringify(link.body)}`);
    return "shop campaign activates and issues a link";
  });

  console.log(JSON.stringify({ runId, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
