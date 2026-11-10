import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

/**
 * Affiliate reversal review — allocation edge cases and shared-limit contention.
 *
 *   npx tsx scripts/affiliate-review-allocation.ts
 *
 * Authorized-manager paths only: an invalid basis must change nothing, a
 * legitimately zero share must close with an audit row, and two different
 * intents on one conversion must not jointly exceed the frozen basis even when
 * their transactions overlap.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const PASSWORD = `Authz-${randomUUID()}`;
const runId = randomUUID().slice(0, 8);

const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function describeError(error: unknown): string {
  try {
    return inspect(error, { depth: 3, breakLength: 200 }).slice(0, 1200);
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

type HttpResult = { status: number; body: Record<string, unknown> | string | null };
async function http(method: string, path: string, options: { cookie?: string; body?: unknown } = {}): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (method !== "GET") headers.Origin = BASE;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
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
  return { status: response.status, body };
}

async function loginManager() {
  const email = `alloc-${runId}-manager@example.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { email, name: "Allocation manager", actorType: "ADMIN", passwordHash } });
  const role = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const result = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  assert(result.status === 200, `manager login returned ${result.status}`);
  const cookies = typeof result.headers.getSetCookie === "function"
    ? result.headers.getSetCookie()
    : (result.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/);
  const cookie = cookies.map((value) => value.split(";")[0].trim()).filter(Boolean).join("; ");
  assert(cookie, "manager login set no cookie");
  return cookie;
}

type Fixture = { intentId: string; orderId: string; conversionId: string };

async function makeConversion(orderId: string, basisKobo: bigint) {
  const profile = await prisma.affiliateProfile.findFirstOrThrow({ select: { id: true } });
  const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ select: { id: true } });
  return prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${orderId}`,
      affiliateId: profile.id,
      campaignId: campaign.id,
      entityType: "Order",
      entityId: orderId,
      ruleVersion: 1,
      basisType: null,
      commissionBps: 500,
      basisKobo,
      amountKobo: 50_000n,
      state: "PAID",
      ledgerReference: `ALLOC-${orderId}`
    }
  });
}

async function parkIntent(orderId: string, amountKobo: bigint): Promise<Fixture> {
  const conversion = await makeConversion(orderId, 1_000_000n);
  const intent = await prisma.affiliateReversalIntent.create({
    data: {
      dedupeKey: `refund:${orderId}:${amountKobo}`,
      refundId: `rf-${orderId}-${amountKobo}`,
      orderId,
      amountKobo,
      state: "FAILED",
      attempts: 1,
      lastError: "review_required:missing_allocation"
    }
  });
  return { intentId: intent.id, orderId, conversionId: conversion.id };
}

function body(intentId: string, overrides: Record<string, unknown> = {}) {
  return {
    intentId,
    basisType: "TOTAL",
    basisKobo: "1000000",
    evidenceRef: "alloc-ledger-2026-11",
    reason: "historical basis confirmed against the archived settlement ledger",
    ...overrides
  };
}

async function state(intentId: string) {
  const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
  return {
    state: intent.state,
    eligibleKobo: intent.eligibleKobo === null ? null : intent.eligibleKobo.toString(),
    policy: intent.allocationPolicy,
    lastError: intent.lastError
  };
}

async function audits(intentId: string) {
  return prisma.auditLog.count({ where: { entityId: intentId, action: { startsWith: "affiliate.reversal_review" } } });
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const cookie = await loginManager();

  await check("7. An invalid basis is rejected without changing the intent", async () => {
    const fixture = await parkIntent(`alloc-${runId}-invalid`, 500_000n);
    const before = await state(fixture.intentId);

    const tooLarge = await http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(fixture.intentId, { basisKobo: "1000001" }) });
    assert(tooLarge.status === 400 && (tooLarge.body as { code?: string }).code === "invalid_basis", `over-basis returned ${tooLarge.status}: ${JSON.stringify(tooLarge.body)}`);

    const nonNumeric = await http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(fixture.intentId, { basisKobo: "12e3" }) });
    assert(nonNumeric.status === 400 && (nonNumeric.body as { code?: string }).code === "invalid_evidence", `non-numeric returned ${nonNumeric.status}: ${JSON.stringify(nonNumeric.body)}`);

    const missingEvidence = await http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(fixture.intentId, { evidenceRef: "abc" }) });
    assert(missingEvidence.status === 400, `short evidence returned ${missingEvidence.status}: ${JSON.stringify(missingEvidence.body)}`);

    const after = await state(fixture.intentId);
    assert(JSON.stringify(after) === JSON.stringify(before), `invalid requests changed the intent: ${JSON.stringify({ before, after })}`);
    assert((await audits(fixture.intentId)) === 0, "invalid requests wrote an audit row");
    return `over-basis=400 invalid_basis non-numeric=400 short evidence=400; intent and audit unchanged`;
  });

  await check("8. A legitimately zero share closes with an audited no-adjustment outcome", async () => {
    // 1 kobo refunded against a half-size basis floors to a zero commission share.
    const fixture = await parkIntent(`alloc-${runId}-zero`, 1n);
    const response = await http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(fixture.intentId, { basisType: "SUBTOTAL", basisKobo: "500000" }) });
    assert(response.status === 200, `zero-share returned ${response.status}: ${JSON.stringify(response.body)}`);
    const payload = response.body as { eligibleKobo?: string; requeued?: boolean; policy?: string };
    assert(payload.eligibleKobo === "0" && payload.requeued === false, `unexpected zero outcome ${JSON.stringify(payload)}`);

    const after = await state(fixture.intentId);
    assert(after.state === "FAILED" && after.lastError === "review_resolved:no_adjustment", `intent not closed as no-adjustment: ${JSON.stringify(after)}`);
    assert(after.policy === "review_subtotal_v1" && after.eligibleKobo === "0", `unexpected policy/eligible: ${JSON.stringify(after)}`);
    assert((await audits(fixture.intentId)) === 1, "zero-share close did not write exactly one audit row");

    const closed = await prisma.auditLog.findFirst({ where: { entityId: fixture.intentId } });
    assert(closed?.action === "affiliate.reversal_review_closed_no_adjustment", `unexpected audit action ${closed?.action}`);
    return `share=0 closed FAILED review_resolved:no_adjustment, audit=closed_no_adjustment`;
  });

  await check("9. Two intents on one conversion cannot jointly exceed the frozen basis", async () => {
    const orderId = `alloc-${runId}-concurrent`;
    const conversion = await makeConversion(orderId, 1_000_000n);
    const first = await prisma.affiliateReversalIntent.create({
      data: { dedupeKey: `refund:${orderId}:a`, refundId: `rf-${orderId}-a`, orderId, amountKobo: 800_000n, state: "FAILED", attempts: 1, lastError: "review_required:missing_allocation" }
    });
    const second = await prisma.affiliateReversalIntent.create({
      data: { dedupeKey: `refund:${orderId}:b`, refundId: `rf-${orderId}-b`, orderId, amountKobo: 800_000n, state: "FAILED", attempts: 1, lastError: "review_required:missing_allocation" }
    });

    const [a, b] = await Promise.all([
      http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(first.id) }),
      http("POST", "/api/admin/affiliate-reviews", { cookie, body: body(second.id) })
    ]);
    assert(a.status === 200 && b.status === 200, `concurrent resolutions returned ${a.status}/${b.status}: ${JSON.stringify([a.body, b.body])}`);

    const allocated = await prisma.affiliateReversalIntent.aggregate({
      where: { orderId, eligibleKobo: { not: null } },
      _sum: { eligibleKobo: true }
    });
    const total = allocated._sum.eligibleKobo ?? 0n;
    assert(total === conversion.basisKobo, `allocated ${total} against a basis of ${conversion.basisKobo}`);
    const values = [first.id, second.id].map(async (id) => (await state(id)).eligibleKobo);
    const resolved = await Promise.all(values);
    assert(resolved.includes("800000") && resolved.includes("200000"), `expected 800000/200000, got ${JSON.stringify(resolved)}`);
    return `concurrent 800000/800000 => 800000 + 200000 = ${total}; frozen basis respected`;
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
