/**
 * Proves the server-side REVIEW financial boundary.
 *
 * The REVIEW catalogue database is a demonstration environment: it may serve
 * catalogue, sign-in, search and cart journeys, but it must never move money or
 * contact a payment provider. This script exercises every identified financial
 * entry point and asserts that each one refuses before any write.
 *
 * What counts as a prohibited financial write (the snapshot below):
 *
 *   - Payment, Refund and Payout rows (creation or status change)
 *   - WalletTransaction, LedgerEntry and AccountPosting rows
 *   - EscrowHold rows and status changes
 *   - Wallet rows and their availableKobo / heldKobo projections
 *   - WalletTopUp rows (wallet funding)
 *   - WebhookEvent rows (a provider callback must be refused before it is stored)
 *   - Order status / paymentStatus changes and Ride status / paymentStatus changes
 *
 * Audit rows, SystemEvent rows and the classification row itself are not
 * financial mutations: they are evidence about an operation, not money.
 *
 * Run against the REVIEW database:
 *   DATABASE_URL=<review-url> npx tsx scripts/review-financial-refusal.ts
 *
 * Prove the TEST database still resolves the guard (no writes, no provider call):
 *   DATABASE_URL=<test-url> npx tsx scripts/review-financial-refusal.ts --target=TEST
 *
 * Exit codes: 0 complete boundary, 1 a refusal check failed, 2 all checks passed
 * but a known unprotected path remains outside this agent's owned files.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { adapters } from "../lib/payments/adapters";
import { assertFinancialOperationsAllowed } from "../lib/payments/review-financial-guard";
import { assertLiveFinancialOperations, assertProviderOperation, getDatabaseClassification } from "../lib/payments/boundary";
import { postBalancedTransaction } from "../lib/services/core/wallet.service";
import {
  initializePayment,
  confirmPayment,
  refundPayment,
  processWebhook,
  reserveExternalRefundClaim,
  settleConfirmedExternalRefund,
  reconcileExternalRefundOutcome
} from "../lib/payments/service";
import { createPayout, markPayoutPaid } from "../lib/services/core/admin.service";
import { creditTopUp } from "../lib/services/core/topup.service";
import { sendP2PTransfer } from "../lib/services/core/transfer.service";
import { checkout, expireAbandonedCheckouts } from "../lib/services/core/checkout.service";
import { processReversalIntents } from "../lib/services/affiliate/reversal-processor";

type Check = { name: string; ok: boolean; detail: string };
type Gap = { name: string; detail: string };
type Capture = { ok: boolean; code: string; message: string };

const REVIEW_REFUSAL = "review_financial_operations_disabled";
const ENVIRONMENT_UNAVAILABLE = "financial_environment_unavailable";
const TEST_FUNDS_BOUNDARY = "test_funds_boundary";

const target = (
  process.argv.find((argument) => argument.startsWith("--target="))?.slice("--target=".length) ??
  process.env.REVIEW_GUARD_TARGET ??
  "REVIEW"
).toUpperCase();

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function capture(call: () => Promise<unknown>): Promise<Capture> {
  try {
    await call();
    return { ok: true, code: "resolved", message: "" };
  } catch (error) {
    return { ok: false, code: errorCode(error), message: error instanceof Error ? error.message : String(error) };
  }
}

/** Deterministic financial-state fingerprint. Any committed money write changes it. */
async function financialSnapshot(): Promise<string> {
  const [
    payments,
    refunds,
    payouts,
    walletTransactions,
    ledgerEntries,
    accountPostings,
    escrowHolds,
    walletTopUps,
    webhookEvents,
    wallets,
    orderStatuses,
    orderPaymentStatuses,
    rideStatuses,
    ridePaymentStatuses
  ] = await Promise.all([
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.refund.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payout.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.walletTransaction.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.ledgerEntry.groupBy({ by: ["direction"], _count: { _all: true } }),
    prisma.accountPosting.groupBy({ by: ["direction"], _count: { _all: true } }),
    prisma.escrowHold.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.walletTopUp.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.webhookEvent.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.wallet.aggregate({ _count: { _all: true }, _sum: { availableKobo: true, heldKobo: true } }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["paymentStatus"], _count: { _all: true } }),
    prisma.ride.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ride.groupBy({ by: ["paymentStatus"], _count: { _all: true } })
  ]);

  const stable = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();

  return JSON.stringify(
    {
      payments: stable(payments),
      refunds: stable(refunds),
      payouts: stable(payouts),
      walletTransactions: stable(walletTransactions),
      ledgerEntries: stable(ledgerEntries),
      accountPostings: stable(accountPostings),
      escrowHolds: stable(escrowHolds),
      walletTopUps: stable(walletTopUps),
      webhookEvents: stable(webhookEvents),
      wallets: { count: wallets._count._all, available: wallets._sum.availableKobo ?? 0n, held: wallets._sum.heldKobo ?? 0n },
      orderStatuses: stable(orderStatuses),
      orderPaymentStatuses: stable(orderPaymentStatuses),
      rideStatuses: stable(rideStatuses),
      ridePaymentStatuses: stable(ridePaymentStatuses)
    },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value)
  );
}

function setEnvironment(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) process.env[key] = value;
}

async function main() {
  if (target !== "REVIEW" && target !== "TEST") {
    throw new Error(`Unknown --target=${target}; use REVIEW or TEST.`);
  }

  const checks: Check[] = [];
  const gaps: Gap[] = [];
  const notes: string[] = [];
  const record = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  const databaseRows = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  const database = databaseRows[0]?.current_database ?? "";
  const rows = await prisma.databaseClassification.findMany({ select: { id: true, classification: true } });
  const classification = rows.length === 1 ? rows[0]?.classification ?? "missing" : `ambiguous(${rows.length})`;
  const boundaryValue = await getDatabaseClassification(prisma);

  record("database identity is established", Boolean(database), database);
  record("classification is single and canonical", rows.length === 1 && rows[0]?.id === "default", JSON.stringify(rows));
  record("database classification matches the requested target", classification === target, classification);
  const expectedBoundary = target === "REVIEW" ? "UNKNOWN" : "TEST";
  record("boundary.ts fails closed for a non-operational classification", boundaryValue === expectedBoundary, boundaryValue);

  // ------------------------------------------------------------------------
  // Guard semantics (injected readers; no database mutation).
  // ------------------------------------------------------------------------
  type Reader = () => Promise<Array<{ classification: string }>>;
  const readerCases: Array<[string, Reader, string | null]> = [
    ["TEST classification permits financial work", async () => [{ classification: "TEST" }], null],
    ["LIVE classification permits financial work", async () => [{ classification: "LIVE" }], null],
    ["REVIEW classification fails closed", async () => [{ classification: "REVIEW" }], REVIEW_REFUSAL],
    ["UNKNOWN classification fails closed", async () => [{ classification: "UNKNOWN" }], REVIEW_REFUSAL],
    ["missing classification fails closed", async () => [], ENVIRONMENT_UNAVAILABLE],
    ["ambiguous classification fails closed", async () => [{ classification: "TEST" }, { classification: "LIVE" }], ENVIRONMENT_UNAVAILABLE],
    ["empty classification fails closed", async () => [{ classification: "" }], ENVIRONMENT_UNAVAILABLE],
    ["unrecognised classification fails closed", async () => [{ classification: "PROD" }], ENVIRONMENT_UNAVAILABLE],
    [
      "unreadable classification fails closed",
      async () => {
        throw new Error("classification read failed");
      },
      ENVIRONMENT_UNAVAILABLE
    ]
  ];
  for (const [name, reader, expected] of readerCases) {
    const result = await capture(() => assertFinancialOperationsAllowed("guard probe", reader));
    record(name, expected === null ? result.ok : !result.ok && result.code === expected, result.code);
  }

  // ------------------------------------------------------------------------
  // Outbound provider transport: every request is counted and blocked.
  // ------------------------------------------------------------------------
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = (async (input: unknown) => {
    providerCalls += 1;
    throw new Error(`blocked outbound fetch in REVIEW refusal test: ${String(input).slice(0, 120)}`);
  }) as typeof fetch;

  // Fake credentials and deliberately live-looking flags: neither may override
  // the database classification, and no request may leave the process.
  setEnvironment({
    PAYSTACK_SECRET_KEY: "sk_test_review_refusal_fake",
    FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST-review-refusal-fake",
    FLUTTERWAVE_WEBHOOK_HASH: "review-refusal-fake-hash",
    ENABLE_TEST_PAYMENTS: "true",
    ENABLE_P2P_TRANSFERS: "true",
    NEXT_PUBLIC_REVIEW_CATALOGUE: "0",
    NODE_ENV: "production",
    FINANCIAL_ENV: "live",
    ALLOW_LIVE_FINANCIAL_OPERATIONS: "true",
    DRIVE_SWEEP_DISABLED: "1"
  });

  const before = await financialSnapshot();

  try {
    if (target === "REVIEW") {
      // --------------------------------------------------------------------
      // 1. Direct guard and provider adapters.
      // --------------------------------------------------------------------
      const direct = await capture(() => assertFinancialOperationsAllowed("direct probe"));
      record("direct guard refuses REVIEW", !direct.ok && direct.code === REVIEW_REFUSAL, direct.code);

      const adapterInput = {
        reference: "review-refusal-provider",
        amountMinor: BigInt(10_000),
        currency: "NGN",
        email: "review@example.invalid",
        orderNumber: "REVIEW-REFUSAL",
        callbackUrl: "http://localhost:3047/naijashop"
      };
      const adapterCalls: Array<[string, () => Promise<unknown>]> = [
        ["paystack.initialize", () => adapters.paystack.initialize(adapterInput)],
        ["paystack.verify", () => adapters.paystack.verify("review-refusal-provider")],
        ["paystack.refund", () => adapters.paystack.refund!({ ...adapterInput, idempotencyKey: "review-refusal-refund" })],
        ["flutterwave.initialize", () => adapters.flutterwave.initialize(adapterInput)],
        ["flutterwave.verify", () => adapters.flutterwave.verify("review-refusal-provider")],
        ["flutterwave.refund", () => adapters.flutterwave.refund!({ ...adapterInput, idempotencyKey: "review-refusal-refund" })]
      ];
      for (const [name, call] of adapterCalls) {
        const result = await capture(call);
        record(`${name} refused before transport`, !result.ok && result.code === REVIEW_REFUSAL, result.code);
      }
      record("zero outbound provider calls after adapter probes", providerCalls === 0, `providerCalls=${providerCalls}`);

      // --------------------------------------------------------------------
      // 2. Ledger choke point.
      // --------------------------------------------------------------------
      const ledger = await capture(() =>
        postBalancedTransaction({
          tx: prisma,
          walletId: "review-refusal-wallet",
          type: "TRANSFER",
          amountKobo: BigInt(100),
          reference: "review-refusal-ledger",
          description: "REVIEW refusal probe",
          entries: []
        } as never)
      );
      record("ledger posting refused", !ledger.ok && ledger.code === REVIEW_REFUSAL, ledger.code);

      // --------------------------------------------------------------------
      // 3. Payment, refund and webhook service entry points.
      // --------------------------------------------------------------------
      const entryPoints: Array<[string, () => Promise<unknown>]> = [
        ["initializePayment", () => initializePayment({} as never)],
        ["confirmPayment", () => confirmPayment({} as never)],
        ["refundPayment", () => refundPayment({} as never)],
        ["reserveExternalRefundClaim", () => reserveExternalRefundClaim({} as never)],
        ["settleConfirmedExternalRefund", () => settleConfirmedExternalRefund({} as never)],
        ["reconcileExternalRefundOutcome", () => reconcileExternalRefundOutcome({} as never)],
        ["processWebhook", () => processWebhook("paystack", "", new Headers())]
      ];
      for (const [name, call] of entryPoints) {
        const result = await capture(call);
        record(`${name} refused before writes`, !result.ok && result.code === REVIEW_REFUSAL, result.code);
      }
      record("zero outbound provider calls after payment probes", providerCalls === 0, `providerCalls=${providerCalls}`);

      // --------------------------------------------------------------------
      // 4. Payout entry points (LIVE-only, so REVIEW is refused even with
      //    production/live environment flags deliberately set above).
      // --------------------------------------------------------------------
      const payoutCreation = await capture(() =>
        createPayout({
          adminId: "review-refusal-admin",
          vendorId: "review-refusal-vendor",
          periodStart: new Date("2000-01-01T00:00:00Z"),
          periodEnd: new Date("2000-01-02T00:00:00Z")
        })
      );
      record(
        "createPayout refused regardless of live flags",
        !payoutCreation.ok && payoutCreation.code === TEST_FUNDS_BOUNDARY,
        payoutCreation.code
      );

      const payoutSettlement = await capture(() =>
        markPayoutPaid({ adminId: "review-refusal-admin", payoutId: "review-refusal-payout" })
      );
      record(
        "markPayoutPaid refused regardless of live flags",
        !payoutSettlement.ok && payoutSettlement.code === TEST_FUNDS_BOUNDARY,
        payoutSettlement.code
      );

      const payoutBoundary = await capture(() => assertLiveFinancialOperations("payout probe"));
      record("live payout boundary refuses REVIEW", !payoutBoundary.ok && payoutBoundary.code === TEST_FUNDS_BOUNDARY, payoutBoundary.code);

      const providerBoundary = await capture(() => assertProviderOperation("provider probe", "paystack"));
      record("provider boundary refuses REVIEW", !providerBoundary.ok && providerBoundary.code === TEST_FUNDS_BOUNDARY, providerBoundary.code);

      // --------------------------------------------------------------------
      // 5. Wallet funding, transfers and the shared money boundary.
      // --------------------------------------------------------------------
      const topUp = await capture(() =>
        creditTopUp(prisma, {
          providerReference: "review-refusal-no-such-topup",
          verifiedAmountKobo: BigInt(100),
          verifiedCurrency: "NGN"
        })
      );
      record(
        "creditTopUp cannot credit in REVIEW",
        !topUp.ok && topUp.code === "topup_not_found",
        topUp.code
      );

      const transfer = await capture(() =>
        sendP2PTransfer(prisma, {
          senderUserId: "review-refusal-no-such-sender",
          recipientEmail: "review-refusal@example.invalid",
          amountKobo: BigInt(1_000),
          idempotencyKey: "review-refusal-transfer"
        })
      );
      record(
        "sendP2PTransfer cannot post in REVIEW",
        !transfer.ok && transfer.code === "recipient_not_found",
        transfer.code
      );

      // --------------------------------------------------------------------
      // 6. Checkout and scheduled financial jobs.
      // --------------------------------------------------------------------
      const checkoutProbe = await capture(() =>
        checkout({
          userId: "review-refusal-no-such-user",
          address: {
            contactName: "Review refusal probe",
            contactPhone: "0000000000",
            countryCode: "NG",
            state: "FCT",
            city: "Abuja",
            line1: "Probe"
          }
        })
      );
      record(
        "checkout path writes no financial state",
        !checkoutProbe.ok &&
          ["empty_cart", "country_disabled", "delivery_unconfigured", "checkout_already_completed"].includes(checkoutProbe.code),
        checkoutProbe.code
      );

      const abandoned = await prisma.order.count({
        where: { status: { in: ["created", "payment_pending"] }, paymentStatus: "pending" }
      });
      if (abandoned > 0) {
        record(
          "scheduled checkout expiry has no REVIEW candidates",
          false,
          `candidates=${abandoned}; sweep not run because it would mutate order/payment state`
        );
      } else {
        const sweep = await expireAbandonedCheckouts({ limit: 1 });
        record(
          "scheduled checkout expiry is a no-op on REVIEW",
          sweep.inspected === 0 && sweep.expired.length === 0,
          JSON.stringify({ inspected: sweep.inspected, expired: sweep.expired.length })
        );
      }

      const staleRides = await prisma.ride.count({
        where: { status: { in: ["driver_assigned", "driver_arriving"] }, assignmentExpiresAt: { lt: new Date() } }
      });
      if (staleRides > 0) {
        record("scheduled drive expiry has no REVIEW candidates", false, `staleRides=${staleRides}; sweep not run`);
      } else {
        const { releaseExpiredAssignments } = await import("../lib/services/core/drive.service");
        const released = await releaseExpiredAssignments(new Date("2000-01-01T00:00:00Z"));
        record("scheduled drive expiry is a no-op on REVIEW", released.length === 0, `released=${released.length}`);
      }

      const openIntents = await prisma.affiliateReversalIntent.count({ where: { state: { in: ["PENDING", "PROCESSING"] } } });
      if (openIntents > 0) {
        record("affiliate reversal job has no REVIEW work", false, `openIntents=${openIntents}; job not run`);
      } else {
        const reversal = await processReversalIntents("review-refusal");
        record(
          "affiliate reversal job is a no-op on REVIEW",
          reversal.claimed === 0 && reversal.done === 0 && reversal.retried === 0 && reversal.dead === 0,
          JSON.stringify(reversal)
        );
      }

      record("zero outbound provider calls after every probe", providerCalls === 0, `providerCalls=${providerCalls}`);

      // --------------------------------------------------------------------
      // 7. Structural audit of money paths outside this agent's owned files.
      // --------------------------------------------------------------------
      const adaptersSource = await readFile(join(process.cwd(), "lib/payments/adapters.ts"), "utf8");
      const fetchSites = adaptersSource.match(/\bfetch\(/g)?.length ?? 0;
      record(
        "every provider transport goes through the guarded jsonRequest",
        fetchSites === 1 && adaptersSource.includes("assertFinancialOperationsAllowed"),
        `fetchSites=${fetchSites}`
      );

      const topUpSource = await readFile(join(process.cwd(), "lib/services/core/topup.service.ts"), "utf8");
      record(
        "wallet funding posts through the guarded ledger inside a transaction",
        topUpSource.includes("postBalancedTransaction(") && topUpSource.includes("$transaction("),
        "creditTopUp -> postBalancedTransaction"
      );

      const transferSource = await readFile(join(process.cwd(), "lib/services/core/transfer.service.ts"), "utf8");
      record(
        "P2P transfer posts through the guarded ledger",
        transferSource.includes("postBalancedTransaction(") && transferSource.includes("$transaction("),
        "sendP2PTransfer -> postBalancedTransaction"
      );

      const orderSource = await readFile(join(process.cwd(), "lib/services/core/order.service.ts"), "utf8");
      const orderDirectLedger = orderSource.includes("walletTransaction.create");
      const orderGuard = orderSource.includes("assertFinancialOperationsAllowed");
      if (orderDirectLedger && !orderGuard) {
        gaps.push({
          name: "postEscrowRelease posts money without a REVIEW guard",
          detail:
            "lib/services/core/order.service.ts writes Wallet balances and a WalletTransaction directly in postEscrowRelease; " +
            "completeOrder and dispute release call it with no classification check. Not reachable with the current REVIEW dataset " +
            "(0 orders/escrows; the order state machine can only reach delivered after a guarded confirmPayment), but the boundary " +
            "depends on data absence rather than code. The file is outside this agent's ownership; add " +
            "assertFinancialOperationsAllowed('Escrow release') as the first statement of postEscrowRelease."
        });
      } else {
        record("escrow release path is behind a REVIEW guard", true, `directLedger=${orderDirectLedger} guard=${orderGuard}`);
      }

      const adjustmentSource = await readFile(join(process.cwd(), "lib/services/core/ledger-adjustment.service.ts"), "utf8");
      if (adjustmentSource.includes("walletTransaction.create") && !adjustmentSource.includes("assertFinancialOperationsAllowed")) {
        notes.push(
          "applyLedgerAdjustment (lib/services/core/ledger-adjustment.service.ts) posts a ledger credit against FIXTURE_EQUITY " +
            "without the REVIEW guard. It is reachable only from operator scripts, changes no stored wallet balance, and requires " +
            "a pre-prepared adjustment row; it is not an HTTP entry point. Do not run it against REVIEW."
        );
      }
    } else {
      // --------------------------------------------------------------------
      // TEST mode: the guard must resolve and TEST money operations must stay
      // available, without writing anything in this probe.
      // --------------------------------------------------------------------
      const guard = await capture(() => assertFinancialOperationsAllowed("TEST guard probe"));
      record("guard resolves on TEST", guard.ok, guard.code);

      const initialize = await capture(() =>
        initializePayment({ orderId: "review-refusal-no-order", userId: "review-refusal-no-user", provider: "wallet", callbackUrl: "http://localhost:3047/" })
      );
      record("initializePayment passes the guard on TEST", initialize.code === "order_not_found", initialize.code);

      const confirm = await capture(() => confirmPayment({ reference: "review-refusal-no-payment", provider: "wallet" }));
      record("confirmPayment passes the guard on TEST", confirm.code === "payment_not_found", confirm.code);

      const refund = await capture(() =>
        refundPayment({ orderId: "review-refusal-no-order", actorId: "review-refusal-no-user", reason: "guard probe" })
      );
      record("refundPayment passes the guard on TEST", refund.code === "order_not_found", refund.code);

      const reserve = await capture(() =>
        reserveExternalRefundClaim({
          orderId: "review-refusal-no-order",
          actorId: "review-refusal-no-user",
          reason: "guard probe",
          idempotencyKey: "review-refusal-reserve"
        })
      );
      record("reserveExternalRefundClaim passes the guard on TEST", reserve.code === "order_not_found", reserve.code);

      const webhook = await capture(() => processWebhook("paystack", "", new Headers()));
      record("processWebhook passes the guard on TEST", webhook.code === "invalid_signature", webhook.code);

      const zeroLedger = await capture(() =>
        postBalancedTransaction({
          tx: prisma,
          walletId: "review-refusal-wallet",
          type: "TRANSFER",
          amountKobo: BigInt(0),
          reference: "review-refusal-zero",
          description: "guard probe",
          entries: []
        } as never)
      );
      record(
        "postBalancedTransaction passes the guard on TEST",
        zeroLedger.code === "Wallet transaction amount must be positive.",
        zeroLedger.code
      );

      const payout = await capture(() =>
        markPayoutPaid({ adminId: "review-refusal-admin", payoutId: "review-refusal-payout" })
      );
      record("payouts stay LIVE-only on TEST", payout.code === TEST_FUNDS_BOUNDARY, payout.code);
      record("zero outbound provider calls on TEST", providerCalls === 0, `providerCalls=${providerCalls}`);
    }

    const after = await financialSnapshot();
    record("no prohibited financial write was committed", before === after, before === after ? "snapshot unchanged" : "snapshot changed");
  } finally {
    global.fetch = originalFetch;
  }

  const failed = checks.filter((check) => !check.ok);
  const exitCode = failed.length ? 1 : gaps.length ? 2 : 0;
  console.log(
    JSON.stringify(
      {
        mode: target,
        database,
        classification,
        checks,
        gaps,
        notes,
        providerCalls,
        passed: checks.length - failed.length,
        total: checks.length,
        boundaryComplete: failed.length === 0 && gaps.length === 0,
        exitCode
      },
      null,
      2
    )
  );
  process.exit(exitCode);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
