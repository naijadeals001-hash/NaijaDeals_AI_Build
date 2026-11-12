/**
 * Plus+ lifecycle acceptance.
 *
 * Verifies the service layer against a verified isolated TEST database:
 *   - draft content is not public; publishing makes it public;
 *   - schedule windows and language/country scope are enforced;
 *   - expired benefits are excluded;
 *   - a priced plan cannot activate without paid approval and an approved,
 *     effective term; activation makes its enabled country Available;
 *   - membership/entitlement redemption is ownership-checked, ACTIVE-only,
 *     expiry-aware and idempotent;
 *   - audited actions actually create AuditLog rows.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/plus-lifecycle-acceptance.ts
 *
 * The guard runs before Prisma or any service is imported, so the process
 * cannot connect to the daily database. Fixtures are run-tagged and removed in
 * a finally block.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: Check[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
    ? ((error as { code: string }).code)
    : null;
}

async function expectCode(code: string, fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    const actual = errorCode(error);
    assert(actual === code, `expected error code ${code}, received ${actual ?? "none"}: ${(error as Error)?.message ?? error}`);
    return actual;
  }
  throw new Error(`expected ${code}, but the operation succeeded`);
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "User",
      "AuditLog",
      "SystemEvent",
      "PlusContentCard",
      "PlusPlan",
      "PlusPlanCountry",
      "PlusPlanTerm",
      "PlusMembership",
      "PlusEntitlement",
      "PlusRedemption",
      "PlusBenefit",
      "PlusPromotion"
    ]
  });

  // Import only after the guard has redirected DATABASE_URL to the verified target.
  const [{ PrismaClient }, contentService, planService, membershipService, benefitService, promotionService, availabilityService, publicData] =
    await Promise.all([
      import("@prisma/client"),
      import("@/lib/services/plus/content.service"),
      import("@/lib/services/plus/plan.service"),
      import("@/lib/services/plus/membership.service"),
      import("@/lib/services/plus/benefit.service"),
      import("@/lib/services/plus/promotion.service"),
      import("@/lib/services/plus/availability"),
      import("@/lib/data/plus")
    ]);

  const prisma = new PrismaClient();
  const { prisma: sharedPrisma } = await import("@/lib/prisma");
  const run = randomUUID().replace(/-/g, "").slice(0, 8);
  const prefix = `plus-life-${run}`;
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  const created = {
    userIds: [] as string[],
    contentKeys: [] as string[],
    planCodes: [] as string[],
    membershipIds: [] as string[],
    entitlementIds: [] as string[],
    redemptionIds: [] as string[],
    benefitKeys: [] as string[],
    promotionKeys: [] as string[]
  };

  const admin = await prisma.user.create({
    data: {
      email: `${prefix}-admin@plus.test`,
      name: "Plus lifecycle admin",
      actorType: "ADMIN",
      countryCode: "NG"
    }
  });
  created.userIds.push(admin.id);

  // The service layer only reads actorType/roles for permission checks. The
  // persisted user exists so audit foreign keys remain valid.
  const actor = {
    ...admin,
    roles: [{ role: { id: "test-role", name: "super_admin", description: null, createdAt: now } }],
    vendors: []
  } as unknown as import("@/lib/auth/session").SessionUser;

  try {
    const contentKey = `${prefix}-current`;
    const futureKey = `${prefix}-future`;
    const expiredKey = `${prefix}-expired`;
    const frenchKey = `${prefix}-french`;
    created.contentKeys.push(contentKey, futureKey, expiredKey, frenchKey);

    const current = await contentService.createContent(actor, {
      key: contentKey,
      title: "Lifecycle awareness card",
      description: "A published card used by the Plus+ lifecycle acceptance run.",
      imageUrl: "/generated/shop/hero-desktop.webp",
      imageAlt: "Shopper carrying paper bags at an outdoor market",
      href: "/naijashop",
      startsAt: new Date(now.getTime() - day).toISOString(),
      endsAt: new Date(now.getTime() + day).toISOString(),
      countries: []
    });

    await check("draft content is not public", async () => {
      const data = await publicData.loadPlusPublicData(now);
      assert(!data.cards.some((card) => card.id === current.id), "draft card appeared on the public page");
      return `state=${data.state}, cards=${data.cards.length}`;
    });

    await check("publishing makes content public", async () => {
      await contentService.publishContent(actor, current.id);
      const data = await publicData.loadPlusPublicData(now);
      assert(data.cards.some((card) => card.id === current.id), "published card missing from public data");
      return `cards=${data.cards.length}`;
    });

    await check("schedule boundaries exclude future and expired content", async () => {
      const future = await contentService.createContent(actor, {
        key: futureKey,
        title: "Future awareness card",
        description: "Scheduled for a later window.",
        imageUrl: "/generated/shop/hero-desktop.webp",
        imageAlt: "Shopper carrying paper bags at an outdoor market",
        href: "/naijashop",
        startsAt: new Date(now.getTime() + day).toISOString(),
        endsAt: new Date(now.getTime() + 2 * day).toISOString()
      });
      await contentService.publishContent(actor, future.id);

      const expired = await contentService.createContent(actor, {
        key: expiredKey,
        title: "Expired awareness card",
        description: "Outside its publication window.",
        imageUrl: "/generated/shop/hero-desktop.webp",
        imageAlt: "Shopper carrying paper bags at an outdoor market",
        href: "/naijashop",
        startsAt: new Date(now.getTime() - 2 * day).toISOString(),
        endsAt: new Date(now.getTime() - day).toISOString()
      });
      await contentService.publishContent(actor, expired.id);

      const currentData = await publicData.loadPlusPublicData(now);
      assert(!currentData.cards.some((card) => card.id === future.id), "future card is visible before startsAt");
      assert(!currentData.cards.some((card) => card.id === expired.id), "expired card is visible after endsAt");

      const futureData = await publicData.loadPlusPublicData(new Date(now.getTime() + day + 60_000));
      assert(futureData.cards.some((card) => card.id === future.id), "future card is not visible inside its window");
      return "future hidden now, visible inside window; expired hidden";
    });

    await check("language filter excludes non-English cards", async () => {
      const french = await contentService.createContent(actor, {
        key: frenchKey,
        title: "Carte en français",
        description: "Cette carte ne doit pas apparaître sur la page anglaise.",
        imageUrl: "/generated/shop/hero-desktop.webp",
        imageAlt: "Shopper carrying paper bags at an outdoor market",
        href: "/naijashop",
        language: "fr"
      });
      await contentService.publishContent(actor, french.id);
      const data = await publicData.loadPlusPublicData(now);
      assert(!data.cards.some((card) => card.id === french.id), "French card appeared in the English public data");
      return "language=fr excluded";
    });

    await check("unknown country codes are rejected", async () => {
      await expectCode("unknown_country", () =>
        contentService.createContent(actor, {
          key: `${prefix}-bad-country`,
          title: "Bad country",
          description: "Must be rejected.",
          imageUrl: "/generated/shop/hero-desktop.webp",
          imageAlt: "Shopper carrying paper bags at an outdoor market",
          href: "/naijashop",
          countries: ["ZZ"]
        })
      );
      return "countries=ZZ -> unknown_country";
    });

    await check("unsafe hrefs and image URLs are rejected", async () => {
      await expectCode("invalid_url", () =>
        contentService.createContent(actor, {
          key: `${prefix}-bad-href`,
          title: "Bad href",
          description: "Must be rejected.",
          imageUrl: "/generated/shop/hero-desktop.webp",
          imageAlt: "Shopper carrying paper bags at an outdoor market",
          href: "javascript:alert(1)"
        })
      );
      await expectCode("invalid_url", () =>
        contentService.createContent(actor, {
          key: `${prefix}-bad-image`,
          title: "Bad image",
          description: "Must be rejected.",
          imageUrl: "javascript:alert(1)",
          imageAlt: "Bad",
          href: "/naijashop"
        })
      );
      return "javascript: href and image rejected";
    });

    /* ---------------------------------------------------------------------
     * Priced plan activation.
     * ------------------------------------------------------------------- */
    const planCode = `${prefix}-plan`;
    created.planCodes.push(planCode);

    await check("country is not Available before activation", async () => {
      const availability = await availabilityService.getPlusAvailability(now);
      const ng = availability.countries.find((country) => country.code === "NG");
      assert(ng && !ng.available, "NG was available before a plan was activated");
      return "NG not yet available";
    });

    const plan = await planService.createPlan(actor, {
      code: planCode,
      name: "Lifecycle plan",
      description: "A priced plan used by the lifecycle acceptance run.",
      currency: "NGN",
      priceMinor: "500000",
      billingPeriod: "MONTHLY",
      paidActivationApproved: false
    });
    await planService.setPlanCountry(actor, plan.id, { countryCode: "NG", enabled: true });

    await check("priced activation is refused without paid approval", async () => {
      await expectCode("paid_activation_not_approved", () => planService.activatePlan(actor, plan.id));
      return "paid_activation_not_approved";
    });

    await check("paid approval alone is not enough without an approved term", async () => {
      await planService.updatePlan(actor, plan.id, { paidActivationApproved: true });
      await expectCode("paid_activation_not_approved", () => planService.activatePlan(actor, plan.id));
      return "still refused without term";
    });

    const term = await planService.createPlanTerm(actor, plan.id, {
      version: 1,
      priceMinor: "500000",
      currency: "NGN",
      billingPeriod: "MONTHLY",
      cancellationSummary: "Cancel before the next billing date.",
      effectiveFrom: new Date(now.getTime() - day).toISOString()
    });

    await check("unapproved term does not unlock activation", async () => {
      await expectCode("paid_activation_not_approved", () => planService.activatePlan(actor, plan.id));
      return "term exists but not approved";
    });

    await check("approved effective term unlocks activation and country availability", async () => {
      await planService.approvePlanTerm(actor, plan.id, term.id);
      const activated = await planService.activatePlan(actor, plan.id);
      assert(activated.status === "ACTIVE", "plan did not become ACTIVE");
      const availability = await availabilityService.getPlusAvailability(now);
      const ng = availability.countries.find((country) => country.code === "NG");
      assert(ng?.available, "NG is not available after activation");
      assert(ng.plans.some((entry) => entry.id === plan.id), "activated plan missing from NG");
      assert(availability.membershipOpen, "membershipOpen is false after activation");
      assert(availability.paidActivationApproved, "paidActivationApproved flag is false");
      return `NG available, price=${ng.plans[0]?.priceLabel ?? "?"}`;
    });

    /* ---------------------------------------------------------------------
     * Benefits.
     * ------------------------------------------------------------------- */
    const benefitKey = `${prefix}-benefit`;
    const scopedBenefitKey = `${prefix}-benefit-scope`;
    const expiredBenefitKey = `${prefix}-benefit-expired`;
    const orphanBenefitKey = `${prefix}-benefit-orphan`;
    created.benefitKeys.push(benefitKey, scopedBenefitKey, expiredBenefitKey, orphanBenefitKey);

    await check("published benefit is public only where its plan is available", async () => {
      const benefit = await benefitService.createBenefit(actor, {
        key: benefitKey,
        title: "Lifecycle benefit",
        description: "A genuine benefit attached to the lifecycle plan.",
        planId: plan.id,
        countries: []
      });
      await benefitService.publishBenefit(actor, benefit.id);
      const data = await publicData.loadPlusPublicData(now);
      const publicBenefit = data.benefits.find((entry) => entry.id === benefit.id);
      assert(publicBenefit, "published benefit missing from public data");
      assert(
        publicBenefit.eligibleCountries.some((country) => country.code === "NG"),
        "benefit does not list NG as eligible"
      );
      return `eligible=${publicBenefit.eligibleCountries.map((country) => country.code).join(",")}`;
    });

    await check("benefit country scope cannot exceed plan availability", async () => {
      const benefit = await benefitService.createBenefit(actor, {
        key: scopedBenefitKey,
        title: "Ghana-only benefit",
        description: "The plan is only enabled in NG.",
        planId: plan.id,
        countries: ["GH"]
      });
      await benefitService.publishBenefit(actor, benefit.id);
      const data = await publicData.loadPlusPublicData(now);
      assert(!data.benefits.some((entry) => entry.id === benefit.id), "benefit appeared for a country where the plan is unavailable");
      return "plan NG vs benefit GH -> excluded";
    });

    await check("expired benefit is excluded", async () => {
      const benefit = await benefitService.createBenefit(actor, {
        key: expiredBenefitKey,
        title: "Expired benefit",
        description: "Outside its window.",
        planId: plan.id,
        countries: [],
        startsAt: new Date(now.getTime() - 2 * day).toISOString(),
        endsAt: new Date(now.getTime() - day).toISOString()
      });
      await benefitService.publishBenefit(actor, benefit.id);
      const data = await publicData.loadPlusPublicData(now);
      assert(!data.benefits.some((entry) => entry.id === benefit.id), "expired benefit appeared publicly");
      return "endsAt in the past -> excluded";
    });

    await check("benefit without a plan cannot be published", async () => {
      const benefit = await benefitService.createBenefit(actor, {
        key: orphanBenefitKey,
        title: "Orphan benefit",
        description: "No plan attached.",
        countries: []
      });
      await expectCode("plan_required", () => benefitService.publishBenefit(actor, benefit.id));
      return "plan_required";
    });

    /* ---------------------------------------------------------------------
     * Promotions.
     * ------------------------------------------------------------------- */
    const houseKey = `${prefix}-house`;
    const sponsoredKey = `${prefix}-sponsored`;
    const sponsorlessKey = `${prefix}-sponsorless`;
    created.promotionKeys.push(houseKey, sponsoredKey, sponsorlessKey);

    await check("house promotion publishes with a house label", async () => {
      const promotion = await promotionService.createPromotion(actor, {
        key: houseKey,
        kind: "HOUSE",
        title: "House announcement",
        body: "A NaijaDeals announcement used by the lifecycle acceptance run.",
        href: "/naijashop/plus"
      });
      await promotionService.submitPromotion(actor, promotion.id);
      await promotionService.publishPromotion(actor, promotion.id);
      const data = await publicData.loadPlusPublicData(now);
      const publicPromotion = data.promotions.find((entry) => entry.id === promotion.id);
      assert(publicPromotion, "house promotion missing publicly");
      assert(publicPromotion.kind === "HOUSE", "house promotion kind changed");
      assert(publicPromotion.disclosureLabel === "NaijaDeals", `unexpected house disclosure ${publicPromotion.disclosureLabel}`);
      assert(publicPromotion.sponsorName === null, "house promotion exposes a sponsor");
      return "house published with NaijaDeals label";
    });

    await check("sponsored promotion requires review and shows its disclosure", async () => {
      const promotion = await promotionService.createPromotion(actor, {
        key: sponsoredKey,
        kind: "SPONSORED",
        title: "Sponsored placement",
        body: "A sponsored placement used by the lifecycle acceptance run.",
        sponsorName: "Lifecycle Sponsor",
        disclosureLabel: "Sponsored",
        campaignRef: `${prefix}-campaign`
      });
      await promotionService.submitPromotion(actor, promotion.id);
      await promotionService.approvePromotion(actor, promotion.id);
      await promotionService.publishPromotion(actor, promotion.id);
      const data = await publicData.loadPlusPublicData(now);
      const publicPromotion = data.promotions.find((entry) => entry.id === promotion.id);
      assert(publicPromotion, "sponsored promotion missing publicly");
      assert(publicPromotion.kind === "SPONSORED", "sponsored promotion kind changed");
      assert(publicPromotion.sponsorName === "Lifecycle Sponsor", "sponsor name missing");
      assert(publicPromotion.disclosureLabel === "Sponsored", "disclosure label missing");
      return "sponsored published with label and sponsor";
    });

    await check("sponsored promotion cannot be approved without a sponsor", async () => {
      const promotion = await promotionService.createPromotion(actor, {
        key: sponsorlessKey,
        kind: "SPONSORED",
        title: "Sponsorless placement",
        body: "Must not pass review without a sponsor name."
      });
      await promotionService.submitPromotion(actor, promotion.id);
      await expectCode("sponsor_required", () => promotionService.approvePromotion(actor, promotion.id));
      await promotionService.rejectPromotion(actor, promotion.id, { reason: "Missing sponsor." });
      await promotionService.updatePromotion(actor, promotion.id, { sponsorName: "Late Sponsor" });
      await promotionService.submitPromotion(actor, promotion.id);
      await promotionService.approvePromotion(actor, promotion.id);
      return "approval refused, rejected, edited, resubmitted and approved";
    });

    /* ---------------------------------------------------------------------
     * Membership, entitlement and redemption.
     * ------------------------------------------------------------------- */
    const customer = await prisma.user.create({
      data: {
        email: `${prefix}-customer@plus.test`,
        name: "Plus lifecycle customer",
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    const otherCustomer = await prisma.user.create({
      data: {
        email: `${prefix}-other@plus.test`,
        name: "Plus lifecycle other customer",
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    created.userIds.push(customer.id, otherCustomer.id);

    const membership = await membershipService.createMembership(actor, {
      userId: customer.id,
      planId: plan.id,
      status: "ACTIVE"
    });
    created.membershipIds.push(membership.id);

    await check("staff-created active membership is required for entitlement grants", async () => {
      const invited = await membershipService.createMembership(actor, {
        userId: otherCustomer.id,
        planId: plan.id,
        status: "INVITED"
      });
      created.membershipIds.push(invited.id);
      await expectCode("membership_not_active", () =>
        membershipService.grantEntitlement(actor, invited.id, { code: "free-delivery" })
      );
      const entitlement = await membershipService.grantEntitlement(actor, membership.id, { code: "free-delivery" });
      created.entitlementIds.push(entitlement.id);
      assert(entitlement.status === "ACTIVE", "entitlement is not ACTIVE");
      return "INVITED refused, ACTIVE granted";
    });

    await check("redemption verifies ownership", async () => {
      const entitlementId = created.entitlementIds[0]!;
      await expectCode("entitlement_not_found", () =>
        membershipService.redeemEntitlement(otherCustomer.id, {
          entitlementId,
          idempotencyKey: `${prefix}-owner-check`,
          reference: "owner-check"
        })
      );
      return "other account -> entitlement_not_found";
    });

    await check("redemption is idempotent per key", async () => {
      const entitlementId = created.entitlementIds[0]!;
      const key = `${prefix}-redeem-1`;
      const first = await membershipService.redeemEntitlement(customer.id, {
        entitlementId,
        idempotencyKey: key,
        reference: "lifecycle redemption"
      });
      created.redemptionIds.push(first.redemption.id);
      const second = await membershipService.redeemEntitlement(customer.id, {
        entitlementId,
        idempotencyKey: key,
        reference: "lifecycle redemption"
      });
      assert(first.replayed === false, "first redemption was incorrectly reported as a replay");
      assert(second.replayed === true, "replay was not reported");
      assert(second.redemption.id === first.redemption.id, "replay returned a different redemption");
      const count = await prisma.plusRedemption.count({ where: { idempotencyKey: key } });
      assert(count === 1, `expected one redemption row, found ${count}`);
      return `rows=${count}`;
    });

    await check("idempotency key cannot be reused for another entitlement", async () => {
      const otherEntitlement = await membershipService.grantEntitlement(actor, membership.id, { code: "priority-support" });
      created.entitlementIds.push(otherEntitlement.id);
      await expectCode("idempotency_conflict", () =>
        membershipService.redeemEntitlement(customer.id, {
          entitlementId: otherEntitlement.id,
          idempotencyKey: `${prefix}-redeem-1`,
          reference: "conflict"
        })
      );
      return "idempotency_conflict";
    });

    await check("expired entitlement cannot be redeemed", async () => {
      const entitlement = await membershipService.grantEntitlement(actor, membership.id, {
        code: "expiring-benefit",
        expiresAt: new Date(now.getTime() + day).toISOString()
      });
      created.entitlementIds.push(entitlement.id);
      await prisma.plusEntitlement.update({
        where: { id: entitlement.id },
        data: { expiresAt: new Date(now.getTime() - 60_000) }
      });
      await expectCode("entitlement_expired", () =>
        membershipService.redeemEntitlement(customer.id, {
          entitlementId: entitlement.id,
          idempotencyKey: `${prefix}-expired-key`,
          reference: "expired"
        })
      );
      return "entitlement_expired";
    });

    await check("expired entitlement status cannot be redeemed", async () => {
      const entitlement = await membershipService.grantEntitlement(actor, membership.id, { code: "revocable-benefit" });
      created.entitlementIds.push(entitlement.id);
      await membershipService.expireEntitlement(actor, entitlement.id);
      await expectCode("entitlement_not_active", () =>
        membershipService.redeemEntitlement(customer.id, {
          entitlementId: entitlement.id,
          idempotencyKey: `${prefix}-expired-status`,
          reference: "expired-status"
        })
      );
      return "entitlement_not_active";
    });

    await check("audited Plus+ actions create AuditLog rows", async () => {
      const actions = await prisma.auditLog.findMany({
        where: {
          actorId: { in: created.userIds },
          entity: { in: ["PlusContentCard", "PlusPlan", "PlusBenefit", "PlusPromotion", "PlusMembership", "PlusRedemption"] }
        },
        select: { action: true, entity: true }
      });
      const has = (action: string, entity: string) => actions.some((row) => row.action === action && row.entity === entity);
      assert(has("plus.content.published", "PlusContentCard"), "missing content publish audit");
      assert(has("plus.plan.activated", "PlusPlan"), "missing plan activation audit");
      assert(has("plus.benefit.published", "PlusBenefit"), "missing benefit publish audit");
      assert(has("plus.promotion.published", "PlusPromotion"), "missing promotion publish audit");
      assert(has("plus.membership.created", "PlusMembership"), "missing membership creation audit");
      assert(has("plus.redemption.redeemed", "PlusRedemption"), "missing redemption audit");
      return `${actions.length} audit row(s) across six entities`;
    });

    return { target, prefix };
  } finally {
    // Remove audit evidence created by this run before its actors disappear.
    await prisma.auditLog.deleteMany({ where: { actorId: { in: created.userIds } } }).catch(() => undefined);
    await prisma.systemEvent.deleteMany({ where: { actorId: { in: created.userIds } } }).catch(() => undefined);

    const membershipIds = created.membershipIds;
    await prisma.plusRedemption.deleteMany({
      where: { OR: [{ userId: { in: created.userIds } }, { entitlementId: { in: created.entitlementIds } }] }
    }).catch(() => undefined);
    await prisma.plusEntitlement.deleteMany({
      where: { OR: [{ id: { in: created.entitlementIds } }, { membershipId: { in: membershipIds } }] }
    }).catch(() => undefined);
    await prisma.plusMembership.deleteMany({ where: { id: { in: membershipIds } } }).catch(() => undefined);
    await prisma.plusBenefit.deleteMany({ where: { key: { in: created.benefitKeys } } }).catch(() => undefined);
    await prisma.plusPromotion.deleteMany({ where: { key: { in: created.promotionKeys } } }).catch(() => undefined);
    await prisma.plusContentCard.deleteMany({ where: { key: { in: created.contentKeys } } }).catch(() => undefined);
    await prisma.plusPlan.deleteMany({ where: { code: { in: created.planCodes } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);

    const leftovers = await Promise.all([
      prisma.plusContentCard.count({ where: { key: { startsWith: prefix } } }),
      prisma.plusPlan.count({ where: { code: { startsWith: prefix } } }),
      prisma.plusBenefit.count({ where: { key: { startsWith: prefix } } }),
      prisma.plusPromotion.count({ where: { key: { startsWith: prefix } } }),
      prisma.user.count({ where: { email: { startsWith: prefix } } })
    ]).catch(() => [0, 0, 0, 0, 0]);
    if (leftovers.some((count) => count > 0)) console.error(`WARN cleanup left rows: ${leftovers.join(",")}`);

    await prisma.$disconnect().catch(() => undefined);
    await sharedPrisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((result) => {
    const passed = results.filter((row) => row.status === "PASS").length;
    console.log(`\n${passed}/${results.length} checks passed`);
    console.log(`database=${result?.target.databaseName ?? "?"} marker=${result?.target.marker ?? "?"} run=${result?.prefix ?? "?"}`);
    if (passed !== results.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Prisma is disconnected in main's finally; nothing else keeps the process open.
  });
