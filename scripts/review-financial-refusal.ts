/**
 * Proves the server-side REVIEW financial boundary: provider requests and ledger
 * postings are refused before any outbound call or financial write.
 *
 * Run against the REVIEW database:
 *   DATABASE_URL=.../naijadeals_review npx tsx scripts/review-financial-refusal.ts
 */
import { prisma } from "../lib/prisma";
import { adapters } from "../lib/payments/adapters";
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

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  const classification = rows[0]?.classification ?? "missing";
  record("database is REVIEW", classification === "REVIEW", classification);

  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("outbound network blocked by refusal test");
  }) as typeof fetch;

  process.env.PAYSTACK_SECRET_KEY = "test_fake_paystack_key";
  process.env.FLUTTERWAVE_SECRET_KEY = "test_fake_flutterwave_key";

  let providerError = "";
  try {
    await adapters.paystack.initialize({
      reference: "review-refusal-1",
      amountMinor: BigInt(10000),
      currency: "NGN",
      email: "review@example.invalid",
      orderNumber: "REVIEW-1",
      callbackUrl: "http://localhost:3047/cart"
    });
  } catch (error) {
    providerError = (error as { code?: string }).code ?? (error as Error).message;
  }
  record("provider initialize refused", providerError === "review_financial_operations_disabled", providerError);
  record("zero outbound provider calls", fetchCalls === 0, `fetchCalls=${fetchCalls}`);

  const before = await prisma.walletTransaction.count();
  let ledgerError = "";
  try {
    await postBalancedTransaction({
      tx: prisma,
      walletId: "review-guard-wallet",
      type: "TRANSFER",
      amountKobo: BigInt(100),
      reference: "review-refusal-ledger",
      description: "REVIEW refusal probe",
      entries: []
    } as never);
  } catch (error) {
    ledgerError = (error as { code?: string }).code ?? (error as Error).message;
  }
  const after = await prisma.walletTransaction.count();
  record("ledger posting refused", ledgerError === "review_financial_operations_disabled", ledgerError);
  record("no financial writes", before === after, `before=${before} after=${after}`);

  const entryPoints: Array<[string, () => Promise<unknown>]> = [
    ["initializePayment", () => initializePayment({} as never)],
    ["confirmPayment", () => confirmPayment({} as never)],
    ["refundPayment", () => refundPayment({} as never)],
    ["reserveExternalRefundClaim", () => reserveExternalRefundClaim({} as never)],
    ["settleConfirmedExternalRefund", () => settleConfirmedExternalRefund({} as never)],
    ["reconcileExternalRefundOutcome", () => reconcileExternalRefundOutcome({} as never)],
    ["processWebhook", () => processWebhook("paystack", "", new Headers())]
  ];
  const writesBefore = {
    payments: await prisma.payment.count(),
    refunds: await prisma.refund.count(),
    walletTransactions: await prisma.walletTransaction.count()
  };
  for (const [name, call] of entryPoints) {
    let code = "no_error";
    try {
      await call();
    } catch (error) {
      code = (error as { code?: string }).code ?? (error as Error).message;
    }
    record(`${name} refused before writes`, code === "review_financial_operations_disabled", code);
  }
  const writesAfter = {
    payments: await prisma.payment.count(),
    refunds: await prisma.refund.count(),
    walletTransactions: await prisma.walletTransaction.count()
  };
  record("no financial state written", JSON.stringify(writesBefore) === JSON.stringify(writesAfter), JSON.stringify(writesAfter));
  record("still zero outbound provider calls", fetchCalls === 0, `fetchCalls=${fetchCalls}`);

  global.fetch = originalFetch;
  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
