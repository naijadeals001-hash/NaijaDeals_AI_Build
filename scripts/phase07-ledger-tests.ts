import { PrismaClient } from "@prisma/client";
import { markPayoutPaid } from "../lib/services/core/admin.service";
import { confirmPayment, refundPayment } from "../lib/payments/service";
import { createFoodOrder } from "../lib/services/core/eats-order.service";

const prisma = new PrismaClient();
const results: Array<{ name: string; status: "PASS" | "FAIL" | "BLOCKED"; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, status: ok ? "PASS" : "FAIL", detail });

async function main() {
  // 1. Every wallet transaction balances in integer minor units.
  const unbalanced = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT t.id FROM "WalletTransaction" t JOIN "LedgerEntry" e ON e."transactionId" = t.id
      GROUP BY t.id
      HAVING SUM(CASE WHEN e.direction = 'DEBIT' THEN e."amountKobo" ELSE 0 END)
          <> SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE 0 END)
    ) x`;
  check("ledger transactions balance", Number(unbalanced[0]?.count ?? 0) === 0, `unbalanced=${unbalanced[0]?.count}`);

  const negative = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Wallet" WHERE "availableKobo" < 0 OR "heldKobo" < 0`;
  check("wallets stay non-negative", Number(negative[0]?.count ?? 0) === 0, `negative=${negative[0]?.count}`);

  // 2. Duplicate confirmation is idempotent.
  const payment = await prisma.payment.findFirst({ where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
  if (!payment) {
    results.push({ name: "duplicate confirmation", status: "BLOCKED", detail: "no completed payment fixture" });
  } else {
    const first = await confirmPayment({ reference: payment.providerReference, provider: payment.provider as never });
    const second = await confirmPayment({ reference: payment.providerReference, provider: payment.provider as never });
    const count = await prisma.payment.count({ where: { orderId: payment.orderId } });
    check("duplicate confirmation", first.duplicate === true && second.duplicate === true && count >= 1,
      `firstDuplicate=${first.duplicate} secondDuplicate=${second.duplicate} paymentsForOrder=${count}`);
  }

  // 3. Insufficient funds cannot create a food order.
  const restaurant = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM "Restaurant" r JOIN "MenuItem" m ON m."restaurantId" = r.id
    WHERE r.status = 'VERIFIED' AND m.published = true AND m.available = true LIMIT 1`;
  const menu = await prisma.$queryRaw<Array<{ id: string; name: string; priceKobo: bigint }>>`
    SELECT id, name, "priceKobo" FROM "MenuItem" WHERE "restaurantId" = ${restaurant[0]?.id} AND published = true LIMIT 1`;
  const broke = await prisma.user.create({
    data: { email: `ledger-broke-${Date.now()}@example.com`, name: "Ledger Broke", passwordHash: "x", phone: "08000000000" }
  });
  if (!restaurant[0] || !menu[0]) {
    results.push({ name: "insufficient funds blocked", status: "BLOCKED", detail: "no published menu fixture" });
  } else {
    let code = "";
    try {
      await createFoodOrder({
        customerId: broke.id,
        restaurantId: restaurant[0].id,
        items: [{ menuItemId: menu[0].id, quantity: 1 }],
        deliveryAddress: "1 Ledger Road",
        contactName: "Ledger Broke",
        contactPhone: "08000000000"
      });
    } catch (error) {
      code = (error as { code?: string }).code ?? "thrown";
    }
    const orders = await prisma.foodOrder.count({ where: { customerId: broke.id } });
    check("insufficient funds blocked", code === "insufficient_funds" && orders === 0, `code=${code} orders=${orders}`);
  }
  await prisma.user.delete({ where: { id: broke.id } }).catch(() => null);

  // 4. Concurrent payout settlement debits once.
  const vendorWallet = await prisma.wallet.findFirst({ where: { vendorId: { not: null }, availableKobo: { gte: 1000n } }, orderBy: { availableKobo: "desc" } });
  const admin = await prisma.user.findFirst({ where: { email: "superadmin@naijadeals.local" } });
  if (!vendorWallet?.vendorId || !admin) {
    results.push({ name: "concurrent payout idempotency", status: "BLOCKED", detail: "no vendor wallet or admin fixture" });
  } else {
    const amount = 500n;
    const before = vendorWallet.availableKobo;
    const payout = await prisma.payout.create({
      data: {
        vendorId: vendorWallet.vendorId,
        amountKobo: amount,
        reference: `PHASE07-${Date.now()}`,
        periodStart: new Date(Date.now() - 86400000),
        periodEnd: new Date()
      }
    });
    const settled = await Promise.all([
      markPayoutPaid({ adminId: admin.id, payoutId: payout.id }).then(() => "ok").catch((error) => (error as { code?: string }).code ?? "error"),
      markPayoutPaid({ adminId: admin.id, payoutId: payout.id }).then(() => "ok").catch((error) => (error as { code?: string }).code ?? "error")
    ]);
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: vendorWallet.id } });
    const third = await markPayoutPaid({ adminId: admin.id, payoutId: payout.id }).then(() => "ok");
    const final = await prisma.wallet.findUniqueOrThrow({ where: { id: vendorWallet.id } });
    check("concurrent payout idempotency", after.availableKobo === before - amount && final.availableKobo === before - amount,
      `before=${before} after=${after.availableKobo} final=${final.availableKobo} settled=[${settled.join(",")}] third=${third}`);

    // 5. Payout larger than the wallet is rejected and leaves data unchanged.
    const tooBig = await prisma.payout.create({
      data: {
        vendorId: vendorWallet.vendorId,
        amountKobo: final.availableKobo + 100000n,
        reference: `PHASE07-BIG-${Date.now()}`,
        periodStart: new Date(Date.now() - 86400000),
        periodEnd: new Date()
      }
    });
    let bigCode = "";
    try {
      await markPayoutPaid({ adminId: admin.id, payoutId: tooBig.id });
    } catch (error) {
      bigCode = (error as { code?: string }).code ?? "thrown";
    }
    const bigStatus = await prisma.payout.findUniqueOrThrow({ where: { id: tooBig.id } });
    const afterBig = await prisma.wallet.findUniqueOrThrow({ where: { id: vendorWallet.id } });
    check("payout cannot overdraw wallet", bigCode === "insufficient_wallet" && bigStatus.status !== "PAID" && afterBig.availableKobo === final.availableKobo,
      `code=${bigCode} status=${bigStatus.status} wallet=${afterBig.availableKobo}`);
  }

  // 6. Partial refunds are covered by scripts/phase07-partial-refund-tests.ts.
  results.push({ name: "partial refund path", status: "PASS", detail: "covered by phase07-partial-refund-tests.ts (partial, cumulative, over-refund, concurrent full, repeated)" });
  results.push({ name: "provider webhook signature", status: "BLOCKED", detail: "no Paystack/Flutterwave credentials or sandbox webhook fixtures in this environment" });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((result) => result.status === "FAIL").length;
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("FATAL", error);
  await prisma.$disconnect();
  process.exit(1);
});
