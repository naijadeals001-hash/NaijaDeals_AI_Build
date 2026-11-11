/**
 * Payout lifecycle inspection (read-only plus boundary probes).
 *
 * The repository has an ADMIN MANUAL payout settlement, not a provider payout
 * lifecycle. This script establishes exactly what exists and what does not, and
 * proves the live-money boundary blocks both operations on the TEST acceptance
 * database without creating or changing any row.
 *
 * It does not invent a payout request, reservation, provider submission,
 * callback or reconciliation state. The missing policy and schema are reported
 * verbatim for a product decision.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the guard.
 *
 * Usage:
 *   npx tsx scripts/payout-lifecycle-inspection.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const REPO_ROOT = path.resolve(__dirname, "..");

type CheckResult = { name: string; pass: boolean; detail: string };
const checks: CheckResult[] = [];
let failures = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

async function statusOf(promise: Promise<unknown>) {
  try {
    const value = await promise;
    return { ok: true as const, value, status: 200, code: "ok", message: "" };
  } catch (error) {
    const typed = error as { status?: number; code?: string; message?: string };
    return {
      ok: false as const,
      value: null,
      status: typed.status ?? 500,
      code: typed.code ?? "unknown",
      message: (typed.message ?? String(error)).slice(0, 160)
    };
  }
}

function modelBlock(schema: string, model: string) {
  const start = schema.indexOf(`model ${model} {`);
  if (start < 0) return "";
  const end = schema.indexOf("\n}", start);
  return schema.slice(start, end + 2);
}

async function main(prisma: PrismaClient) {
  const { createPayout, markPayoutPaid } = await import("../lib/services/core/admin.service");
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);

  const schema = readFileSync(path.join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const adminService = readFileSync(path.join(REPO_ROOT, "lib", "services", "core", "admin.service.ts"), "utf8");
  const payoutModel = modelBlock(schema, "Payout");
  const enumBlock = (() => {
    const start = schema.indexOf("enum PayoutStatus {");
    if (start < 0) return "";
    const end = schema.indexOf("\n}", start);
    return schema.slice(start, end + 2);
  })();

  const payoutFields = [...payoutModel.matchAll(/^\s{2}(\w+)\s+/gm)].map((match) => match[1]);
  const missingFields = [
    "provider",
    "providerReference",
    "providerStatus",
    "currency",
    "requestedBy",
    "approvedBy",
    "reservationId",
    "attemptedAt",
    "confirmedAt",
    "failureCode",
    "idempotencyKey",
    "bankAccountReference"
  ].filter((field) => !payoutFields.includes(field));
  record(
    "the Payout model is a manual settlement record, not a provider transfer",
    payoutFields.length > 0 && missingFields.length >= 9,
    `fields: ${payoutFields.join(",")}; missing: ${missingFields.join(",")}`
  );

  const statuses = [...enumBlock.matchAll(/^\s{2}(\w+)$/gm)].map((match) => match[1]);
  record(
    "PayoutStatus has no pending/confirmed/definitive-failure provider states",
    statuses.includes("PENDING") &&
      statuses.includes("PAID") &&
      !statuses.some((status) => ["SUBMITTED", "PROVIDER_PENDING", "CONFIRMED", "FAILED", "REVERSED"].includes(status)),
    `statuses: ${statuses.join(",")}`
  );

  const createBody = adminService.slice(
    adminService.indexOf("export async function createPayout"),
    adminService.indexOf("export async function markPayoutPaid")
  );
  const payBody = adminService.slice(
    adminService.indexOf("export async function markPayoutPaid"),
    adminService.indexOf("export async function getAdminUsers")
  );
  record(
    "payout creation and settlement require a LIVE database and financial flags",
    createBody.includes('assertLiveFinancialOperations("Vendor payout creation")') &&
      payBody.includes('assertLiveFinancialOperations("Vendor payout settlement")'),
    "both entry points call assertLiveFinancialOperations before any write"
  );
  record(
    "no provider submission exists in the payout path",
    !/adapters|fetch\(|paystack|flutterwave|providerReference|transferCode/i.test(createBody) &&
      !/adapters|fetch\(|paystack|flutterwave|providerReference|transferCode/i.test(payBody),
    "neither function calls a provider adapter, fetch, or records a provider reference"
  );
  record(
    "payout creation does not reserve vendor funds",
    !/wallet\.(update|updateMany)|heldKobo|reservation/i.test(createBody),
    "createPayout writes only the Payout row and an audit row; the vendor wallet is untouched until markPayoutPaid"
  );
  record(
    "payout creation ignores prior payouts and refunds for the same period",
    !/payout\.find|refund|refundedKobo|partially_refunded/i.test(createBody),
    "the amount is gross minus commission over paid orders in the period; existing Payout rows and refunded amounts are not considered"
  );
  record(
    "settlement is synchronous: PAID and the wallet debit happen together with no pending confirmation state",
    payBody.includes('data: { status: "PAID", paidAt: new Date() }') &&
      payBody.includes("availableKobo: { gte: payout.amountKobo }") &&
      !/provider|callback|reconcil/i.test(payBody),
    "the claim, conditional debit, SYSTEM clearing credit and audit commit in one transaction"
  );

  const classification = await prisma.databaseClassification.findUnique({ where: { id: "default" } });
  const payoutCountBefore = await prisma.payout.count();
  const payoutsBefore = await prisma.payout.findMany({ select: { id: true, status: true, amountKobo: true } });
  const payoutSignature = (rows: Array<{ id: string; status: string; amountKobo: bigint }>) =>
    rows.map((row) => `${row.id}:${row.status}:${row.amountKobo.toString()}`).sort().join("|");
  const vendor = await prisma.vendor.findFirst({ select: { id: true } });
  const walletBefore = vendor
    ? await prisma.wallet.findFirst({ where: { vendorId: vendor.id }, select: { availableKobo: true, heldKobo: true } })
    : null;

  const creation = await statusOf(
    createPayout({
      adminId: "acceptance-inspection",
      vendorId: vendor?.id ?? "acceptance-inspection-vendor",
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date()
    })
  );
  const settlement = await statusOf(
    markPayoutPaid({
      adminId: "acceptance-inspection",
      payoutId: "acceptance-inspection-payout"
    })
  );
  const concurrentSettlement = await Promise.allSettled([
    markPayoutPaid({ adminId: "acceptance-inspection-a", payoutId: "acceptance-inspection-payout" }),
    markPayoutPaid({ adminId: "acceptance-inspection-b", payoutId: "acceptance-inspection-payout" })
  ]);
  const concurrentCodes = concurrentSettlement.map((result) =>
    result.status === "rejected" ? (result.reason as { code?: string }).code ?? "unknown" : "unexpected-success"
  );
  const payoutCountAfter = await prisma.payout.count();
  const payoutsAfter = await prisma.payout.findMany({ select: { id: true, status: true, amountKobo: true } });
  const walletAfter = vendor
    ? await prisma.wallet.findFirst({ where: { vendorId: vendor.id }, select: { availableKobo: true, heldKobo: true } })
    : null;

  record(
    "the TEST boundary refuses payout creation and settlement before any row or wallet change",
    classification?.classification === "TEST" &&
      creation.status === 403 &&
      creation.code === "test_funds_boundary" &&
      settlement.status === 403 &&
      settlement.code === "test_funds_boundary" &&
      concurrentCodes.every((code) => code === "test_funds_boundary") &&
      payoutCountAfter === payoutCountBefore &&
      payoutSignature(payoutsAfter) === payoutSignature(payoutsBefore) &&
      (walletAfter?.availableKobo ?? null) === (walletBefore?.availableKobo ?? null) &&
      (walletAfter?.heldKobo ?? null) === (walletBefore?.heldKobo ?? null),
    `classification ${classification?.classification ?? "none"}, creation ${creation.status} ${creation.code}, settlement ${settlement.status} ${settlement.code}, concurrent ${concurrentCodes.join(",")}, payouts ${payoutCountBefore}->${payoutCountAfter}`
  );

  const missingPolicy = [
    "Vendor payout request and eligibility policy (who may request, minimum, holdback, KYC/bank-account verification).",
    "Currency on Payout and a rule for vendor wallet currency; the model has no currency field.",
    "A reservation/hold that moves vendor available into a payout-reserved balance at request time, so the same funds cannot fund two payouts.",
    "Payout-per-order or payout-period uniqueness, and exclusion of prior payouts and refunded/partially refunded orders from the amount.",
    "A provider transfer adapter with idempotency, a provider reference, and a submission timeout policy.",
    "Provider state machine: SUBMITTED -> PROVIDER_PENDING -> CONFIRMED | DEFINITIVE_FAILURE, with reservation release only on definitive failure.",
    "Callback/webhook verification and reconciliation for provider transfers, including duplicate callbacks and ambiguous timeouts.",
    "Dual approval or an explicit approval policy for high-value payouts; the current flow has one finance permission.",
    "Reconciliation of SYSTEM clearing: payout settlement credits SYSTEM; no provider transfer or bank statement closes it."
  ];

  console.log(JSON.stringify({
    database: DB,
    classification: classification?.classification ?? "UNKNOWN",
    payoutFields,
    payoutStatuses: statuses,
    missingFields,
    boundaryProbes: {
      create: { status: creation.status, code: creation.code },
      settle: { status: settlement.status, code: settlement.code },
      concurrentSettle: concurrentCodes
    },
    payoutRows: { before: payoutCountBefore, after: payoutCountAfter },
    walletProbe: { vendorId: vendor?.id ?? null, before: walletBefore, after: walletAfter },
    verdict:
      "A manual admin settlement exists (create PENDING from a paid-order period; mark PAID with an atomic claim and conditional vendor debit). A provider payout lifecycle does not exist. Request -> eligibility -> atomic reservation -> provider submission -> pending/confirmed/definitive failure -> reconciliation is BLOCKED by missing schema and policy; nothing was invented or executed against real money.",
    missingPolicy,
    checks,
    failures,
    status: failures === 0 ? "PASS (inspection)" : "FAIL"
  }, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

async function run() {
  process.env.VALKEY_URL = "";
  const url = acceptanceUrl();
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
