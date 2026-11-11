import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { adapters } from "../lib/payments/adapters";
import { confirmPayment, initializePayment } from "../lib/payments/service";

/**
 * Configured-provider failure, timeout and safe retry.
 *
 *   npx tsx scripts/payments-provider-failure.ts
 *
 * Mutates the in-process adapter object to inject a configured provider that
 * times out, so no network call and no paid operation occurs. The injected
 * faults live only inside this process.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (error) {
    failures += 1;
    rows.push({ name, status: "FAIL", detail: String(inspect(error, { depth: 3 })).slice(0, 900) });
  }
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const passwordHash = await hashPassword(`Provider-${randomUUID()}`);
  const buyer = await prisma.user.create({ data: { email: `prov-${runId}-buyer@example.test`, name: "Provider buyer", actorType: "CUSTOMER", passwordHash } });
  const seller = await prisma.user.create({ data: { email: `prov-${runId}-seller@example.test`, name: "Provider seller", actorType: "VENDOR", passwordHash } });
  const vendor = await prisma.vendor.create({
    data: { ownerId: seller.id, name: `Prov Vendor ${runId}`, slug: `prov-vendor-${runId}`, market: "Alaba", pickupAddress: "1 Prov Way", pickupPhone: "+2348000000000", status: "VERIFIED" }
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `PROV-${runId}`, customerId: buyer.id, vendorId: vendor.id,
      subtotalKobo: 10_000n, totalKobo: 10_100n, deliveryAddress: "1 Prov Street", contactName: "Provider buyer", contactPhone: "+2348000000002"
    }
  });

  const affiliateUser = await prisma.user.create({ data: { email: `prov-${runId}-aff@example.test`, name: "Provider affiliate", actorType: "CUSTOMER", passwordHash } });
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliateUser.id, termsVersion: "prov", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `prov-${runId}`, name: "Provider campaign", vertical: "shop", status: "ACTIVE", commissionBps: 500, budgetKobo: 1_000_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  const link = await prisma.affiliateLink.create({
    data: { affiliateId: profile.id, campaignId: campaign.id, code: runId.toUpperCase().slice(0, 10), destination: "/" }
  });
  const touch = await prisma.attributionTouch.create({
    data: { linkId: link.id, visitorKey: `prov-visitor-${runId}`, consent: true, expiresAt: new Date(Date.now() + 86_400_000) }
  });
  await prisma.orderAttribution.create({
    data: { orderId: order.id, touchId: touch.id, linkId: link.id, affiliateId: profile.id, campaignId: campaign.id, expiresAt: touch.expiresAt }
  });

  const original = { ...adapters.paystack };
  const patch = (overrides: Partial<typeof original>) => Object.assign(adapters.paystack, overrides);
  let reference = "";

  try {
    await check("1. A configured provider timeout fails the payment attempt and charges nothing", async () => {
      patch({
        isConfigured: () => true,
        supportsCountry: () => true,
        initialize: async () => { throw new Error("provider timeout after 15000ms"); }
      } as Partial<typeof original>);
      let thrown: unknown = null;
      try {
        await initializePayment({ orderId: order.id, userId: buyer.id, provider: "paystack", callbackUrl: "http://localhost:3017/orders" });
      } catch (error) { thrown = error; }
      assert(thrown, "a provider timeout did not throw");
      const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
      assert(payments.length === 1 && payments[0].status === "FAILED", `expected one FAILED payment, got ${JSON.stringify(payments.map((p) => p.status))}`);
      assert(payments[0].failureReason?.includes("timeout"), `failure reason not preserved: ${payments[0].failureReason}`);
      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert(fresh.paymentStatus === "pending", `order payment status changed to ${fresh.paymentStatus}`);
      assert((await prisma.affiliateConversion.count({ where: { entityId: order.id } })) === 0, "a commission was created for a failed payment");
      return `FAILED payment with the timeout reason, order still pending, zero conversions`;
    });

    await check("2. A retry after the provider recovers creates a new attempt", async () => {
      patch({ initialize: async (input) => ({ providerReference: input.reference, status: "PENDING", redirectUrl: undefined, raw: { recovered: true } }) } as Partial<typeof original>);
      const started = await initializePayment({ orderId: order.id, userId: buyer.id, provider: "paystack", callbackUrl: "http://localhost:3017/orders" });
      reference = started.reference;
      const payments = await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
      assert(payments.length === 2, `expected two payment attempts, got ${payments.length}`);
      assert(payments[1].status === "PENDING", `retry status is ${payments[1].status}`);
      return `second attempt ${reference} is PENDING; the failed attempt is retained for reconciliation`;
    });

    await check("3. A verification timeout leaves the payment PENDING and creates no commission", async () => {
      patch({ verify: async () => { throw new Error("provider verify timeout"); } } as Partial<typeof original>);
      let thrown: unknown = null;
      try { await confirmPayment({ reference, provider: "paystack" }); } catch (error) { thrown = error; }
      assert(thrown, "a verification timeout did not throw");
      const payment = await prisma.payment.findUniqueOrThrow({ where: { providerReference: reference } });
      assert(payment.status === "PENDING", `payment became ${payment.status} after a verification timeout`);
      assert((await prisma.affiliateConversion.count({ where: { entityId: order.id } })) === 0, "commission created despite unverified payment");
      return `payment still PENDING, zero conversions, retry is safe`;
    });

    await check("4. The verified retry completes, pays once and creates exactly one commission", async () => {
      patch({
        verify: async (providerReference) => ({
          status: "COMPLETED", amountMinor: order.totalKobo, currency: "NGN",
          providerReference, raw: { simulated: true, note: "Injected in-process verification" }
        })
      } as Partial<typeof original>);
      const first = await confirmPayment({ reference, provider: "paystack" });
      assert(first.status === "COMPLETED" && first.duplicate === false, `confirm returned ${JSON.stringify(first)}`);
      const duplicate = await confirmPayment({ reference, provider: "paystack" });
      assert(duplicate.duplicate === true, "duplicate confirmation was not reported");

      const conversions = await prisma.affiliateConversion.findMany({ where: { entityId: order.id } });
      assert(conversions.length === 1, `expected one conversion, got ${conversions.length}`);
      assert(conversions[0].amountKobo === 500n, `expected 500 kobo commission, got ${conversions[0].amountKobo}`);
      const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert(paid.paymentStatus === "paid", `order payment status is ${paid.paymentStatus}`);
      const completed = await prisma.payment.count({ where: { orderId: order.id, status: "COMPLETED" } });
      assert(completed === 1, `expected one COMPLETED payment, got ${completed}`);
      return `one COMPLETED payment, one 500-kobo conversion, duplicate flagged`;
    });
  } finally {
    Object.assign(adapters.paystack, original);
  }

  console.log(JSON.stringify({ runId, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
