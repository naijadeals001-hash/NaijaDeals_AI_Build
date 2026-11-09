/**
 * Isolated proof that an escrow release conserves value.
 *
 * Creates its own schema, seeds a buyer/seller/platform and an escrow hold using
 * the SAME shapes as the live paths, then runs the release against the real
 * completeOrder service. Asserts the seller's stored balance equals its journal
 * position afterwards — the exact property that is violated in the shared
 * database for vendor ...n7677z by the commission (see forensics §8a).
 *
 * Usage: npx tsx scripts/naijapay-release-conservation-test.ts
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const schema = "naijapay_release_test";
const base = process.env.DATABASE_URL ?? "";
if (!base) throw new Error("DATABASE_URL is not set");
const url = base + (base.includes("?") ? "&" : "?") + "schema=" + schema;

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
};
const NGN = (k: bigint) => "₦" + (Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

(async () => {
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await admin.$disconnect();

  let db = new PrismaClient({ datasources: { db: { url } } });
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true
  });

  process.env.DATABASE_URL = url;
  const { completeOrder } = await import("../lib/services/core/order.service");

  // ---- seed -------------------------------------------------------------
  const buyerUser = await db.user.create({ data: { email: `buyer@${schema}.local`, name: "Test Buyer", actorType: "CUSTOMER" } });
  const vendorUser = await db.user.create({ data: { email: `seller@${schema}.local`, name: "Test Seller", actorType: "CUSTOMER" } });
  const vendor = await db.vendor.create({ data: { ownerId: vendorUser.id, name: "Conservation Seller", slug: "conservation-seller", market: "Test Market", pickupAddress: "1 Test Street, Lagos", pickupPhone: "08000000000", status: "VERIFIED", commissionBps: 800 } });
  const buyerWallet = await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: buyerUser.id, availableKobo: 30000n } });
  const vendorWallet = await db.wallet.create({ data: { ownerType: "VENDOR", vendorId: vendor.id } });
  const platform = await db.wallet.create({ data: { ownerType: "SYSTEM" } });

  // Mirrors checkout: total = subtotal + delivery fee; commission is a cut of the subtotal.
  const subtotal = 25000n, commission = 2000n, delivery = 1500n, total = subtotal + delivery;
  const payable = subtotal - commission + delivery;
  const order = await db.order.create({
    data: {
      orderNumber: "ND-TEST-CONSERVE-1",
      customerId: buyerUser.id,
      vendorId: vendor.id,
      status: "delivered",
      deliveryAddress: "1 Test Street, Lagos",
      contactName: "Test Buyer",
      contactPhone: "08000000000",
      subtotalKobo: subtotal,
      commissionKobo: commission,
      deliveryFeeKobo: delivery,
      totalKobo: total
    }
  });
  await db.payment.create({ data: { orderId: order.id, provider: "wallet", status: "COMPLETED", amountKobo: total, providerReference: "TEST-CONSERVE-1", idempotencyKey: "TEST-CONSERVE-1" } });
  await db.escrowHold.create({ data: { orderId: order.id, amountKobo: total, status: "held", buyerWalletId: buyerWallet.id, vendorWalletId: vendorWallet.id, reason: "conservation test escrow" } });

  // Escrow hold exactly as recordEscrow writes it.
  await db.wallet.update({ where: { id: buyerWallet.id }, data: { availableKobo: { decrement: total }, heldKobo: { increment: total } } });
  await db.wallet.update({ where: { id: vendorWallet.id }, data: { heldKobo: { increment: total } } });
  await db.walletTransaction.create({
    data: {
      walletId: buyerWallet.id, orderId: order.id, type: "hold", amountKobo: total, reference: `ESCROW-HOLD-${order.id}`,
      description: "Escrow hold for conservation test",
      ledger: { create: [
        { walletId: buyerWallet.id, direction: "DEBIT", amountKobo: total, memo: "Buyer wallet moved to escrow" },
        { walletId: vendorWallet.id, direction: "CREDIT", amountKobo: total, memo: "Vendor payable held in escrow" }
      ] }
    }
  });

  // ---- act --------------------------------------------------------------
  await completeOrder(buyerUser.id, order.id);

  // ---- assert -----------------------------------------------------------
  const w = await db.wallet.findUniqueOrThrow({ where: { id: vendorWallet.id } });
  const entries = await db.ledgerEntry.findMany({ where: { walletId: vendorWallet.id } });
  const journalNet = entries.reduce((s, e) => s + (e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo), 0n);
  const stored = w.availableKobo + w.heldKobo;

  check("seller stored balance equals its journal position", stored === journalNet, `stored ${NGN(stored)} vs journal ${NGN(journalNet)}`);
  check("seller spendable equals payable", w.availableKobo === payable, `${NGN(w.availableKobo)} vs ${NGN(payable)}`);
  check("seller holds nothing after release", w.heldKobo === 0n, NGN(w.heldKobo));

  const platformW = await db.wallet.findUniqueOrThrow({ where: { id: platform.id } });
  check("platform receives the commission", platformW.availableKobo === total - payable, `${NGN(platformW.availableKobo)} vs ${NGN(total - payable)}`);

  const release = await db.walletTransaction.findUniqueOrThrow({ where: { reference: `RELEASE-${order.id}` }, include: { ledger: true } });
  const dr = release.ledger.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + l.amountKobo, 0n);
  const cr = release.ledger.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + l.amountKobo, 0n);
  check("release journal balances", dr === cr, `debit ${NGN(dr)} credit ${NGN(cr)}`);
  check("commission is not credited back to the seller", !release.ledger.some((l) => l.walletId === vendorWallet.id && l.direction === "CREDIT" && l.amountKobo === total - payable && l.memo.includes("Commission")));

  // The buyer's settled position must also conserve.
  const buyerW = await db.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } });
  check("buyer holds nothing after release", buyerW.heldKobo === 0n, NGN(buyerW.heldKobo));

  const conservation = await db.$queryRawUnsafe<Array<{ net: string }>>(`
    SELECT SUM(CASE WHEN direction = 'CREDIT' THEN "amountKobo" ELSE -"amountKobo" END)::text AS net FROM "LedgerEntry"`);
  check("whole journal nets to zero", BigInt(conservation[0].net) === 0n, conservation[0].net);

  await db.$disconnect();
  const cleanup = new PrismaClient({ datasources: { db: { url: base } } });
  await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.$disconnect();

  console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
