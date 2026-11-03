import { PrismaClient } from "@prisma/client";
import { refundPayment } from "../lib/payments/service";

const prisma = new PrismaClient();
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, status: ok ? "PASS" : "FAIL", detail });

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@naijadeals.local" } });
  const order = await prisma.order.findFirst({
    where: { paymentStatus: "paid", refundedKobo: 0n, payments: { some: { provider: "wallet", status: "COMPLETED" } } },
    include: { payments: true, escrowHolds: true },
    orderBy: { createdAt: "desc" }
  });
  if (!order) { console.log(JSON.stringify([{ name: "wallet refund fixture", status: "FAIL", detail: "no paid wallet order" }])); process.exit(1); }
  const buyer = await prisma.wallet.findFirstOrThrow({ where: { userId: order.customerId } });
  const before = buyer.availableKobo;

  const partial = await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Wallet partial", amountKobo: 100n });
  let wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: buyer.id } });
  const tx = await prisma.walletTransaction.findFirst({ where: { orderId: order.id, type: "refund" }, orderBy: { createdAt: "desc" }, include: { ledger: true } });
  const balanced = tx ? tx.ledger.filter(e => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n) === tx.ledger.filter(e => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n) : false;
  check("wallet partial refund credits buyer", partial.refundedKobo === "100" && wallet.availableKobo === before + 100n && balanced,
    `refund=${partial.refundedKobo} before=${before} after=${wallet.availableKobo} ledgerBalanced=${balanced}`);

  const remaining = order.totalKobo - 100n;
  const full = await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Wallet remainder", amountKobo: remaining });
  wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: buyer.id } });
  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { escrowHolds: true, payments: true } });
  const attempts = await prisma.refund.findMany({ where: { orderId: order.id } });
  const attemptSum = attempts.filter(a => a.status === "COMPLETED").reduce((s, a) => s + a.amountKobo, 0n);
  const fullTotal = "totalRefundedKobo" in full ? full.totalRefundedKobo : full.refundedKobo;
  check("wallet refund completes escrow and cumulative", fullTotal === order.totalKobo.toString() && wallet.availableKobo === before + order.totalKobo && finalOrder.status === "refunded" && finalOrder.escrowHolds.every(e => e.status === "refunded") && attemptSum === order.totalKobo,
    `total=${fullTotal} wallet=${wallet.availableKobo} expected=${before + order.totalKobo} status=${finalOrder.status} escrow=${finalOrder.escrowHolds.map(e => e.status).join(",")} attempts=${attempts.length} sum=${attemptSum}`);

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
  process.exit(results.some(r => r.status === "FAIL") ? 1 : 0);
}

main().catch(async (error) => { console.error("FATAL", error); await prisma.$disconnect(); process.exit(1); });
