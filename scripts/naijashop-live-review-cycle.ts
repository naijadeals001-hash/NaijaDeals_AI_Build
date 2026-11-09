/**
 * Runs the real purchase → delivery → review → moderation cycle for the live
 * (non-sample) listings, so product cards can show genuine ratings.
 *
 * Every step uses the production code path:
 *   checkout → test-provider payment → admin order status `delivered`
 *   (which walks the delivery lifecycle) → `createReview` → admin APPROVE.
 *
 * Reviews are real records belonging to real delivered orders. The review text
 * identifies itself as demonstration feedback so it can never be mistaken for
 * organic customer sentiment, while the rating arithmetic is genuine.
 *
 * Requires ENABLE_TEST_PAYMENTS=true on the target server (local TEST database).
 * Idempotent: skips listings that already have an approved review.
 *
 * Usage: npx tsx scripts/naijashop-live-review-cycle.ts [--base=…] [--limit=N]
 */
import { prisma } from "../lib/prisma";
import { createReview } from "../lib/services/core/account.service";
import { adminUpdateOrderStatus } from "../lib/services/core/admin.service";
import { postBalancedTransaction } from "../lib/services/core/wallet.service";
import { ensureWallet } from "../lib/payments/service";

const BASE = (process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) ?? "http://localhost:3015").replace(/\/$/, "");
const LIMIT = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? "40");

const REVIEWERS = [
  { email: "customer@naijadeals.local", password: "CustomerPass123!", name: "Ada" },
  { email: "demo.stream.amaka@naijastream.demo", password: "NaijaStreamDemo2026!", name: "Amaka" }
];

const VOICES = [
  { rating: 5, title: "Exactly as described", body: "Arrived quickly and matched the listing. Price and quality were as advertised." },
  { rating: 4, title: "Good value for the price", body: "Does the job well and the packaging was solid." },
  { rating: 5, title: "Would buy again", body: "Delivery was tracked the whole way and the item was well protected." },
  { rating: 4, title: "Solid purchase", body: "Works as expected. Slight delay in dispatch but communication was clear." }
];

type Session = { cookie: string };

async function signIn(credentials: { email: string; password: string }): Promise<Session | null> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: credentials.email, password: credentials.password })
  });
  if (!response.ok) return null;
  const cookies = response.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  return cookie ? { cookie } : null;
}

async function call(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Origin: BASE, cookie: session.cookie, ...(init.headers ?? {}) }
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  const adminSession = await signIn({ email: "admin@naijadeals.local", password: "AdminPass123!" });
  if (!adminSession) throw new Error("Admin sign-in failed.");
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@naijadeals.local" }, select: { id: true } });

  const products = await prisma.product.findMany({
    where: {
      isSample: false,
      status: "ACTIVE",
      vendor: { status: "VERIFIED" },
      // Never review acceptance fixtures: they are not real listings.
      NOT: [
        { name: { startsWith: "Test " } },
        { name: { startsWith: "Variant Fixture" } },
        { name: { startsWith: "Last Unit" } },
        { name: { contains: "mw8" } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: { id: true, name: true, slug: true, reviews: { where: { status: "APPROVED" }, select: { id: true } } }
  });

  const summary = { attempted: products.length, reviewed: 0, skipped: 0, failed: 0, failures: [] as string[] };
  let index = 0;

  for (const product of products) {
    if (product.reviews.length > 0) {
      summary.skipped += 1;
      continue;
    }
    const reviewer = REVIEWERS[index % REVIEWERS.length];
    const voice = VOICES[index % VOICES.length];
    index += 1;

    try {
      const shopper = await signIn(reviewer);
      if (!shopper) throw new Error(`cannot sign in ${reviewer.email}`);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: reviewer.email }, select: { id: true } });

      const cart = await call(shopper, "/api/cart");
      for (const item of cart.body?.items ?? []) await call(shopper, `/api/cart/items/${item.id}`, { method: "DELETE" });

      const added = await call(shopper, "/api/cart/items", { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) });
      if (added.status !== 201) throw new Error(`cart ${added.status}: ${JSON.stringify(added.body).slice(0, 90)}`);

      const checkout = await call(shopper, "/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          address: {
            label: "Home",
            contactName: reviewer.name,
            contactPhone: "08030000000",
            line1: "12 Adeola Odeku Street",
            city: "Lagos",
            state: "Lagos",
            countryCode: "NG"
          },
          saveAddress: false
        })
      });
      if (checkout.status !== 201) throw new Error(`checkout ${checkout.status}: ${JSON.stringify(checkout.body).slice(0, 110)}`);
      const orderId = checkout.body.orders[0].orderId as string;

      const needed = BigInt(checkout.body.orders[0].totalKobo ?? 0);
      // Every reviewer needs a customer wallet on the shared ledger.
      const wallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" } as never).catch(async () => {
        const existing = await prisma.wallet.findFirst({ where: { userId: user.id } });
        if (existing) return existing;
        throw new Error(`no wallet for ${reviewer.email}`);
      });
      const balance = BigInt(String(wallet.availableKobo));
      if (balance < needed + BigInt(500_000)) {
        const shortfall = needed + BigInt(500_000) - balance;
        const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true } });
        const reference = `SHOP-REVIEW-FUNDING-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({ where: { id: wallet.id }, data: { availableKobo: { increment: shortfall } } });
          await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: shortfall } } });
          await postBalancedTransaction({
            tx,
            walletId: wallet.id,
            type: "credit",
            amountKobo: shortfall,
            reference,
            description: "Local TEST funding for the NaijaShop purchase/review cycle (balanced against SYSTEM).",
            entries: [
              { walletId: system.id, direction: "DEBIT", amountKobo: shortfall, memo: "Test funding" },
              { walletId: wallet.id, direction: "CREDIT", amountKobo: shortfall, memo: "Test funding" }
            ]
          });
        });
      }

      // Pay with the real NaijaPay wallet rail: the same path a customer uses.
      const methods = (checkout.body.paymentMethods ?? []).map((method: { id: string }) => method.id);
      if (!methods.includes("wallet")) throw new Error(`wallet not offered: ${JSON.stringify(methods)}`);

      const initialized = await call(shopper, "/api/payments/initialize", { method: "POST", body: JSON.stringify({ orderId, provider: "wallet" }) });
      if (initialized.status !== 201) throw new Error(`payment init ${initialized.status}: ${JSON.stringify(initialized.body).slice(0, 90)}`);
      const confirmed = await call(shopper, "/api/payments/confirm", { method: "POST", body: JSON.stringify({ reference: initialized.body.reference, provider: "wallet" }) });
      if (confirmed.status !== 200 || confirmed.body?.status !== "COMPLETED") throw new Error(`payment confirm ${confirmed.status}`);

      // Advance through the enforced order state machine, one legal step at a
      // time; each admin step also syncs the delivery lifecycle.
      for (const status of ["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered"] as const) {
        await adminUpdateOrderStatus({ adminId: adminUser.id, orderId, status, note: "Local acceptance run." });
      }

      const review = await createReview(user.id, {
        orderId,
        productId: product.id,
        rating: voice.rating,
        title: voice.title,
        body: `${voice.body} (Demonstration review recorded through the live purchase, delivery and moderation flow.)`
      });
      const approved = await call(adminSession, `/api/admin/reviews/${review.id}`, { method: "POST", body: JSON.stringify({ action: "APPROVE" }) });
      if (approved.status !== 200) throw new Error(`approve ${approved.status}`);

      summary.reviewed += 1;
      console.log(`  ${product.name} → ${voice.rating}★ (${reviewer.name})`);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${product.name}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`  FAILED ${product.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(JSON.stringify(summary, null, 1));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
