/**
 * Phase 05 Control Center security verification.
 *
 * Exercises the server directly (HTTP, not UI state) against an isolated,
 * seeded database. It covers:
 *   - explicit ops / finance / support / moderator permissions;
 *   - country and city scope enforcement, including cross-region denials;
 *   - role-assignment writes with self-escalation and delegation protection;
 *   - last-super-administrator protection (service-level invariant);
 *   - attributable before/after audit records for permission and finance changes.
 *
 * Usage:
 *   1. npx prisma db seed on an isolated database
 *   2. Start the app (development server, ENABLE_TEST_PAYMENTS not required here)
 *   3. TEST_BASE_URL=http://localhost:3100 npx tsx scripts/admin-security-tests.ts
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const prisma = new PrismaClient();
const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Json = Record<string, any>;

class Client {
  private cookies = new Map<string, string>();

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookies) {
      const [pair] = entry.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: response.status, body: body as Json };
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  put(path: string, body?: unknown) {
    return this.request(path, { method: "PUT", body });
  }

  async login(email: string, password: string) {
    const result = await this.post("/api/auth/login", { email, password });
    if (result.status !== 200) throw new Error(`login ${email} failed: ${result.status} ${JSON.stringify(result.body)}`);
    return result;
  }
}

let failures = 0;
let passes = 0;

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    passes += 1;
    console.log(`PASS  ${name} — ${Date.now() - started}ms`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL  ${name} — ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isStatus(response: { status: number; body: Json }, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`);
  }
}

async function registerStaff(label: string, password = "StaffPass123!") {
  const email = `${label}-${unique}@naijadeals.local`;
  const client = new Client();
  const registered = await client.post("/api/auth/register", { name: `Security ${label}`, email, password });
  isStatus(registered, 201, `register ${label}`);
  const id = (registered.body.user ?? registered.body)?.id as string;
  assert(id, `register ${label} did not return a user id`);
  await client.login(email, password);
  return { client, email, id };
}

async function userIdByEmail(superAdmin: Client, email: string) {
  const users = await superAdmin.get("/api/admin/users");
  isStatus(users, 200, "list users");
  const match = (users.body as Json[]).find((user) => user.email === email);
  assert(match, `user ${email} not found`);
  return match.id as string;
}

async function assignRoles(
  superAdmin: Client,
  userId: string,
  roles: string[],
  scopeCountryCode: string | null,
  scopeCityCode: string | null = null
) {
  return superAdmin.put(`/api/super-admin/users/${userId}/roles`, { roles, scopeCountryCode, scopeCityCode });
}

async function auditEntries(superAdmin: Client) {
  const response = await superAdmin.get("/api/admin/audit-logs");
  isStatus(response, 200, "list audit logs");
  return response.body as Json[];
}

async function main() {
  console.log(`Admin security verification against ${BASE}`);
  const superAdmin = new Client();
  await superAdmin.login("superadmin@naijadeals.local", "SuperAdminPass123!");
  const admin = new Client();
  await admin.login("admin@naijadeals.local", "AdminPass123!");
  const customer = new Client();
  await customer.login("customer@naijadeals.local", "CustomerPass123!");

  const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: "customer@naijadeals.local" } });
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { status: "VERIFIED" } });
  const product = await prisma.product.findFirstOrThrow();

  async function createOrder(countryCode: string, label: string) {
    return prisma.order.create({
      data: {
        orderNumber: `SEC-${label}-${unique}-${Math.random().toString(36).slice(2, 6)}`,
        customerId: customerUser.id,
        vendorId: vendor.id,
        subtotalKobo: 100000n,
        totalKobo: 100000n,
        countryCode,
        deliveryAddress: `${label} security test address`,
        contactName: "Security Fixture",
        contactPhone: "08000000000"
      }
    });
  }

  const ngOrder = await createOrder("NG", "NG");
  const ghOrder = await createOrder("GH", "GH");

  const opsNg = await registerStaff("ops-ng");
  const opsGh = await registerStaff("ops-gh");
  const support = await registerStaff("support");
  const finance = await registerStaff("finance");
  const moderator = await registerStaff("moderator");

  await step("Role assignment writes roles and region scope", async () => {
    isStatus(await assignRoles(superAdmin, opsNg.id, ["ops"], "NG"), 200, "assign ops NG");
    isStatus(await assignRoles(superAdmin, opsGh.id, ["ops"], "GH"), 200, "assign ops GH");
    isStatus(await assignRoles(superAdmin, support.id, ["support"], "NG"), 200, "assign support NG");
    isStatus(await assignRoles(superAdmin, finance.id, ["finance"], "NG"), 200, "assign finance NG");
    isStatus(await assignRoles(superAdmin, moderator.id, ["moderator"], "NG", "ikeja"), 200, "assign moderator NG/ikeja");

    const users = await superAdmin.get("/api/admin/users");
    isStatus(users, 200, "list users after assignment");
    const stored = (users.body as Json[]).find((user) => user.id === opsNg.id);
    assert(stored, "ops user missing from user list");
    assert(stored.scopeCountryCode === "NG", `scope country was ${stored.scopeCountryCode}`);
    assert(
      stored.roles.some((entry: Json) => entry.role.name === "ops"),
      "ops role was not persisted"
    );
  });

  await step("Role change is audited with attributable before/after state", async () => {
    const entries = await auditEntries(superAdmin);
    const entry = entries.find(
      (item) => item.action === "admin.roles_updated" && item.entityId === opsNg.id
    );
    assert(entry, "no admin.roles_updated audit entry for the ops user");
    assert(entry.actor?.email === "superadmin@naijadeals.local", "audit entry is not attributable to the acting super admin");
    const metadata = entry.metadata as Json;
    assert(Array.isArray(metadata?.before?.roles), "audit metadata is missing before.roles");
    assert(Array.isArray(metadata?.after?.roles), "audit metadata is missing after.roles");
    assert(metadata.after.roles.includes("ops"), "audit after state does not include the granted role");
    assert(metadata.after.scopeCountryCode === "NG", "audit after state does not include the scope");
    const serialised = JSON.stringify(metadata);
    assert(!/password|hash|token|secret/i.test(serialised), "audit metadata contains secret-like fields");
  });

  await step("Customer cannot reach Control Center APIs", async () => {
    isStatus(await customer.get("/api/admin/orders"), 403, "customer admin orders");
    isStatus(await customer.get("/api/admin/payouts"), 403, "customer admin payouts");
  });

  await step("Support can read orders but cannot write them", async () => {
    isStatus(await support.client.get("/api/admin/orders"), 200, "support reads orders");
    const write = await support.client.post(`/api/admin/orders/${ngOrder.id}/status`, { status: "payment_pending" });
    isStatus(write, 403, "support writes order");
    assert(write.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(write.body)}`);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: ngOrder.id } });
    assert(stored.status === "created", `order changed despite denial (status ${stored.status})`);
  });

  await step("Support cannot read finance data", async () => {
    isStatus(await support.client.get("/api/admin/payouts"), 403, "support reads payouts");
  });

  await step("Ops is denied the audit trail", async () => {
    isStatus(await opsNg.client.get("/api/admin/audit-logs"), 403, "ops reads audit log");
  });

  await step("Ops can advance an order inside its own country", async () => {
    const response = await opsNg.client.post(`/api/admin/orders/${ngOrder.id}/status`, { status: "payment_pending" });
    isStatus(response, 200, "ops advances NG order");
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: ngOrder.id } });
    assert(stored.status === "payment_pending", `order status is ${stored.status}`);
  });

  await step("Ops is denied an order in another country", async () => {
    const response = await opsNg.client.post(`/api/admin/orders/${ghOrder.id}/status`, { status: "payment_pending" });
    isStatus(response, 403, "ops advances GH order while scoped to NG");
    assert(response.body.code === "region_forbidden", `expected region_forbidden, got ${JSON.stringify(response.body)}`);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: ghOrder.id } });
    assert(stored.status === "created", `cross-region order changed (status ${stored.status})`);
  });

  await step("Scoped order lists never include another country", async () => {
    const scoped = await opsNg.client.get("/api/admin/orders");
    isStatus(scoped, 200, "ops order list");
    const ids = (scoped.body as Json[]).map((order) => order.id);
    assert(!ids.includes(ghOrder.id), "GH order leaked into an NG-scoped list");
    assert((scoped.body as Json[]).every((order) => order.countryCode === "NG"), "list contains a non-NG order");

    const global = await superAdmin.get("/api/admin/orders");
    isStatus(global, 200, "super admin order list");
    const globalIds = (global.body as Json[]).map((order) => order.id);
    assert(globalIds.includes(ghOrder.id), "platform-wide list is missing the GH order");
  });

  const ngPayout = await prisma.payout.create({
    data: {
      vendorId: vendor.id,
      amountKobo: 0n,
      reference: `SEC-PAYOUT-NG-${unique}`,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date()
    }
  });
  const ghVendor = await prisma.vendor.create({
    data: {
      ownerId: (await prisma.user.findFirstOrThrow({ where: { email: "seller2@naijadeals.local" } })).id,
      name: `Accra Security Vendor ${unique}`,
      slug: `accra-security-${unique}`,
      market: "accra",
      countryCode: "GH",
      status: "VERIFIED",
      pickupAddress: "Accra security fixture",
      pickupPhone: "08000000000"
    }
  });
  const ghPayout = await prisma.payout.create({
    data: {
      vendorId: ghVendor.id,
      amountKobo: 0n,
      reference: `SEC-PAYOUT-GH-${unique}`,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date()
    }
  });

  await step("Finance can read payouts but live settlement is blocked on a TEST database", async () => {
    const list = await finance.client.get("/api/admin/payouts");
    isStatus(list, 200, "finance reads payouts");

    const paid = await finance.client.post(`/api/admin/payouts/${ngPayout.id}/pay`);
    isStatus(paid, 403, "finance settles payout on TEST database");
    assert(
      paid.body.code === "test_funds_boundary",
      `expected test_funds_boundary, got ${JSON.stringify(paid.body)}`
    );
    const stored = await prisma.payout.findUniqueOrThrow({ where: { id: ngPayout.id } });
    assert(stored.status === "PENDING", `payout changed despite the boundary (status ${stored.status})`);

    const entries = await auditEntries(superAdmin);
    const leaked = entries.find((item) => item.action === "payout.paid" && item.entityId === ngPayout.id);
    assert(!leaked, "a blocked payout settlement still wrote an audit record");
  });

  await step("A permitted sensitive write records attributable before/after audit", async () => {
    const entries = await auditEntries(superAdmin);
    const entry = entries.find((item) => item.action === "admin.action_logged" && item.entityId && item.metadata?.orderId === ngOrder.id);
    assert(entry, "no audit entry for the order status change");
    const metadata = entry.metadata as Json;
    assert(metadata?.before?.status === "created", `before.status was ${metadata?.before?.status}`);
    assert(metadata?.after?.status === "payment_pending", `after.status was ${metadata?.after?.status}`);
    assert(entry.actor?.email === opsNg.email, `audit is not attributable to the acting ops user (${entry.actor?.email})`);
  });

  await step("A country-scoped finance user cannot read the platform audit trail", async () => {
    const denied = await finance.client.get("/api/admin/audit-logs");
    isStatus(denied, 403, "scoped finance reads audit trail");
    assert(denied.body.code === "region_forbidden", `expected region_forbidden, got ${JSON.stringify(denied.body)}`);
  });

  const opsPayout = await prisma.payout.create({
    data: {
      vendorId: vendor.id,
      amountKobo: 0n,
      reference: `SEC-PAYOUT-OPS-${unique}`,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date()
    }
  });

  await step("Ops cannot pay a payout", async () => {
    const denied = await opsNg.client.post(`/api/admin/payouts/${opsPayout.id}/pay`);
    isStatus(denied, 403, "ops pays payout");
    assert(denied.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(denied.body)}`);
    const stored = await prisma.payout.findUniqueOrThrow({ where: { id: opsPayout.id } });
    assert(stored.status === "PENDING", "payout was paid despite the denial");
  });

  await step("Finance is denied a payout in another country", async () => {
    const denied = await finance.client.post(`/api/admin/payouts/${ghPayout.id}/pay`);
    isStatus(denied, 403, "finance pays GH payout while scoped to NG");
    assert(denied.body.code === "region_forbidden", `expected region_forbidden, got ${JSON.stringify(denied.body)}`);
  });

  await step("Moderator can moderate a product inside its country", async () => {
    await prisma.product.update({ where: { id: product.id }, data: { countryCode: "NG" } });
    const response = await moderator.client.post(`/api/admin/products/${product.id}/moderate`, { status: "SUSPENDED", note: "Security suite" });
    isStatus(response, 200, "moderator suspends product");
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert(stored.status === "SUSPENDED", `product status is ${stored.status}`);
  });

  await step("Moderator is denied a product in another country", async () => {
    const ghProduct = await prisma.product.create({
      data: {
        slug: `accra-security-product-${unique}`,
        name: "Accra Security Product",
        description: "Fixture used to verify region scope for moderation.",
        vendorId: ghVendor.id,
        categoryId: product.categoryId,
        priceKobo: 100000n,
        countryCode: "GH",
        status: "ACTIVE",
        images: { create: [{ url: "/products/tecno-spark-20.svg", alt: "Accra Security Product", sortOrder: 0 }] }
      }
    });
    const denied = await moderator.client.post(`/api/admin/products/${ghProduct.id}/moderate`, { status: "SUSPENDED" });
    isStatus(denied, 403, "moderator suspends GH product while scoped to NG");
    assert(denied.body.code === "region_forbidden", `expected region_forbidden, got ${JSON.stringify(denied.body)}`);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: ghProduct.id } });
    assert(stored.status === "ACTIVE", "cross-region product was moderated");
  });

  const ikejaApplicant = await registerStaff("applicant-ikeja");
  const lekkiApplicant = await registerStaff("applicant-lekki");
  const ikejaApplication = await prisma.sellerApplication.create({
    data: {
      userId: ikejaApplicant.id,
      businessName: "Ikeja Security Stall",
      market: "ikeja",
      countryCode: "NG",
      pickupAddress: "Ikeja security fixture",
      phone: "08000000000",
      category: "phones-tablets"
    }
  });
  const lekkiApplication = await prisma.sellerApplication.create({
    data: {
      userId: lekkiApplicant.id,
      businessName: "Lekki Security Stall",
      market: "lekki",
      countryCode: "NG",
      pickupAddress: "Lekki security fixture",
      phone: "08000000000",
      category: "phones-tablets"
    }
  });

  await step("City scope allows the same city and denies another city", async () => {
    const denied = await moderator.client.post(`/api/admin/applications/${lekkiApplication.id}`, { decision: "approve" });
    isStatus(denied, 403, "moderator approves Lekki application while scoped to Ikeja");
    assert(denied.body.code === "region_forbidden", `expected region_forbidden, got ${JSON.stringify(denied.body)}`);
    const untouched = await prisma.sellerApplication.findUniqueOrThrow({ where: { id: lekkiApplication.id } });
    assert(untouched.status === "SUBMITTED", "out-of-city application was reviewed");

    const allowed = await moderator.client.post(`/api/admin/applications/${ikejaApplication.id}`, { decision: "approve" });
    isStatus(allowed, 200, "moderator approves Ikeja application");
    const stored = await prisma.sellerApplication.findUniqueOrThrow({ where: { id: ikejaApplication.id } });
    assert(stored.status === "APPROVED", `application status is ${stored.status}`);
  });

  await step("An administrator cannot change their own roles", async () => {
    const self = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@naijadeals.local" } });
    const denied = await assignRoles(superAdmin, self.id, ["admin"], null);
    isStatus(denied, 403, "super admin edits own roles");
    assert(denied.body.code === "self_escalation", `expected self_escalation, got ${JSON.stringify(denied.body)}`);
    const stillSuper = await prisma.userRole.count({ where: { userId: self.id, role: { name: "super_admin" } } });
    assert(stillSuper === 1, "super admin role was removed by a rejected self-edit");
  });

  await step("A regular administrator cannot assign roles", async () => {
    const denied = await assignRoles(admin, support.id, ["super_admin"], null);
    isStatus(denied, 403, "admin assigns super_admin");
    assert(denied.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(denied.body)}`);
    const stored = await prisma.userRole.count({ where: { userId: support.id, role: { name: "super_admin" } } });
    assert(stored === 0, "admin granted super_admin despite the denial");
  });

  await step("Super admin can grant super_admin to another account", async () => {
    const granted = await assignRoles(superAdmin, opsGh.id, ["super_admin"], null);
    isStatus(granted, 200, "grant super_admin");
    const count = await prisma.userRole.count({ where: { userId: opsGh.id, role: { name: "super_admin" } } });
    assert(count === 1, "super_admin role was not granted");
  });

  await step("The last active super administrator cannot be demoted", async () => {
    // Reachable only outside the self-edit guard: an actor with roles:write
    // demoting a different user who is the only remaining super administrator.
    const { setUserRoles } = await import("@/lib/services/core/admin.service");
    const sole = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@naijadeals.local" } });
    await prisma.userRole.deleteMany({ where: { userId: opsGh.id, role: { name: "super_admin" } } });
    assert(
      (await prisma.userRole.count({ where: { role: { name: "super_admin" } } })) === 1,
      "fixture expected exactly one super administrator"
    );
    const ghostActor = {
      ...sole,
      id: "security-suite-ghost-actor",
      roles: [{ role: { id: "ghost", name: "super_admin", description: null, createdAt: new Date() } }],
      vendors: []
    };
    let code = "";
    try {
      await setUserRoles({ actor: ghostActor as never, userId: sole.id, roles: ["admin"], scopeCountryCode: null });
    } catch (error) {
      code = (error as { code?: string }).code ?? "";
    }
    assert(code === "last_super_admin", `expected last_super_admin, got "${code}"`);
    const stillSuper = await prisma.userRole.count({ where: { userId: sole.id, role: { name: "super_admin" } } });
    assert(stillSuper === 1, "last super administrator was demoted");
  });

  console.log("");
  console.log("========================================");
  console.log(`Admin security verification: ${passes}/${passes + failures} passed`);
  await prisma.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`Admin security verification aborted: ${error instanceof Error ? error.message : String(error)}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
