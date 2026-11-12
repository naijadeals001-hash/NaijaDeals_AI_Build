/**
 * Focused acceptance checks for the customer return-case journey.
 *
 * Usage:
 *   npx next dev -p 3100
 *   TEST_BASE_URL=http://localhost:3100 npx tsx scripts/returns-case-tests.ts
 *
 * The script uses the seeded local customer and seller accounts, creates one
 * clearly labelled return request, checks both sides of the existing APIs and
 * removes its own fixture afterwards. It never calls the receive/refund action,
 * so no money or stock movement is triggered.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const CUSTOMER = {
  email: process.env.QA_CUSTOMER_EMAIL || "customer@naijadeals.local",
  password: process.env.QA_CUSTOMER_PASSWORD || "CustomerPass123!"
};
const SELLER = {
  email: process.env.QA_SELLER_EMAIL || "seller@naijadeals.local",
  password: process.env.QA_SELLER_PASSWORD || "SellerPass123!"
};
const OPEN_STATUSES = new Set(["REQUESTED", "APPROVED", "RECEIVED"]);
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type Json = Record<string, unknown> & {
  id?: string;
  status?: string;
  code?: string;
  error?: string;
  returnRequests?: Array<{ id: string; status: string }>;
  refundSummary?: Record<string, string>;
  returns?: Array<{ id: string; status: string }>;
  updatedAt?: string;
};

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];
const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localDatabaseOnly() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const host = new URL(raw).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to clean up fixtures against non-local database host ${host}.`);
  }
}

class Client {
  private cookies = new Map<string, string>();

  private cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request(path: string, options: { method?: string; body?: unknown; redirect?: RequestRedirect } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: options.redirect ?? "manual"
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookies) {
      const pair = entry.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, text, headers: response.headers };
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  async login(email: string, password: string) {
    const result = await this.post("/api/auth/login", { email, password });
    assert(result.status === 200, `login ${email} failed: HTTP ${result.status}`);
    const body = result.body as Json & { user?: Json };
    assert(body.user?.id, `login ${email} did not return a session user`);
    return body.user;
  }
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true, detail: "passed" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

function isEligible(order: Json, now: number) {
  if (!["delivered", "completed"].includes(String(order.status))) return false;
  if ((order.returnRequests ?? []).some((request) => OPEN_STATUSES.has(request.status))) return false;
  const updated = Date.parse(String(order.updatedAt ?? ""));
  if (!Number.isFinite(updated)) return false;
  return now <= updated + WINDOW_MS;
}

async function main() {
  localDatabaseOnly();
  const runId = `qa-${Date.now().toString(36)}`;
  const guest = new Client();
  const customer = new Client();
  const seller = new Client();
  let createdReturnId: string | null = null;
  let rejectedReturnId: string | null = null;
  let targetOrderId: string | null = null;
  let secondOrderId: string | null = null;
  let cancelledOrderId: string | null = null;

  try {
    await step("guest /returns redirects to login with the returns return path", async () => {
      const response = await guest.get("/returns");
      assert([302, 307].includes(response.status), `expected a redirect, got HTTP ${response.status}`);
      const location = response.headers.get("location") ?? "";
      assert(
        location.includes("/login?next=/returns") || location.includes("/login?next=%2Freturns"),
        `unexpected redirect target: ${location}`
      );
    });

    await step("guest orders API is unauthorized", async () => {
      const response = await guest.get("/api/orders");
      assert(response.status === 401, `expected HTTP 401, got ${response.status}`);
    });

    await step("customer signs in", async () => {
      const user = await customer.login(CUSTOMER.email, CUSTOMER.password);
      assert(user.id, "login response did not include a user id");
    });

    await step("customer /orders still renders", async () => {
      const response = await customer.get("/orders");
      assert(response.status === 200, `expected HTTP 200, got ${response.status}`);
      assert(
        response.text.includes("Your Orders") || response.text.includes("Loading orders"),
        "orders page did not render its heading or loading shell"
      );
    });

    await step("customer /returns renders the return-case journey", async () => {
      const response = await customer.get("/returns");
      assert(response.status === 200, `expected HTTP 200, got ${response.status}`);
      assert(
        response.text.includes("Returns &amp; refunds") ||
          response.text.includes("Returns & refunds") ||
          response.text.includes("Your return cases") ||
          response.text.includes("Loading returns and refunds"),
        "returns page did not render its heading or loading shell"
      );
    });

    await step("eligible and ineligible orders are available in the orders read model", async () => {
      const response = await customer.get("/api/orders");
      assert(response.status === 200, `expected HTTP 200, got ${response.status}`);
      const orders = response.body as Json[];
      assert(Array.isArray(orders) && orders.length > 0, "orders API returned no orders");
      const now = Date.now();
      const eligible = orders.find((order) => isEligible(order, now));
      assert(eligible, "no delivered/completed order is inside the return window");
      targetOrderId = String(eligible.id);
      const second = orders.find((order) => String(order.id) !== targetOrderId && isEligible(order, now));
      assert(second, "a second eligible order is needed for the rejection path");
      secondOrderId = String(second.id);
      cancelledOrderId = String(orders.find((order) => order.status === "cancelled")?.id ?? "");
      assert(orders.every((order) => "refundSummary" in order), "orders API did not expose the refund summary");
    });

    await step("return request without a reason is rejected", async () => {
      assert(targetOrderId, "target order missing");
      const response = await customer.post(`/api/orders/${targetOrderId}/confirm`, { action: "return" });
      assert(response.status === 400, `expected HTTP 400, got ${response.status} ${JSON.stringify(response.body)}`);
    });

    await step("return request on a cancelled order is rejected", async () => {
      assert(cancelledOrderId, "cancelled order fixture missing");
      const response = await customer.post(`/api/orders/${cancelledOrderId}/confirm`, {
        action: "return",
        reason: "Item arrived damaged or defective"
      });
      assert(response.status === 409, `expected HTTP 409, got ${response.status}`);
      assert((response.body as Json).code === "not_returnable", "expected not_returnable error code");
    });

    await step("another customer cannot open a return on this order", async () => {
      assert(targetOrderId, "target order missing");
      await seller.login(SELLER.email, SELLER.password);
      const response = await seller.post(`/api/orders/${targetOrderId}/confirm`, {
        action: "return",
        reason: "Item arrived damaged or defective"
      });
      assert(response.status === 403, `expected HTTP 403, got ${response.status}`);
    });

    await step("customer submits one real return request", async () => {
      assert(targetOrderId, "target order missing");
      const response = await customer.post(`/api/orders/${targetOrderId}/confirm`, {
        action: "return",
        reason: "Item arrived damaged or defective",
        detail: `Automated returns acceptance fixture ${runId}; removed after the run.`
      });
      assert(response.status === 201, `expected HTTP 201, got ${response.status} ${JSON.stringify(response.body)}`);
      const body = response.body as Json;
      assert(typeof body.id === "string", "created return request has no id");
      assert(body.status === "REQUESTED", `expected REQUESTED, got ${String(body.status)}`);
      createdReturnId = body.id;
    });

    await step("duplicate open return is rejected", async () => {
      assert(targetOrderId, "target order missing");
      const response = await customer.post(`/api/orders/${targetOrderId}/confirm`, {
        action: "return",
        reason: "Wrong item was delivered"
      });
      assert(response.status === 409, `expected HTTP 409, got ${response.status}`);
      assert((response.body as Json).code === "return_exists", "expected return_exists error code");
    });

    await step("customer cannot use the seller resolution route", async () => {
      assert(createdReturnId, "return fixture missing");
      const response = await customer.post(`/api/seller/returns/${createdReturnId}`, { action: "approve" });
      assert(response.status === 403, `expected HTTP 403, got ${response.status}`);
    });

    await step("customer read model exposes the case and refund record", async () => {
      assert(targetOrderId && createdReturnId, "fixtures missing");
      const response = await customer.get("/api/orders");
      assert(response.status === 200, `expected HTTP 200, got ${response.status}`);
      const order = (response.body as Json[]).find((entry) => entry.id === targetOrderId);
      assert(order, "order disappeared from the customer read model");
      const request = (order.returnRequests ?? []).find((entry) => entry.id === createdReturnId);
      assert(request, "created return request is missing from the order");
      assert(request.status === "REQUESTED", `expected REQUESTED, got ${request.status}`);
      assert(order.refundSummary && "settledKobo" in order.refundSummary, "refundSummary is missing");
    });

    await step("seller approves the return through the scoped seller API", async () => {
      assert(createdReturnId, "return fixture missing");
      const response = await seller.post(`/api/seller/returns/${createdReturnId}`, { action: "approve" });
      assert(response.status === 200, `expected HTTP 200, got ${response.status} ${JSON.stringify(response.body)}`);
      assert((response.body as Json).status === "APPROVED", "approval did not move the return to APPROVED");
    });

    await step("approving the same return twice is rejected", async () => {
      assert(createdReturnId, "return fixture missing");
      const response = await seller.post(`/api/seller/returns/${createdReturnId}`, { action: "approve" });
      assert(response.status === 409, `expected HTTP 409, got ${response.status}`);
      assert((response.body as Json).code === "invalid_transition", "expected invalid_transition error code");
    });

    await step("seller queue lists the approved case", async () => {
      const response = await seller.get("/api/seller/overview");
      assert(response.status === 200, `expected HTTP 200, got ${response.status}`);
      const overview = response.body as Json;
      const row = (overview.returns ?? []).find((entry) => entry.id === createdReturnId);
      assert(row, "seller overview did not include the return");
      assert(row.status === "APPROVED", `expected APPROVED, got ${row.status}`);
    });

    await step("customer sees the seller decision", async () => {
      assert(targetOrderId && createdReturnId, "fixtures missing");
      const response = await customer.get("/api/orders");
      const order = (response.body as Json[]).find((entry) => entry.id === targetOrderId);
      assert(order, "order missing from customer read model");
      const request = (order.returnRequests ?? []).find((entry) => entry.id === createdReturnId);
      assert(request?.status === "APPROVED", "customer read model did not reflect the approval");
    });

    await step("seller can decline a different return", async () => {
      assert(secondOrderId, "second eligible order missing");
      const created = await customer.post(`/api/orders/${secondOrderId}/confirm`, {
        action: "return",
        reason: "Changed my mind",
        detail: `Automated rejection fixture ${runId}; removed after the run.`
      });
      assert(created.status === 201, `expected HTTP 201, got ${created.status} ${JSON.stringify(created.body)}`);
      rejectedReturnId = (created.body as Json).id as string;
      assert(rejectedReturnId, "created rejection fixture has no id");
      const declined = await seller.post(`/api/seller/returns/${rejectedReturnId}`, { action: "reject" });
      assert(declined.status === 200, `expected HTTP 200, got ${declined.status} ${JSON.stringify(declined.body)}`);
      assert((declined.body as Json).status === "REJECTED", "rejection did not move the return to REJECTED");
      const orders = await customer.get("/api/orders");
      const order = (orders.body as Json[]).find((entry) => entry.id === secondOrderId);
      const request = (order?.returnRequests ?? []).find((entry) => entry.id === rejectedReturnId);
      assert(request?.status === "REJECTED", "customer read model did not reflect the rejection");
    });
  } finally {
    try {
      const cleanupIds = [createdReturnId, rejectedReturnId] as Array<string | null>;
      for (const id of cleanupIds.filter((value): value is string => Boolean(value))) {
        await prisma.auditLog.deleteMany({
          where: { entityId: id, action: { startsWith: "return." } }
        });
        await prisma.returnRequest.deleteMany({ where: { id } });
        console.log(`INFO  removed return fixture ${id}`);
      }
    } catch (error) {
      console.error(`WARN  fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exitCode = 1;
});
