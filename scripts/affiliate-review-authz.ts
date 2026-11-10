import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import type { ActorType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

/**
 * Affiliate reversal review — authorization regression.
 *
 *   npx tsx scripts/affiliate-review-authz.ts
 *
 * Drives the real 3017 preview over HTTP against the isolated database. The
 * defect this suite locks down: an ADMIN actor whose only role was
 * `affiliate_reviewer` was not a recognised staff role, so `permissionsFor`
 * fell back to the full legacy admin set and the read-only reviewer could
 * resolve reviews. Every denial case asserts that no intent mutation and no
 * resolution audit row occurred, not just the status code.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const PASSWORD = "AuthzReview!2026";

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function describeError(error: unknown): string {
  try {
    const text = inspect(error, { depth: 3, breakLength: 200 });
    const cut = text.indexOf("postgresql:");
    return (cut >= 0 ? text.slice(0, cut) + "postgresql:[redacted]" : text).slice(0, 1200);
  } catch {
    return String(error).slice(0, 1200);
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

type HttpResult = { status: number; body: Record<string, unknown> | string | null; cookies: string; location: string | null };

async function http(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown; origin?: boolean; redirect?: RequestRedirect } = {}
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.origin ?? method !== "GET") headers.Origin = BASE;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: options.redirect ?? "follow"
  });
  const text = await response.text();
  let body: Record<string, unknown> | string | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = text;
    }
  }
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/);
  return {
    status: response.status,
    body,
    cookies: setCookies.map((value) => value.split(";")[0].trim()).filter(Boolean).join("; "),
    location: response.headers.get("location")
  };
}

async function login(email: string): Promise<string> {
  const result = await http("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert(result.status === 200, `login ${email} returned ${result.status}: ${JSON.stringify(result.body).slice(0, 300)}`);
  assert(result.cookies.includes("="), "login did not set a session cookie");
  return result.cookies;
}

async function ensureRoles(names: string[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const name of names) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    ids[name] = role.id;
  }
  return ids;
}

async function makeUser(input: { key: string; actorType: ActorType; roles: string[] }, roleIds: Record<string, string>) {
  const email = `authz-${runId}-${input.key}@example.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: { email, name: `Authz ${input.key}`, actorType: input.actorType, passwordHash }
  });
  await setRoles(user.id, input.roles, roleIds);
  return { email, cookie: await login(email) };
}

async function setRoles(userId: string, names: string[], roleIds: Record<string, string>) {
  await prisma.userRole.deleteMany({ where: { userId } });
  if (names.length) {
    await prisma.userRole.createMany({ data: names.map((name) => ({ userId, roleId: roleIds[name] })) });
  }
}

type Parked = { intentId: string; orderId: string };

async function park(tag: string): Promise<Parked> {
  const profile = await prisma.affiliateProfile.findFirstOrThrow({ select: { id: true } });
  const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ select: { id: true } });
  const orderId = `authz-${runId}-${tag}`;
  await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${orderId}`,
      affiliateId: profile.id,
      campaignId: campaign.id,
      entityType: "Order",
      entityId: orderId,
      ruleVersion: 1,
      basisType: null,
      commissionBps: 500,
      basisKobo: 1_000_000n,
      amountKobo: 50_000n,
      state: "PAID",
      ledgerReference: `AUTHZ-${runId}-${tag}`
    }
  });
  const intent = await prisma.affiliateReversalIntent.create({
    data: {
      dedupeKey: `refund:${orderId}`,
      refundId: `rf-${orderId}`,
      orderId,
      amountKobo: 500_000n,
      state: "FAILED",
      attempts: 1,
      lastError: "review_required:missing_allocation"
    }
  });
  return { intentId: intent.id, orderId };
}

function resolveBody(intentId: string) {
  return { intentId, basisType: "TOTAL", basisKobo: "1000000", evidenceRef: "authz-ledger-2026-11", reason: "basis confirmed from archived settlement ledger" };
}

type Snapshot = { state: string; eligibleKobo: string | null; policy: string | null; lastError: string | null; audits: number };

async function snapshot(intentId: string): Promise<Snapshot> {
  const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
  const audits = await prisma.auditLog.count({
    where: { entityId: intentId, action: { startsWith: "affiliate.reversal_review" } }
  });
  return {
    state: intent.state,
    eligibleKobo: intent.eligibleKobo === null ? null : intent.eligibleKobo.toString(),
    policy: intent.allocationPolicy,
    lastError: intent.lastError,
    audits
  };
}

function assertUntouched(before: Snapshot, after: Snapshot, label: string) {
  assert(
    before.state === after.state &&
      before.eligibleKobo === after.eligibleKobo &&
      before.policy === after.policy &&
      before.lastError === after.lastError &&
      before.audits === after.audits,
    `${label} changed persisted state: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
  );
  assert(after.audits === 0, `${label} wrote a resolution audit row (${after.audits})`);
  assert(after.eligibleKobo === null && after.policy === null, `${label} wrote an allocation: ${JSON.stringify(after)}`);
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) {
    throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);
  }
  const live = await fetch(`${BASE}/api/auth/me`).catch(() => null);
  if (!live) throw new Error(`Preview ${BASE} is not reachable.`);

  const roleIds = await ensureRoles(["admin", "super_admin", "affiliate_reviewer", "finance"]);

  const reviewer = await makeUser({ key: "reviewer", actorType: "ADMIN", roles: ["affiliate_reviewer"] }, roleIds);
  const manager = await makeUser({ key: "manager", actorType: "ADMIN", roles: ["admin"] }, roleIds);
  const superAdmin = await makeUser({ key: "super", actorType: "ADMIN", roles: ["super_admin"] }, roleIds);
  const ordinary = await makeUser({ key: "ordinary", actorType: "CUSTOMER", roles: [] }, roleIds);
  const legacyAdmin = await makeUser({ key: "legacy", actorType: "ADMIN", roles: [] }, roleIds);
  const readerFinance = await makeUser({ key: "reader-finance", actorType: "ADMIN", roles: ["affiliate_reviewer", "finance"] }, roleIds);
  const reviewerAdmin = await makeUser({ key: "reviewer-admin", actorType: "ADMIN", roles: ["affiliate_reviewer", "admin"] }, roleIds);

  const reviewerUserId = (await prisma.user.findUniqueOrThrow({ where: { email: reviewer.email } })).id;

  await check("1. Reviewer can list; resolve is denied with no mutation or audit", async () => {
    const parked = await park("reviewer");
    const before = await snapshot(parked.intentId);

    const list = await http("GET", "/api/admin/affiliate-reviews?take=100", { cookie: reviewer.cookie });
    assert(list.status === 200, `reviewer list returned ${list.status}: ${JSON.stringify(list.body)}`);
    const listed = (list.body as { rows?: Array<{ id: string }> }).rows ?? [];
    assert(listed.some((row) => row.id === parked.intentId), "reviewer list did not include the parked intent");

    const page = await http("GET", "/admin/affiliate-reviews", { cookie: reviewer.cookie, redirect: "manual" });
    assert(page.status === 200, `reviewer console page returned ${page.status} (redirect ${page.location})`);
    // The RSC payload escapes the quote inside its script string: canManage\":false.
    assert(typeof page.body === "string" && /canManage\\?":false/.test(page.body), "console page did not render canManage:false for the reviewer");

    const resolve = await http("POST", "/api/admin/affiliate-reviews", { cookie: reviewer.cookie, body: resolveBody(parked.intentId) });
    assert(resolve.status === 403, `reviewer resolve returned ${resolve.status}: ${JSON.stringify(resolve.body)}`);
    assert((resolve.body as { code?: string }).code === "permission_denied", `unexpected denial code: ${JSON.stringify(resolve.body)}`);

    assertUntouched(before, await snapshot(parked.intentId), "reviewer resolve");
    return `list=200 page=200 canManage=false resolve=403 permission_denied; intent ${parked.intentId} untouched`;
  });

  await check("2. Manager resolves; replay has exactly one financial effect", async () => {
    const parked = await park("manager");
    const first = await http("POST", "/api/admin/affiliate-reviews", { cookie: manager.cookie, body: resolveBody(parked.intentId) });
    assert(first.status === 200, `manager resolve returned ${first.status}: ${JSON.stringify(first.body)}`);
    const body = first.body as { eligibleKobo?: string; policy?: string; requeued?: boolean };
    assert(body.eligibleKobo === "500000", `unexpected eligibleKobo ${body.eligibleKobo}`);
    assert(body.policy === "review_total_v1" && body.requeued === true, `unexpected outcome ${JSON.stringify(body)}`);

    const after = await snapshot(parked.intentId);
    assert(after.state === "PENDING" && after.eligibleKobo === "500000" && after.policy === "review_total_v1", `intent not requeued: ${JSON.stringify(after)}`);
    assert(after.audits === 1, `expected one resolution audit row, found ${after.audits}`);

    const replay = await http("POST", "/api/admin/affiliate-reviews", { cookie: manager.cookie, body: resolveBody(parked.intentId) });
    assert(replay.status === 409, `replay returned ${replay.status}: ${JSON.stringify(replay.body)}`);
    const replayed = await snapshot(parked.intentId);
    assert(replayed.audits === 1 && replayed.eligibleKobo === "500000" && replayed.state === "PENDING", `replay changed state or audit: ${JSON.stringify(replayed)}`);
    return `eligible=500000 policy=review_total_v1 requeued; replay=409, audit rows still 1`;
  });

  await check("3. Authenticated ordinary user is refused and cannot mutate", async () => {
    const parked = await park("ordinary");
    const before = await snapshot(parked.intentId);

    const list = await http("GET", "/api/admin/affiliate-reviews", { cookie: ordinary.cookie });
    assert(list.status === 403, `ordinary list returned ${list.status}: ${JSON.stringify(list.body)}`);
    assert((list.body as { code?: string }).code === "forbidden", `unexpected list code: ${JSON.stringify(list.body)}`);

    const page = await http("GET", "/admin/affiliate-reviews", { cookie: ordinary.cookie, redirect: "manual" });
    assert(page.status === 307 || page.status === 308, `ordinary console page returned ${page.status}`);
    assert(!String(page.location ?? "").includes("/login"), `ordinary was sent to login instead of out of the console: ${page.location}`);

    const resolve = await http("POST", "/api/admin/affiliate-reviews", { cookie: ordinary.cookie, body: resolveBody(parked.intentId) });
    assert(resolve.status === 403, `ordinary resolve returned ${resolve.status}: ${JSON.stringify(resolve.body)}`);

    assertUntouched(before, await snapshot(parked.intentId), "ordinary resolve");
    return `list=403 forbidden page=307 resolve=403; intent untouched`;
  });

  await check("4. Anonymous caller is refused", async () => {
    const parked = await park("anonymous");
    const before = await snapshot(parked.intentId);

    const list = await http("GET", "/api/admin/affiliate-reviews");
    assert(list.status === 401, `anonymous list returned ${list.status}: ${JSON.stringify(list.body)}`);
    assert((list.body as { code?: string }).code === "unauthenticated", `unexpected anonymous code: ${JSON.stringify(list.body)}`);

    const page = await http("GET", "/admin/affiliate-reviews", { redirect: "manual" });
    assert(page.status === 307 || page.status === 308, `anonymous console page returned ${page.status}`);
    assert(String(page.location ?? "").includes("/login"), `anonymous console redirect did not target login: ${page.location}`);

    const resolve = await http("POST", "/api/admin/affiliate-reviews", { body: resolveBody(parked.intentId) });
    assert(resolve.status === 401, `anonymous resolve returned ${resolve.status}: ${JSON.stringify(resolve.body)}`);

    assertUntouched(before, await snapshot(parked.intentId), "anonymous resolve");
    return `list=401 unauthenticated page->login resolve=401; intent untouched`;
  });

  await check("5a. Composed roles never add a permission a role set does not hold", async () => {
    const parked = await park("composed-read");
    const before = await snapshot(parked.intentId);

    const list = await http("GET", "/api/admin/affiliate-reviews?take=100", { cookie: readerFinance.cookie });
    assert(list.status === 200, `reviewer+finance list returned ${list.status}: ${JSON.stringify(list.body)}`);

    const resolve = await http("POST", "/api/admin/affiliate-reviews", { cookie: readerFinance.cookie, body: resolveBody(parked.intentId) });
    assert(resolve.status === 403, `reviewer+finance resolve returned ${resolve.status}: ${JSON.stringify(resolve.body)}`);
    assertUntouched(before, await snapshot(parked.intentId), "reviewer+finance resolve");
    return `reviewer+finance: list=200 resolve=403; finance did not imply affiliates:manage`;
  });

  await check("5b. admin and super_admin keep resolution authority", async () => {
    const adminParked = await park("reviewer-admin");
    const asAdmin = await http("POST", "/api/admin/affiliate-reviews", { cookie: reviewerAdmin.cookie, body: resolveBody(adminParked.intentId) });
    assert(asAdmin.status === 200, `reviewer+admin resolve returned ${asAdmin.status}: ${JSON.stringify(asAdmin.body)}`);

    const superParked = await park("super");
    const asSuper = await http("POST", "/api/admin/affiliate-reviews", { cookie: superAdmin.cookie, body: resolveBody(superParked.intentId) });
    assert(asSuper.status === 200, `super_admin resolve returned ${asSuper.status}: ${JSON.stringify(asSuper.body)}`);

    const legacyParked = await park("legacy");
    const asLegacy = await http("POST", "/api/admin/affiliate-reviews", { cookie: legacyAdmin.cookie, body: resolveBody(legacyParked.intentId) });
    assert(asLegacy.status === 200, `legacy ADMIN fallback resolve returned ${asLegacy.status}: ${JSON.stringify(asLegacy.body)}`);
    return `reviewer+admin=200 super_admin=200 legacy ADMIN (no role rows)=200`;
  });

  await check("6. Permission changes apply to the same session without stale authority", async () => {
    await setRoles(reviewerUserId, ["affiliate_reviewer"], roleIds);
    const grantParked = await park("fresh-grant");
    const denied = await http("POST", "/api/admin/affiliate-reviews", { cookie: reviewer.cookie, body: resolveBody(grantParked.intentId) });
    assert(denied.status === 403, `baseline reviewer resolve returned ${denied.status}: ${JSON.stringify(denied.body)}`);

    await setRoles(reviewerUserId, ["affiliate_reviewer", "admin"], roleIds);
    const granted = await http("POST", "/api/admin/affiliate-reviews", { cookie: reviewer.cookie, body: resolveBody(grantParked.intentId) });
    assert(granted.status === 200, `same session after admin grant returned ${granted.status}: ${JSON.stringify(granted.body)}`);

    await setRoles(reviewerUserId, ["affiliate_reviewer"], roleIds);
    const revokedParked = await park("fresh-revoke");
    const afterRevoke = await http("POST", "/api/admin/affiliate-reviews", { cookie: reviewer.cookie, body: resolveBody(revokedParked.intentId) });
    assert(afterRevoke.status === 403, `same session after admin revoke returned ${afterRevoke.status}: ${JSON.stringify(afterRevoke.body)}`);

    const stillLists = await http("GET", "/api/admin/affiliate-reviews", { cookie: reviewer.cookie });
    assert(stillLists.status === 200, `reviewer lost list access after revoke: ${stillLists.status}`);
    return `same cookie: 403 -> grant admin -> 200 -> revoke -> 403, list still 200`;
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
