import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

/**
 * Campaign lifecycle → affiliate discovery → link creation → referral redirect.
 *
 *   npx tsx scripts/affiliate-campaign-journey.ts
 *
 * Runs against the isolated preview and database. Asserts the customer-visible
 * contract, not just status codes: a draft is invisible to affiliates, only an
 * authorized manager can activate, activation is refused when a campaign cannot
 * pay, a paused campaign stops serving existing links, and a landing records a
 * consenting touch before redirecting to the stored internal destination.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const PASSWORD = `Journey-${randomUUID()}`;
const runId = randomUUID().slice(0, 8);

const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function describeError(error: unknown): string {
  try {
    return inspect(error, { depth: 3, breakLength: 200 }).slice(0, 1000);
  } catch {
    return String(error).slice(0, 1000);
  }
}
async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    failures += 1;
    rows.push({ name, status: "FAIL", detail: describeError(error) });
  }
}

type HttpResult = { status: number; body: any; cookie: string; location: string | null };
async function http(method: string, path: string, options: { cookie?: string; body?: unknown; redirect?: RequestRedirect } = {}): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (method !== "GET") headers.Origin = BASE;
  const response = await fetch(BASE + path, {
    method, headers, redirect: options.redirect ?? "follow",
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let body: any = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/);
  return { status: response.status, body, cookie: cookies.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; "), location: response.headers.get("location") };
}

async function login(email: string) {
  const result = await http("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert(result.status === 200, `login ${email} returned ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`);
  return result.cookie;
}

async function makeUser(key: string, actorType: "ADMIN" | "CUSTOMER", roles: string[]) {
  const email = `journey-${runId}-${key}@example.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { email, name: `Journey ${key}`, actorType, passwordHash } });
  for (const name of roles) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email, cookie: await login(email) };
}

function campaignBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: `journey-${runId}-${Math.random().toString(36).slice(2, 6)}`,
    name: "Journey campaign",
    vertical: "shop",
    commissionBps: 500,
    budgetKobo: "5000000",
    attributionDays: 30,
    commissionBasis: "SUBTOTAL",
    ...overrides
  };
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const admin = await makeUser("admin", "ADMIN", ["admin"]);
  const reviewer = await makeUser("reviewer", "ADMIN", ["affiliate_reviewer"]);
  const unknown = await makeUser("unknown", "ADMIN", ["unknown_operator"]);
  const affiliate = await makeUser("affiliate", "CUSTOMER", []);
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliate.id, termsVersion: "journey", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });

  let campaignId = "";
  let campaignSlug = "";
  let linkCode = "";

  await check("1. A manager drafts a campaign; it is not discoverable yet", async () => {
    const body = campaignBody();
    campaignSlug = String(body.slug);
    const created = await http("POST", "/api/admin/affiliate-campaigns", { cookie: admin.cookie, body });
    assert(created.status === 201, `create returned ${created.status}: ${JSON.stringify(created.body)}`);
    assert(created.body.status === "DRAFT", `expected DRAFT, got ${created.body.status}`);
    campaignId = created.body.id;

    const discovery = await http("GET", "/api/affiliate/links", { cookie: affiliate.cookie });
    assert(discovery.status === 200, `discovery returned ${discovery.status}`);
    assert(!discovery.body.some((row: { id: string }) => row.id === campaignId), "draft campaign is already discoverable");

    const early = await http("POST", "/api/affiliate/links", { cookie: affiliate.cookie, body: { campaignId, destination: "/" } });
    assert(early.status === 409 && early.body.code === "campaign_inactive", `draft link creation returned ${early.status}: ${JSON.stringify(early.body)}`);

    const audit = await prisma.auditLog.count({ where: { entityId: campaignId, action: "affiliate.campaign_created" } });
    assert(audit === 1, `expected one creation audit row, found ${audit}`);
    return `draft ${campaignId} created, hidden from discovery, link refused 409 campaign_inactive`;
  });

  await check("2. Only affiliates:manage can activate a campaign", async () => {
    for (const [label, actor] of [["reviewer", reviewer], ["unknown-role ADMIN", unknown], ["affiliate", affiliate]] as const) {
      const attempt = await http("PATCH", `/api/admin/affiliate-campaigns/${campaignId}`, { cookie: actor.cookie, body: { status: "ACTIVE" } });
      assert(attempt.status === 403, `${label} activation returned ${attempt.status}: ${JSON.stringify(attempt.body)}`);
    }
    const after = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert(after.status === "DRAFT", `unauthorized attempts changed the campaign to ${after.status}`);
    return `reviewer, unknown-role ADMIN and affiliate all 403; campaign still DRAFT`;
  });

  await check("3. Activation opens discovery and is audited", async () => {
    const activated = await http("PATCH", `/api/admin/affiliate-campaigns/${campaignId}`, { cookie: admin.cookie, body: { status: "ACTIVE" } });
    assert(activated.status === 200, `activation returned ${activated.status}: ${JSON.stringify(activated.body)}`);
    assert(activated.body.status === "ACTIVE", `expected ACTIVE, got ${activated.body.status}`);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: campaignId, action: "affiliate.campaign_status_changed" } });
    if (!audit) throw new Error("activation was not audited");
    assert((audit.metadata as any)?.from === "DRAFT" && (audit.metadata as any)?.to === "ACTIVE", `unexpected audit metadata ${JSON.stringify(audit.metadata)}`);

    const discovery = await http("GET", "/api/affiliate/links", { cookie: affiliate.cookie });
    assert(discovery.body.some((row: { id: string }) => row.id === campaignId), "active campaign is missing from discovery");
    return `ACTIVE, audit DRAFT->ACTIVE, campaign listed with commission and remaining budget`;
  });

  await check("4. An approved affiliate creates a tracked link to an internal destination", async () => {
    const created = await http("POST", "/api/affiliate/links", { cookie: affiliate.cookie, body: { campaignId, destination: "/product/journey-item" } });
    assert(created.status === 201, `link creation returned ${created.status}: ${JSON.stringify(created.body)}`);
    assert(/^[A-Z0-9]{6,16}$/.test(created.body.code), `unexpected code ${created.body.code}`);
    assert(created.body.path === `/r/${created.body.code}`, `unexpected path ${created.body.path}`);
    linkCode = created.body.code;

    const external = await http("POST", "/api/affiliate/links", { cookie: affiliate.cookie, body: { campaignId, destination: "https://example.com" } });
    assert(external.status === 400 && external.body.code === "invalid_destination", `external destination returned ${external.status}: ${JSON.stringify(external.body)}`);

    const stored = await prisma.affiliateLink.findUniqueOrThrow({ where: { code: linkCode } });
    assert(stored.affiliateId === profile.id && stored.campaignId === campaignId, "link is not tied to the affiliate and campaign");
    return `link ${linkCode} -> /product/journey-item; external destination refused 400`;
  });

  await check("5. The referral redirect records a consenting touch and lands internally", async () => {
    const visitor = `visitor-${runId}`;
    const landing = await http("GET", `/r/${linkCode}`, { redirect: "manual", cookie: `nd_visitor=${visitor}; nd_consent=all` });
    assert(landing.status === 302, `landing returned ${landing.status}`);
    assert(String(landing.location ?? "").endsWith("/product/journey-item"), `landing redirected to ${landing.location}`);

    const touch = await prisma.attributionTouch.findFirst({ where: { linkId: (await prisma.affiliateLink.findUniqueOrThrow({ where: { code: linkCode } })).id, visitorKey: visitor } });
    if (!touch) throw new Error("no attribution touch was recorded");
    assert(touch.consent === true, "touch was recorded without stored consent");

    const unconsentedVisitor = `visitor-no-consent-${runId}`;
    await http("GET", `/r/${linkCode}`, { redirect: "manual", cookie: `nd_visitor=${unconsentedVisitor}` });
    const unconsented = await prisma.attributionTouch.findFirst({ where: { visitorKey: unconsentedVisitor } });
    assert(unconsented && unconsented.consent === false, "unconsented visit was not recorded as consent:false");
    return `302 to the stored destination, consenting touch stored, unconsented visit stored with consent:false`;
  });

  await check("6. Pausing hides the campaign and stops serving its existing links", async () => {
    const paused = await http("PATCH", `/api/admin/affiliate-campaigns/${campaignId}`, { cookie: admin.cookie, body: { status: "PAUSED" } });
    assert(paused.status === 200 && paused.body.status === "PAUSED", `pause returned ${paused.status}: ${JSON.stringify(paused.body)}`);

    const discovery = await http("GET", "/api/affiliate/links", { cookie: affiliate.cookie });
    assert(!discovery.body.some((row: { id: string }) => row.id === campaignId), "paused campaign still discoverable");

    const before = await prisma.attributionTouch.count();
    const visitor = `paused-visitor-${runId}`;
    const landing = await http("GET", `/r/${linkCode}`, { redirect: "manual", cookie: `nd_visitor=${visitor}; nd_consent=all` });
    assert(landing.status === 302 && String(landing.location ?? "").endsWith("/"), `paused landing went to ${landing.location}`);
    assert((await prisma.attributionTouch.count()) === before, "paused campaign recorded a touch");
    return `PAUSED, removed from discovery, existing link redirects home without a touch`;
  });

  await check("7. Illegal transitions and unpromotable campaigns are refused", async () => {
    const brokeBody = campaignBody({ commissionBps: 0 });
    const broke = await http("POST", "/api/admin/affiliate-campaigns", { cookie: admin.cookie, body: brokeBody });
    assert(broke.status === 201, `zero-commission draft returned ${broke.status}`);
    const activateBroke = await http("PATCH", `/api/admin/affiliate-campaigns/${broke.body.id}`, { cookie: admin.cookie, body: { status: "ACTIVE" } });
    assert(activateBroke.status === 409 && activateBroke.body.code === "invalid_commission", `zero-commission activation returned ${activateBroke.status}: ${JSON.stringify(activateBroke.body)}`);

    const ended = await http("PATCH", `/api/admin/affiliate-campaigns/${campaignId}`, { cookie: admin.cookie, body: { status: "ENDED" } });
    assert(ended.status === 200 && ended.body.status === "ENDED", `end returned ${ended.status}`);
    const reopen = await http("PATCH", `/api/admin/affiliate-campaigns/${campaignId}`, { cookie: admin.cookie, body: { status: "ACTIVE" } });
    assert(reopen.status === 409 && reopen.body.code === "invalid_transition", `reopening ENDED returned ${reopen.status}: ${JSON.stringify(reopen.body)}`);
    return `zero commission cannot activate (409), ENDED is terminal (409)`;
  });

  await check("8. Two concurrent activations apply exactly one transition", async () => {
    const created = await http("POST", "/api/admin/affiliate-campaigns", { cookie: admin.cookie, body: campaignBody() });
    assert(created.status === 201, `concurrent fixture returned ${created.status}`);
    const [a, b] = await Promise.all([
      http("PATCH", `/api/admin/affiliate-campaigns/${created.body.id}`, { cookie: admin.cookie, body: { status: "ACTIVE" } }),
      http("PATCH", `/api/admin/affiliate-campaigns/${created.body.id}`, { cookie: admin.cookie, body: { status: "ACTIVE" } })
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    assert(statuses[0] === 200 && statuses[1] === 409, `concurrent activation returned ${JSON.stringify(statuses)}: ${JSON.stringify([a.body, b.body])}`);
    const audits = await prisma.auditLog.count({ where: { entityId: created.body.id, action: "affiliate.campaign_status_changed" } });
    assert(audits === 1, `expected one transition audit row, found ${audits}`);
    return `one 200 and one 409 contended; exactly one audit row`;
  });

  console.log(JSON.stringify({ runId, base: BASE, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(describeError(error));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
