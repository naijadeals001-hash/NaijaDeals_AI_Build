/**
 * Plus+ administrator acceptance.
 *
 * Runs the real HTTP API against an isolated TEST database and a server that is
 * connected to it. It creates one session per staff role and probes every Plus+
 * route, asserting the server-side permission boundary rather than trusting a
 * route table.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... PLUS_BASE_URL=http://localhost:3048 \
 *     npx tsx scripts/plus-admin-acceptance.ts
 *
 * The server must already be running against the same verified database. The
 * script refuses to continue when the overview endpoint cannot read Plus+ tables.
 * Fixtures are run-tagged and deleted in a finally block.
 */
import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

const BASE = (process.env.PLUS_BASE_URL ?? "").replace(/\/+$/, "");
const COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";
if (!BASE) throw new Error("PLUS_BASE_URL is required (for example http://localhost:3048).");

type Json = Record<string, any> | null;
type Capability = "read" | "contentWrite" | "contentPublish" | "membership" | "advertiser";
type RoleKey =
  | "super_admin"
  | "plus_publisher"
  | "plus_editor"
  | "plus_membership_admin"
  | "plus_advertiser_reviewer"
  | "admin"
  | "zero_admin"
  | "customer";

const CAPABILITIES: Record<RoleKey, Record<Capability, boolean>> = {
  super_admin: { read: true, contentWrite: true, contentPublish: true, membership: true, advertiser: true },
  plus_publisher: { read: true, contentWrite: false, contentPublish: true, membership: false, advertiser: false },
  plus_editor: { read: true, contentWrite: true, contentPublish: false, membership: false, advertiser: false },
  plus_membership_admin: { read: true, contentWrite: false, contentPublish: false, membership: true, advertiser: false },
  plus_advertiser_reviewer: { read: true, contentWrite: false, contentPublish: false, membership: false, advertiser: true },
  admin: { read: true, contentWrite: true, contentPublish: false, membership: false, advertiser: false },
  zero_admin: { read: true, contentWrite: true, contentPublish: false, membership: false, advertiser: false },
  customer: { read: false, contentWrite: false, contentPublish: false, membership: false, advertiser: false }
};

const ROLE_NAMES: Record<Exclude<RoleKey, "zero_admin" | "customer">, string> = {
  super_admin: "super_admin",
  plus_publisher: "plus_publisher",
  plus_editor: "plus_editor",
  plus_membership_admin: "plus_membership_admin",
  plus_advertiser_reviewer: "plus_advertiser_reviewer",
  admin: "admin"
};

type Result = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: Result[] = [];

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

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    accept: "application/json",
    origin: BASE
  };
  if (token) headers.cookie = `${COOKIE}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let json: Json = null;
  try {
    json = text ? (JSON.parse(text) as Json) : null;
  } catch {
    /* non-JSON error page */
  }
  return { status: response.status, json, text: text.slice(0, 400) };
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "User",
      "Role",
      "UserRole",
      "Session",
      "AuditLog",
      "PlusContentCard",
      "PlusPlan",
      "PlusPlanCountry",
      "PlusPlanTerm",
      "PlusMembership",
      "PlusBenefit",
      "PlusPromotion"
    ]
  });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const run = randomUUID().replace(/-/g, "").slice(0, 8);
  const prefix = `plus-admin-${run}`;
  const day = 24 * 60 * 60 * 1000;
  const now = new Date();
  const roleIds: string[] = [];
  const userIds: string[] = [];
  const tokens = new Map<RoleKey, string>();

  async function roleId(name: string) {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    const created = await prisma.role.create({ data: { name } });
    roleIds.push(created.id);
    return created.id;
  }

  async function createActor(key: RoleKey): Promise<void> {
    const isZeroAdmin = key === "zero_admin";
    const isCustomer = key === "customer";
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${key}@plus.test`,
        name: `Plus acceptance ${key}`,
        actorType: isZeroAdmin ? "ADMIN" : isCustomer ? "CUSTOMER" : "CUSTOMER",
        countryCode: "NG"
      }
    });
    userIds.push(user.id);
    if (!isZeroAdmin && !isCustomer) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: await roleId(ROLE_NAMES[key as Exclude<RoleKey, "zero_admin" | "customer">]) } });
    }
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000) }
    });
    tokens.set(key, token);
  }

  try {
    for (const key of Object.keys(CAPABILITIES) as RoleKey[]) await createActor(key);
    assert(tokens.size === 8, "expected eight sessions");

    const superToken = tokens.get("super_admin")!;

    /* -------------------------------------------------------------------
     * Base fixtures are created through the real API as super_admin.
     * ----------------------------------------------------------------- */
    const contentBase = await api(superToken, "POST", "/api/admin/plus/content", {
      key: `${prefix}-content-base`,
      title: "Acceptance content",
      description: "Base content for the Plus+ permission matrix.",
      imageUrl: "/generated/shop/hero-desktop.webp",
      imageAlt: "Shopper carrying paper bags at an outdoor market",
      href: "/naijashop"
    });
    assert(contentBase.status === 201, `content fixture failed: ${contentBase.status} ${contentBase.text}`);
    const contentId = String(contentBase.json?.id ?? "");

    const planBase = await api(superToken, "POST", "/api/admin/plus/plans", {
      code: `${prefix}-plan-base`,
      name: "Acceptance plan",
      description: "Free base plan for the permission matrix.",
      currency: "NGN",
      priceMinor: "0",
      billingPeriod: "MONTHLY"
    });
    assert(planBase.status === 201, `plan fixture failed: ${planBase.status} ${planBase.text}`);
    const planId = String(planBase.json?.id ?? "");
    assert(contentId && planId, "base fixture ids missing");

    const termBase = await api(superToken, "POST", `/api/admin/plus/plans/${planId}/terms`, {
      version: 1,
      priceMinor: "0",
      currency: "NGN",
      billingPeriod: "MONTHLY",
      effectiveFrom: new Date(now.getTime() - day).toISOString()
    });
    assert(termBase.status === 201, `term fixture failed: ${termBase.status} ${termBase.text}`);
    const termId = String(termBase.json?.id ?? "");
    assert(termId, "term fixture id missing");
    const termApproved = await api(superToken, "POST", `/api/admin/plus/plans/${planId}/terms/${termId}/approve`);
    assert(termApproved.status === 200, `term approval failed: ${termApproved.status} ${termApproved.text}`);

    const benefitBase = await api(superToken, "POST", "/api/admin/plus/benefits", {
      key: `${prefix}-benefit-base`,
      title: "Acceptance benefit",
      description: "Base benefit for the permission matrix.",
      planId
    });
    assert(benefitBase.status === 201, `benefit fixture failed: ${benefitBase.status} ${benefitBase.text}`);
    const benefitId = String(benefitBase.json?.id ?? "");

    const houseSubmit = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-house-submit`,
      kind: "HOUSE",
      title: "House submit fixture",
      body: "House promotion used by the permission matrix.",
      href: "/naijashop/plus"
    });
    assert(houseSubmit.status === 201, `house fixture failed: ${houseSubmit.status} ${houseSubmit.text}`);
    const houseSubmitId = String(houseSubmit.json?.id ?? "");

    const housePublish = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-house-publish`,
      kind: "HOUSE",
      title: "House publish fixture",
      body: "Approved house promotion used by the permission matrix."
    });
    const housePublishId = String(housePublish.json?.id ?? "");
    await api(superToken, "POST", `/api/admin/plus/promotions/${housePublishId}/submit`);
    await api(superToken, "POST", `/api/admin/plus/promotions/${housePublishId}/approve`);

    const sponsoredSubmit = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-sponsored-submit`,
      kind: "SPONSORED",
      title: "Sponsored submit fixture",
      body: "Sponsored promotion used by the permission matrix.",
      sponsorName: "Acceptance Sponsor",
      disclosureLabel: "Sponsored"
    });
    const sponsoredSubmitId = String(sponsoredSubmit.json?.id ?? "");

    const sponsoredApprove = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-sponsored-approve`,
      kind: "SPONSORED",
      title: "Sponsored approve fixture",
      body: "Sponsored promotion awaiting review.",
      sponsorName: "Acceptance Sponsor",
      disclosureLabel: "Sponsored"
    });
    const sponsoredApproveId = String(sponsoredApprove.json?.id ?? "");
    await api(superToken, "POST", `/api/admin/plus/promotions/${sponsoredApproveId}/submit`);

    const sponsoredReject = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-sponsored-reject`,
      kind: "SPONSORED",
      title: "Sponsored reject fixture",
      body: "Sponsored promotion awaiting review.",
      sponsorName: "Acceptance Sponsor",
      disclosureLabel: "Sponsored"
    });
    const sponsoredRejectId = String(sponsoredReject.json?.id ?? "");
    await api(superToken, "POST", `/api/admin/plus/promotions/${sponsoredRejectId}/submit`);

    const sponsoredPublish = await api(superToken, "POST", "/api/admin/plus/promotions", {
      key: `${prefix}-sponsored-publish`,
      kind: "SPONSORED",
      title: "Sponsored publish fixture",
      body: "Approved sponsored promotion.",
      sponsorName: "Acceptance Sponsor",
      disclosureLabel: "Sponsored"
    });
    const sponsoredPublishId = String(sponsoredPublish.json?.id ?? "");
    await api(superToken, "POST", `/api/admin/plus/promotions/${sponsoredPublishId}/submit`);
    const sponsoredApproved = await api(superToken, "POST", `/api/admin/plus/promotions/${sponsoredPublishId}/approve`);
    assert(sponsoredApproved.status === 200, `sponsored approval fixture failed: ${sponsoredApproved.text}`);

    await check("server is connected to the verified Plus+ test database", async () => {
      const response = await api(superToken, "GET", "/api/admin/plus/overview");
      assert(response.status === 200, `overview returned ${response.status}: ${response.text}`);
      assert(response.json?.flags?.checkoutConfigured === false, "checkoutConfigured must be false in this build");
      return `overview 200, database=${target.databaseName}`;
    });

    /* -------------------------------------------------------------------
     * Route probes. Each route declares the capability it actually needs.
     * ----------------------------------------------------------------- */
    type Probe = {
      name: string;
      method: "GET" | "POST" | "PATCH";
      path: string;
      capability: Capability;
      allowedStatus?: number[];
      body?: (role: RoleKey) => Record<string, unknown>;
    };

    const probes: Probe[] = [
      { name: "GET content", method: "GET", path: "/api/admin/plus/content", capability: "read" },
      {
        name: "POST content",
        method: "POST",
        path: "/api/admin/plus/content",
        capability: "contentWrite",
        allowedStatus: [201],
        body: (role) => ({
          key: `${prefix}-content-${role}`,
          title: `Content by ${role}`,
          description: "Created by the permission matrix probe.",
          imageUrl: "/generated/shop/hero-desktop.webp",
          imageAlt: "Shopper carrying paper bags at an outdoor market",
          href: "/naijashop"
        })
      },
      {
        name: "PATCH content",
        method: "PATCH",
        path: `/api/admin/plus/content/${contentId}`,
        capability: "contentWrite",
        body: () => ({ description: "Updated by the permission matrix probe." })
      },
      {
        name: "reorder content",
        method: "POST",
        path: "/api/admin/plus/content/reorder",
        capability: "contentWrite",
        body: () => ({ ids: [contentId] })
      },
      { name: "publish content", method: "POST", path: `/api/admin/plus/content/${contentId}/publish`, capability: "contentPublish" },
      { name: "archive content", method: "POST", path: `/api/admin/plus/content/${contentId}/archive`, capability: "contentPublish" },
      { name: "GET plans", method: "GET", path: "/api/admin/plus/plans", capability: "read" },
      {
        name: "POST plan",
        method: "POST",
        path: "/api/admin/plus/plans",
        capability: "membership",
        allowedStatus: [201],
        body: (role) => ({
          code: `${prefix}-plan-${role}`,
          name: `Plan by ${role}`,
          description: "Created by the permission matrix probe.",
          currency: "NGN",
          priceMinor: "0",
          billingPeriod: "MONTHLY"
        })
      },
      {
        name: "PATCH plan",
        method: "PATCH",
        path: `/api/admin/plus/plans/${planId}`,
        capability: "membership",
        body: () => ({ description: "Updated by the permission matrix probe." })
      },
      {
        name: "set plan country",
        method: "POST",
        path: `/api/admin/plus/plans/${planId}/countries`,
        capability: "membership",
        body: () => ({ countryCode: "GH", enabled: true })
      },
      {
        name: "create plan term",
        method: "POST",
        path: `/api/admin/plus/plans/${planId}/terms`,
        capability: "membership",
        allowedStatus: [201],
        body: () => ({
          billingPeriod: "MONTHLY",
          priceMinor: "0",
          currency: "NGN",
          effectiveFrom: new Date(now.getTime() - day).toISOString()
        })
      },
      {
        name: "approve plan term",
        method: "POST",
        path: `/api/admin/plus/plans/${planId}/terms/${termId}/approve`,
        capability: "membership"
      },
      { name: "activate plan", method: "POST", path: `/api/admin/plus/plans/${planId}/activate`, capability: "membership" },
      { name: "GET benefits", method: "GET", path: "/api/admin/plus/benefits", capability: "read" },
      {
        name: "POST benefit",
        method: "POST",
        path: "/api/admin/plus/benefits",
        capability: "contentWrite",
        allowedStatus: [201],
        body: (role) => ({
          key: `${prefix}-benefit-${role}`,
          title: `Benefit by ${role}`,
          description: "Created by the permission matrix probe.",
          planId
        })
      },
      { name: "publish benefit", method: "POST", path: `/api/admin/plus/benefits/${benefitId}/publish`, capability: "contentPublish" },
      { name: "GET promotions", method: "GET", path: "/api/admin/plus/promotions", capability: "read" },
      {
        name: "POST promotion",
        method: "POST",
        path: "/api/admin/plus/promotions",
        capability: "contentWrite",
        allowedStatus: [201],
        body: (role) => ({
          key: `${prefix}-promo-${role}`,
          kind: "HOUSE",
          title: `Promotion by ${role}`,
          body: "Created by the permission matrix probe.",
          href: "/naijashop/plus"
        })
      },
      {
        name: "submit house promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${houseSubmitId}/submit`,
        capability: "contentPublish"
      },
      {
        name: "approve house promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${houseSubmitId}/approve`,
        capability: "contentPublish"
      },
      {
        name: "publish house promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${housePublishId}/publish`,
        capability: "contentPublish"
      },
      {
        name: "submit sponsored promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${sponsoredSubmitId}/submit`,
        capability: "contentWrite"
      },
      {
        name: "approve sponsored promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${sponsoredApproveId}/approve`,
        capability: "advertiser"
      },
      {
        name: "reject sponsored promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${sponsoredRejectId}/reject`,
        capability: "advertiser"
      },
      {
        name: "publish sponsored promotion",
        method: "POST",
        path: `/api/admin/plus/promotions/${sponsoredPublishId}/publish`,
        capability: "contentPublish"
      },
      { name: "GET overview", method: "GET", path: "/api/admin/plus/overview", capability: "read" }
    ];

    for (const role of Object.keys(CAPABILITIES) as RoleKey[]) {
      const token = tokens.get(role)!;
      const failures: string[] = [];
      for (const probe of probes) {
        const body = probe.body ? probe.body(role) : undefined;
        const response = await api(token, probe.method, probe.path, body);
        const allowed = CAPABILITIES[role][probe.capability];
        const expected = allowed ? probe.allowedStatus ?? [200] : [403];
        if (!expected.includes(response.status)) {
          const code = response.json?.code ? ` (${response.json.code})` : "";
          failures.push(`${probe.name}: expected ${expected.join("/")} got ${response.status}${code}`);
        }
      }
      await check(`permission matrix — ${role}`, async () => {
        assert(failures.length === 0, failures.join(" | "));
        return `${probes.length}/${probes.length} route expectations matched`;
      });
    }

    await check("unauthenticated request is rejected", async () => {
      const response = await api(null, "GET", "/api/admin/plus/content");
      assert(response.status === 401, `expected 401, got ${response.status}`);
      return "401 unauthenticated";
    });

    await check("ordinary admin cannot publish, price or approve sponsors", async () => {
      const token = tokens.get("admin")!;
      const publish = await api(token, "POST", `/api/admin/plus/content/${contentId}/publish`);
      const plan = await api(token, "POST", "/api/admin/plus/plans", {
        code: `${prefix}-admin-denied-plan`,
        name: "Denied plan",
        description: "Must not be created.",
        currency: "NGN",
        priceMinor: "0"
      });
      const approve = await api(token, "POST", `/api/admin/plus/promotions/${sponsoredApproveId}/approve`);
      assert(publish.status === 403, `admin publish returned ${publish.status}`);
      assert(plan.status === 403, `admin plan create returned ${plan.status}`);
      assert(approve.status === 403, `admin sponsor approval returned ${approve.status}`);
      return "publish/plan/sponsor all 403";
    });

    await check("specialist roles cannot borrow one another's capability", async () => {
      const publisher = tokens.get("plus_publisher")!;
      const editor = tokens.get("plus_editor")!;
      const advertiser = tokens.get("plus_advertiser_reviewer")!;
      const membership = tokens.get("plus_membership_admin")!;
      const publisherDraft = await api(publisher, "POST", "/api/admin/plus/content", {
        key: `${prefix}-publisher-denied`,
        title: "Denied",
        description: "Must not be created.",
        imageUrl: "/generated/shop/hero-desktop.webp",
        imageAlt: "Market",
        href: "/naijashop"
      });
      const editorPublish = await api(editor, "POST", `/api/admin/plus/content/${contentId}/publish`);
      const advertiserPublish = await api(advertiser, "POST", `/api/admin/plus/promotions/${sponsoredPublishId}/publish`);
      const membershipPublish = await api(membership, "POST", `/api/admin/plus/benefits/${benefitId}/publish`);
      assert(publisherDraft.status === 403, `publisher draft returned ${publisherDraft.status}`);
      assert(editorPublish.status === 403, `editor publish returned ${editorPublish.status}`);
      assert(advertiserPublish.status === 403, `advertiser publish returned ${advertiserPublish.status}`);
      assert(membershipPublish.status === 403, `membership publish returned ${membershipPublish.status}`);
      return "publisher cannot draft; editor cannot publish; advertiser cannot publish; membership cannot publish";
    });

    await check("zero-role ADMIN keeps the admin fail-safe without Plus+ elevation", async () => {
      const token = tokens.get("zero_admin")!;
      const read = await api(token, "GET", "/api/admin/plus/content");
      const write = await api(token, "POST", "/api/admin/plus/content", {
        key: `${prefix}-zero-admin-content`,
        title: "Zero-role admin content",
        description: "Fail-safe admin surface.",
        imageUrl: "/generated/shop/hero-desktop.webp",
        imageAlt: "Market",
        href: "/naijashop"
      });
      const publish = await api(token, "POST", `/api/admin/plus/content/${contentId}/publish`);
      assert(read.status === 200, `read returned ${read.status}`);
      assert(write.status === 201, `write returned ${write.status}`);
      assert(publish.status === 403, `publish returned ${publish.status}`);
      return "read 200, write 201, publish 403";
    });

    await check("audit rows record allowed actions and omit denied ones", async () => {
      // Approve a fresh sponsored promotion as the reviewer so the audit row is
      // produced by this actor, not reused from the super-admin matrix probe.
      const auditFixture = await api(superToken, "POST", "/api/admin/plus/promotions", {
        key: `${prefix}-audit-sponsored`,
        kind: "SPONSORED",
        title: "Audit sponsored fixture",
        body: "This promotion exists to prove the reviewer approval is audited.",
        sponsorName: "Acceptance Sponsor",
        disclosureLabel: "Sponsored"
      });
      assert(auditFixture.status === 201, `audit sponsor fixture failed: ${auditFixture.text}`);
      const auditFixtureId = String(auditFixture.json?.id ?? "");
      const submitted = await api(superToken, "POST", `/api/admin/plus/promotions/${auditFixtureId}/submit`);
      assert(submitted.status === 200, `audit sponsor submission failed: ${submitted.text}`);
      const advertiserToken = tokens.get("plus_advertiser_reviewer")!;
      const approved = await api(advertiserToken, "POST", `/api/admin/plus/promotions/${auditFixtureId}/approve`);
      assert(approved.status === 200, `advertiser approval failed: ${approved.text}`);

      const editorId = (await prisma.user.findUnique({ where: { email: `${prefix}-plus_editor@plus.test` }, select: { id: true } }))?.id;
      const advertiserId = (await prisma.user.findUnique({ where: { email: `${prefix}-plus_advertiser_reviewer@plus.test` }, select: { id: true } }))?.id;
      const membershipId = (await prisma.user.findUnique({ where: { email: `${prefix}-plus_membership_admin@plus.test` }, select: { id: true } }))?.id;
      assert(editorId && advertiserId && membershipId, "audit actors missing");

      const rows = await prisma.auditLog.findMany({
        where: { actorId: { in: userIds }, entity: { startsWith: "Plus" } },
        select: { actorId: true, action: true, entity: true }
      });
      const has = (actorId: string, action: string, entity: string) =>
        rows.some((row) => row.actorId === actorId && row.action === action && row.entity === entity);
      assert(has(editorId, "plus.content.created", "PlusContentCard"), "editor draft creation was not audited");
      assert(has(advertiserId, "plus.promotion.approved", "PlusPromotion"), "advertiser approval was not audited");
      assert(has(membershipId, "plus.plan.created", "PlusPlan"), "membership admin plan creation was not audited");
      assert(
        !rows.some((row) => row.actorId === editorId && row.action === "plus.content.published"),
        "editor has a publish audit row despite lacking permission"
      );
      assert(
        !rows.some((row) => row.actorId === advertiserId && row.action === "plus.promotion.published"),
        "advertiser has a publish audit row despite lacking permission"
      );
      return `${rows.length} audit row(s), denied actions absent`;
    });

    return { target, prefix };
  } finally {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => undefined);
    await prisma.systemEvent.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => undefined);
    await prisma.plusContentCard.deleteMany({ where: { key: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.plusBenefit.deleteMany({ where: { key: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.plusPromotion.deleteMany({ where: { key: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.plusPlan.deleteMany({ where: { code: { startsWith: prefix } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    if (roleIds.length > 0) {
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } }).catch(() => undefined);
    }
    const leftovers = await Promise.all([
      prisma.plusContentCard.count({ where: { key: { startsWith: prefix } } }),
      prisma.plusPlan.count({ where: { code: { startsWith: prefix } } }),
      prisma.plusBenefit.count({ where: { key: { startsWith: prefix } } }),
      prisma.plusPromotion.count({ where: { key: { startsWith: prefix } } }),
      prisma.user.count({ where: { email: { startsWith: prefix } } })
    ]).catch(() => [0, 0, 0, 0, 0]);
    if (leftovers.some((count) => count > 0)) console.error(`WARN cleanup left rows: ${leftovers.join(",")}`);
    await prisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((result) => {
    const passed = results.filter((row) => row.status === "PASS").length;
    console.log(`\n${passed}/${results.length} checks passed`);
    console.log(`database=${result?.target.databaseName ?? "?"} marker=${result?.target.marker ?? "?"} run=${result?.prefix ?? "?"} base=${BASE}`);
    if (passed !== results.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
