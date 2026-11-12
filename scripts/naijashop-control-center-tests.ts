/**
 * NaijaShop Control Center operational acceptance tests.
 *
 * Scope:
 *   - courier assignment: authorization, active/approved eligibility, audit,
 *     order/delivery transition and the courier's own delivery queue;
 *   - review moderation: permission denial, approve/reject with reason, audit
 *     and visibility through the existing catalogue rating aggregation.
 *
 * Run only against an isolated TEST database and an app pointed at it:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3050 \
 *     npx tsx scripts/naijashop-control-center-tests.ts
 *
 * The fail-closed guard verifies the explicit URL, actual current_database(),
 * the deny list, required tables and the TEST marker before the first query.
 * Fixtures are run-tagged and deleted in a finally block.
 */
import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

const BASE = (process.env.TEST_BASE_URL ?? "").replace(/\/$/, "");
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";

if (!BASE) throw new Error("TEST_BASE_URL is required (for example http://localhost:3050).");

type Json = Record<string, any>;
type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

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

class Client {
  private cookies = new Map<string, string>();

  constructor(private readonly token?: string) {
    if (token) this.cookies.set(SESSION_COOKIE, token);
  }

  async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });
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
}

function isStatus(response: { status: number; body: Json }, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`);
  }
}

function sessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "Review",
      "Courier",
      "Delivery",
      "Product",
      "ProductImage",
      "Vendor",
      "Category",
      "Order",
      "OrderItem",
      "User",
      "Role",
      "UserRole",
      "Session",
      "AuditLog"
    ]
  });

  // Import Prisma only after the guard has pointed DATABASE_URL at the verified target.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  const created = {
    userIds: [] as string[],
    roleIds: [] as string[],
    sessionIds: [] as string[],
    categoryIds: [] as string[],
    vendorIds: [] as string[],
    productIds: [] as string[],
    orderIds: [] as string[],
    deliveryIds: [] as string[],
    reviewIds: [] as string[],
    courierIds: [] as string[]
  };
  const userIds = created.userIds;

  async function roleId(name: string) {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    const role = await prisma.role.create({ data: { name } });
    created.roleIds.push(role.id);
    return role.id;
  }

  async function createUser(input: {
    label: string;
    actorType: "ADMIN" | "CUSTOMER" | "COURIER";
    role?: string;
    verified?: boolean;
  }) {
    const user = await prisma.user.create({
      data: {
        email: `cc-${input.label}-${suffix}@example.test`,
        name: `Control Center ${input.label}`,
        actorType: input.actorType,
        verifiedAt: input.verified ? new Date() : null
      }
    });
    userIds.push(user.id);
    if (input.role) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: await roleId(input.role) } });
    }
    return user;
  }

  async function createSession(userId: string) {
    const token = sessionToken();
    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        userAgent: "naijashop-control-center-tests"
      }
    });
    created.sessionIds.push(session.id);
    return token;
  }

  async function createCourier(input: { label: string; verified: boolean; active: boolean }) {
    const user = await createUser({
      label: input.label,
      actorType: "COURIER",
      role: "courier",
      verified: input.verified
    });
    const courier = await prisma.courier.create({
      data: {
        userId: user.id,
        name: `Courier ${input.label} ${suffix}`,
        phone: "+2348000000000",
        active: input.active,
        suspendedReason: input.active ? null : "Suspension fixture",
        vehicleType: "motorcycle",
        serviceZone: "Lagos"
      }
    });
    created.courierIds.push(courier.id);
    return { user, courier, token: await createSession(user.id) };
  }

  let exitCode = 1;
  try {
    console.log(`TEST database verified (${target.databaseName}); marker ${target.marker}`);
    console.log(`Fixture suffix ${suffix}`);

    const admin = await createUser({ label: "admin", actorType: "ADMIN", role: "admin", verified: true });
    const moderator = await createUser({ label: "moderator", actorType: "CUSTOMER", role: "moderator", verified: true });
    const support = await createUser({ label: "support", actorType: "CUSTOMER", role: "support", verified: true });
    const customer = await createUser({ label: "customer", actorType: "CUSTOMER", verified: true });
    const eligible = await createCourier({ label: "eligible", verified: true, active: true });
    const unapproved = await createCourier({ label: "unapproved", verified: false, active: true });
    const inactive = await createCourier({ label: "inactive", verified: true, active: false });

    const adminClient = new Client(await createSession(admin.id));
    const moderatorClient = new Client(await createSession(moderator.id));
    const supportClient = new Client(await createSession(support.id));
    const customerClient = new Client(await createSession(customer.id));
    const courierClient = new Client(eligible.token);

    const probe = await adminClient.get("/api/admin/overview");
    assert(
      probe.status === 200,
      `The running app did not accept a session created in the verified test database (HTTP ${probe.status}). Start it with the same TEST_DATABASE_URL.`
    );

    const category = await prisma.category.create({
      data: { name: `Control Center ${suffix}`, slug: `control-center-${suffix}`, description: "Isolated acceptance fixture" }
    });
    created.categoryIds.push(category.id);

    const vendor = await prisma.vendor.create({
      data: {
        ownerId: customer.id,
        name: `Control Center Vendor ${suffix}`,
        slug: `control-center-vendor-${suffix}`,
        market: "Lagos Island, Lagos",
        pickupAddress: "1 Control Center Way, Lagos",
        pickupPhone: "+2348000000001",
        countryCode: "NG",
        status: "VERIFIED",
        trustScore: 90
      }
    });
    created.vendorIds.push(vendor.id);

    async function createProduct(label: string) {
      const product = await prisma.product.create({
        data: {
          slug: `control-center-${label}-${suffix}`,
          name: `Control Center ${label} ${suffix}`,
          description: "Isolated product for Control Center acceptance tests.",
          vendorId: vendor.id,
          categoryId: category.id,
          priceKobo: 125000n,
          countryCode: "NG",
          status: "ACTIVE",
          isSample: false,
          images: {
            create: [{ url: "/products/tecno-spark-20.svg", alt: `Control Center ${label}`, sortOrder: 0 }]
          }
        }
      });
      created.productIds.push(product.id);
      return product;
    }

    const assignProduct = await createProduct("assign");
    const approveProduct = await createProduct("approve");
    const rejectProduct = await createProduct("reject");

    async function createOrder(input: {
      label: string;
      status: "ready_for_pickup" | "delivered";
      productId: string;
      productName: string;
    }) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `CC-${input.label}-${suffix}`,
          customerId: customer.id,
          vendorId: vendor.id,
          status: input.status,
          paymentStatus: "paid",
          subtotalKobo: 125000n,
          totalKobo: 125000n,
          countryCode: "NG",
          deliveryAddress: `12 ${input.label} Street, Lagos`,
          contactName: "Control Center Customer",
          contactPhone: "+2348000000002",
          items: {
            create: [
              {
                productId: input.productId,
                quantity: 1,
                unitKobo: 125000n,
                totalKobo: 125000n,
                productName: input.productName,
                imageUrl: "/products/tecno-spark-20.svg"
              }
            ]
          }
        }
      });
      created.orderIds.push(order.id);
      return order;
    }

    const assignOrder = await createOrder({
      label: "ASSIGN",
      status: "ready_for_pickup",
      productId: assignProduct.id,
      productName: assignProduct.name
    });
    const approveOrder = await createOrder({
      label: "APPROVE",
      status: "delivered",
      productId: approveProduct.id,
      productName: approveProduct.name
    });
    const rejectOrder = await createOrder({
      label: "REJECT",
      status: "delivered",
      productId: rejectProduct.id,
      productName: rejectProduct.name
    });

    const delivery = await prisma.delivery.create({
      data: {
        orderId: assignOrder.id,
        status: "pending_assignment",
        pickupAddress: vendor.pickupAddress,
        dropoffAddress: assignOrder.deliveryAddress,
        feeKobo: 250000n,
        countryCode: "NG"
      }
    });
    created.deliveryIds.push(delivery.id);

    const publicClient = new Client();
    const approveReviewCreated = await customerClient.post("/api/reviews", {
      orderId: approveOrder.id,
      productId: approveProduct.id,
      rating: 5,
      title: "Genuine delivered purchase",
      body: "The item arrived as described and the packaging was intact."
    });
    isStatus(approveReviewCreated, 201, "create approve review");
    const approveReviewId = String(approveReviewCreated.body.id);
    created.reviewIds.push(approveReviewId);

    const rejectReviewCreated = await customerClient.post("/api/reviews", {
      orderId: rejectOrder.id,
      productId: rejectProduct.id,
      rating: 2,
      title: "Rejected fixture review",
      body: "This review exists to verify rejection visibility and the audit reason."
    });
    isStatus(rejectReviewCreated, 201, "create reject review");
    const rejectReviewId = String(rejectReviewCreated.body.id);
    created.reviewIds.push(rejectReviewId);

    await check("Unapproved courier is rejected by delivery assignment", async () => {
      const response = await adminClient.post(`/api/admin/deliveries/${delivery.id}/assign`, { courierId: unapproved.courier.id });
      isStatus(response, 409, "assign unapproved courier");
      assert(response.body.code === "courier_unapproved", `expected courier_unapproved, got ${JSON.stringify(response.body)}`);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert(stored.courierId === null, "delivery was assigned to an unapproved courier");
      return "HTTP 409 courier_unapproved; delivery.courierId stayed null";
    });

    await check("Inactive courier is rejected by delivery assignment", async () => {
      const response = await adminClient.post(`/api/admin/deliveries/${delivery.id}/assign`, { courierId: inactive.courier.id });
      isStatus(response, 409, "assign inactive courier");
      assert(response.body.code === "courier_suspended", `expected courier_suspended, got ${JSON.stringify(response.body)}`);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert(stored.courierId === null, "delivery was assigned to an inactive courier");
      return "HTTP 409 courier_suspended; delivery.courierId stayed null";
    });

    await check("Support role is denied the deliveries:write assignment", async () => {
      const response = await supportClient.post(`/api/admin/deliveries/${delivery.id}/assign`, { courierId: eligible.courier.id });
      isStatus(response, 403, "support assigns courier");
      assert(response.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(response.body)}`);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert(stored.courierId === null, "delivery changed despite permission denial");
      return "HTTP 403 permission_denied; no delivery mutation";
    });

    await check("Admin assignment succeeds, advances the order and writes audit evidence", async () => {
      const response = await adminClient.post(`/api/admin/deliveries/${delivery.id}/assign`, { courierId: eligible.courier.id });
      isStatus(response, 200, "admin assigns courier");
      assert(response.body.courierId === eligible.courier.id, "response courierId does not match");
      assert(response.body.status === "assigned", `delivery status is ${response.body.status}`);
      const storedDelivery = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      const storedOrder = await prisma.order.findUniqueOrThrow({ where: { id: assignOrder.id } });
      assert(storedDelivery.courierId === eligible.courier.id, "stored delivery courierId does not match");
      assert(storedOrder.status === "courier_assigned", `order status is ${storedOrder.status}`);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "delivery.courier_assigned", entityId: delivery.id, actorId: admin.id },
        orderBy: { createdAt: "desc" }
      });
      assert(audit, "no delivery.courier_assigned audit row for the acting admin");
      const metadata = (audit.metadata ?? {}) as Json;
      assert(metadata.courierId === eligible.courier.id, "audit metadata lacks the assigned courier");
      assert(metadata.before?.status === "pending_assignment", `audit before status was ${metadata.before?.status}`);
      assert(metadata.after?.status === "assigned", `audit after status was ${metadata.after?.status}`);
      return "delivery assigned, order courier_assigned, attributable before/after audit row";
    });

    await check("Courier sees the assigned delivery through the existing courier API", async () => {
      const response = await courierClient.get("/api/courier/deliveries");
      isStatus(response, 200, "courier deliveries");
      const rows = Array.isArray(response.body) ? (response.body as Json[]) : [];
      const row = rows.find((entry) => entry.id === delivery.id);
      assert(row, "assigned delivery missing from the courier queue");
      assert(row.order?.orderNumber === assignOrder.orderNumber, "courier row is missing order context");
      return `courier queue contains ${delivery.id} with order ${assignOrder.orderNumber}`;
    });

    await check("Admin courier list exposes approval state for eligibility filtering", async () => {
      const response = await adminClient.get("/api/admin/couriers");
      isStatus(response, 200, "admin couriers");
      const rows = Array.isArray(response.body) ? (response.body as Json[]) : [];
      const eligibleRow = rows.find((entry) => entry.id === eligible.courier.id);
      const unapprovedRow = rows.find((entry) => entry.id === unapproved.courier.id);
      assert(eligibleRow?.user?.verifiedAt, "eligible courier is missing user.verifiedAt");
      assert(unapprovedRow && unapprovedRow.user?.verifiedAt === null, "unapproved courier should expose a null verifiedAt");
      return "couriers include user.verifiedAt so the UI can exclude unapproved accounts";
    });

    await check("Support role is denied review queue and moderation", async () => {
      const list = await supportClient.get("/api/admin/reviews?status=PENDING");
      isStatus(list, 403, "support reads reviews");
      assert(list.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(list.body)}`);
      const decide = await supportClient.post(`/api/admin/reviews/${approveReviewId}`, {
        action: "APPROVE",
        reason: "Unauthorized attempt"
      });
      isStatus(decide, 403, "support approves review");
      assert(decide.body.code === "permission_denied", `expected permission_denied, got ${JSON.stringify(decide.body)}`);
      const stored = await prisma.review.findUniqueOrThrow({ where: { id: approveReviewId } });
      assert(stored.status === "PENDING", `review status changed to ${stored.status} despite denial`);
      return "HTTP 403 permission_denied for queue and decision; review stayed PENDING";
    });

    await check("Moderator lists pending reviews with product context", async () => {
      const response = await moderatorClient.get("/api/admin/reviews?status=PENDING");
      isStatus(response, 200, "moderator pending reviews");
      const rows = (response.body.reviews ?? []) as Json[];
      const review = rows.find((entry) => entry.id === approveReviewId);
      assert(review, "pending approval review missing from the queue");
      assert(review.product?.name === approveProduct.name, "review is missing product context");
      assert(review.product?.vendor?.name === vendor.name, "review is missing vendor context");
      assert(review.order?.orderNumber === approveOrder.orderNumber, "review is missing order context");
      return "pending queue contains the review with product, vendor and order context";
    });

    await check("Rejecting without a reason is rejected", async () => {
      const response = await moderatorClient.post(`/api/admin/reviews/${rejectReviewId}`, { action: "REJECT" });
      isStatus(response, 400, "reject without reason");
      assert(response.body.code === "reason_required", `expected reason_required, got ${JSON.stringify(response.body)}`);
      const stored = await prisma.review.findUniqueOrThrow({ where: { id: rejectReviewId } });
      assert(stored.status === "PENDING", `review status changed to ${stored.status}`);
      return "HTTP 400 reason_required; review stayed PENDING";
    });

    await check("Approved review becomes visible through the catalogue rating", async () => {
      const decision = await moderatorClient.post(`/api/admin/reviews/${approveReviewId}`, {
        action: "APPROVE",
        reason: "Verified delivered purchase; content complies."
      });
      isStatus(decision, 200, "approve review");
      assert(decision.body.status === "APPROVED", `review status is ${decision.body.status}`);
      const stored = await prisma.review.findUniqueOrThrow({ where: { id: approveReviewId } });
      assert(stored.status === "APPROVED", `stored review status is ${stored.status}`);

      const product = await publicClient.get(`/api/products/${approveProduct.id}`);
      isStatus(product, 200, "public product after approval");
      assert(product.body.rating?.count === 1, `catalogue rating count is ${product.body.rating?.count}`);
      assert(product.body.rating?.average === 5, `catalogue average is ${product.body.rating?.average}`);
      assert(
        Array.isArray(product.body.reviews) && product.body.reviews.some((entry: Json) => entry.id === approveReviewId),
        "approved review is missing from the public product payload"
      );

      const audit = await prisma.auditLog.findFirst({
        where: { action: "review.approved", entityId: approveReviewId, actorId: moderator.id },
        orderBy: { createdAt: "desc" }
      });
      assert(audit, "no review.approved audit row");
      const metadata = (audit.metadata ?? {}) as Json;
      assert(metadata.reason === "Verified delivered purchase; content complies.", "approval reason missing from audit metadata");
      return "catalogue reports 1 review / 5.0 average; approval reason audited";
    });

    await check("Rejected review stays out of the public rating and records its reason", async () => {
      const decision = await moderatorClient.post(`/api/admin/reviews/${rejectReviewId}`, {
        action: "REJECT",
        reason: "Content duplicates another review and does not describe a delivered purchase."
      });
      isStatus(decision, 200, "reject review");
      assert(decision.body.status === "REJECTED", `review status is ${decision.body.status}`);

      const product = await publicClient.get(`/api/products/${rejectProduct.id}`);
      isStatus(product, 200, "public product after rejection");
      assert(product.body.rating?.count === 0, `catalogue rating count is ${product.body.rating?.count}`);
      assert(Array.isArray(product.body.reviews) && product.body.reviews.length === 0, "rejected review leaked to the product page");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "review.rejected", entityId: rejectReviewId, actorId: moderator.id },
        orderBy: { createdAt: "desc" }
      });
      assert(audit, "no review.rejected audit row");
      const metadata = (audit.metadata ?? {}) as Json;
      assert(
        metadata.reason === "Content duplicates another review and does not describe a delivered purchase.",
        "rejection reason missing from audit metadata"
      );
      return "catalogue rating count 0; rejection reason audited";
    });

    await check("Approved and rejected filters return the correct reviews", async () => {
      const approved = await moderatorClient.get("/api/admin/reviews?status=APPROVED");
      isStatus(approved, 200, "approved reviews");
      const approvedRows = (approved.body.reviews ?? []) as Json[];
      assert(approvedRows.some((entry) => entry.id === approveReviewId), "approved filter is missing the approved review");
      assert(!approvedRows.some((entry) => entry.id === rejectReviewId), "rejected review appeared in the approved filter");

      const rejected = await moderatorClient.get("/api/admin/reviews?status=REJECTED");
      isStatus(rejected, 200, "rejected reviews");
      const rejectedRows = (rejected.body.reviews ?? []) as Json[];
      assert(rejectedRows.some((entry) => entry.id === rejectReviewId), "rejected filter is missing the rejected review");
      assert(!rejectedRows.some((entry) => entry.id === approveReviewId), "approved review appeared in the rejected filter");

      const pending = await moderatorClient.get("/api/admin/reviews?status=PENDING");
      isStatus(pending, 200, "pending reviews");
      const pendingRows = (pending.body.reviews ?? []) as Json[];
      assert(
        !pendingRows.some((entry) => entry.id === approveReviewId || entry.id === rejectReviewId),
        "decided reviews remained in the pending queue"
      );
      return "each status filter contains only its own decisions";
    });

    exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
  } finally {
    // Delete audit/system evidence linked to the fixture actors or entities
    // before the users, because those relations do not cascade.
    await prisma.auditLog
      .deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { entityId: { in: [...created.reviewIds, ...created.deliveryIds] } }
          ]
        }
      })
      .catch(() => undefined);
    await prisma.systemEvent
      .deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { entityId: { in: [...created.orderIds, ...created.reviewIds, ...created.deliveryIds] } }
          ]
        }
      })
      .catch(() => undefined);
    await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.review.deleteMany({ where: { id: { in: created.reviewIds } } }).catch(() => undefined);
    await prisma.trackingEvent.deleteMany({ where: { deliveryId: { in: created.deliveryIds } } }).catch(() => undefined);
    await prisma.delivery.deleteMany({ where: { id: { in: created.deliveryIds } } }).catch(() => undefined);
    await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: created.orderIds } } }).catch(() => undefined);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } }).catch(() => undefined);
    await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } }).catch(() => undefined);
    await prisma.productImage.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.inventoryStock.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { id: { in: created.productIds } } }).catch(() => undefined);
    await prisma.courier.deleteMany({ where: { id: { in: created.courierIds } } }).catch(() => undefined);
    await prisma.vendor.deleteMany({ where: { id: { in: created.vendorIds } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.categoryIds } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { id: { in: created.sessionIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    // Roles are reference configuration. Delete only roles this run created and
    // only if no other user still references them.
    for (const roleId of created.roleIds) {
      const references = await prisma.userRole.count({ where: { roleId } }).catch(() => 0);
      if (references === 0) await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error(`TEST_RUN_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
