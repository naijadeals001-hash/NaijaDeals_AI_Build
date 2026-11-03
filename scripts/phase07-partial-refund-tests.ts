import { PrismaClient } from "@prisma/client";
import { refundPayment } from "../lib/payments/service";

const prisma = new PrismaClient();
const results: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, status: ok ? "PASS" : "FAIL", detail });

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "superadmin@naijadeals.local" } });
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "paid", refundedKobo: BigInt(0), payments: { some: { status: "COMPLETED" } } },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
    take: 5
  });
  const order = orders[0];
  if (!order) {
    console.log(JSON.stringify([{ name: "partial refund fixtures", status: "FAIL", detail: "no paid wallet order with zero refunds" }]));
    process.exit(1);
  }

  const first = await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Phase 07 partial refund test", amountKobo: 100n });
  let after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const tx1 = await prisma.walletTransaction.findFirst({ where: { orderId: order.id, type: "refund" }, orderBy: { createdAt: "desc" }, include: { ledger: true } });
  const balanced1 = tx1 ? tx1.ledger.filter(e => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n) === tx1.ledger.filter(e => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n) : false;
  check("first partial refund", first.refundedKobo === "100" && after.refundedKobo === 100n && after.paymentStatus === "partially_refunded" && balanced1,
    `refund=${first.refundedKobo} cumulative=${after.refundedKobo} status=${after.paymentStatus} ledgerBalanced=${balanced1}`);

  const second = await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Second partial", amountKobo: 200n });
  after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check("second partial refund accumulates", second.totalRefundedKobo === "300" && after.refundedKobo === 300n,
    `total=${second.totalRefundedKobo} cumulative=${after.refundedKobo}`);

  const remaining = after.totalKobo - after.refundedKobo;
  let overCode = "";
  try {
    await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Too much", amountKobo: remaining + 1n });
  } catch (error) {
    overCode = (error as { code?: string }).code ?? "thrown";
  }
  const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check("over-refund rejected", overCode === "invalid_refund_amount" && unchanged.refundedKobo === 300n, `code=${overCode} cumulative=${unchanged.refundedKobo}`);

  const concurrent = await Promise.all([
    refundPayment({ orderId: order.id, actorId: admin.id, reason: "Concurrent A", amountKobo: remaining }).then(() => "ok").catch((error) => (error as { code?: string }).code ?? "error"),
    refundPayment({ orderId: order.id, actorId: admin.id, reason: "Concurrent B", amountKobo: remaining }).then(() => "ok").catch((error) => (error as { code?: string }).code ?? "error")
  ]);
  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const finalPayment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id, status: "REFUNDED" } });
  const refundTxs = await prisma.walletTransaction.findMany({ where: { orderId: order.id, type: "refund" }, include: { ledger: true } });
  const allBalanced = refundTxs.every((tx) =>
    tx.ledger.filter(e => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n) ===
    tx.ledger.filter(e => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n));
  check("concurrent full refund settles once", concurrent.filter(c => c === "ok").length === 1 && finalOrder.refundedKobo === finalOrder.totalKobo && finalOrder.status === "refunded" && allBalanced,
    `outcomes=[${concurrent.join(",")}] refunded=${finalOrder.refundedKobo}/${finalOrder.totalKobo} status=${finalOrder.status} ledgerBalanced=${allBalanced} payment=${finalPayment.status}`);

  const repeatCode = await refundPayment({ orderId: order.id, actorId: admin.id, reason: "Repeat" }).then(() => "ok").catch((error) => (error as { code?: string }).code ?? "error");
  check("repeated refund rejected", repeatCode === "already_refunded", `code=${repeatCode}`);

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
  process.exit(results.some(r => r.status === "FAIL") ? 1 : 0);
}

main().catch(async (error) => { console.error("FATAL", error); await prisma.$disconnect(); process.exit(1); });
