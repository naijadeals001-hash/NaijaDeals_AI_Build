#!/usr/bin/env node
/**
 * Verifies the approved staging tester accounts against the running staging app.
 *
 * Checks the real login and permission surface, not a mock:
 *   - Testing Manager can read/assign/reply in the existing support inbox and
 *     cannot reach payouts or super-admin routes.
 *   - Testers can create and read their own support tickets and cannot reach
 *     the support console or finance.
 *   - Seller persona can read the seller overview and cannot reach admin.
 *   - Driver persona can read driver presence and cannot reach seller/admin.
 *
 * The verification support ticket and its notifications/intents are removed
 * afterwards. Account rows remain. No password, cookie or secret is printed.
 */
import fs from "node:fs";
import { Client } from "pg";

const BASE = (process.env.STAGING_BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const ACTIVATION = "C:/NaijaDeals-Staging/secrets/tester-activation.json";
const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const accounts = JSON.parse(fs.readFileSync(ACTIVATION, "utf8")).accounts;
const primary = accounts.filter((row) => !row.ownerTester);
const managerAccount = primary.find((row) => row.roles.includes("support"));
const testerAccount = primary.find((row) => row.roles.includes("customer") && !row.roles.includes("support"));
const sellerAccount = accounts.find((row) => row.roles.includes("vendor"));
const driverAccount = accounts.find((row) => row.roles.includes("driver"));
for (const [label, account] of [["manager", managerAccount], ["tester", testerAccount], ["seller persona", sellerAccount], ["driver persona", driverAccount]]) {
  if (!account) throw new Error(`activation file is missing the ${label} account`);
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const headers = { ...(options.cookie ? { cookie: options.cookie } : {}) };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    headers.origin = BASE;
  }
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { status: response.status, body, response };
}

async function login(account) {
  if (!account?.password) throw new Error(`no activation password for ${account?.email ?? "unknown account"}`);
  const result = await request("/api/auth/login", { body: { email: account.email, password: account.password } });
  const cookies = result.response.headers.getSetCookie?.() ?? [result.response.headers.get("set-cookie") ?? ""];
  const cookie = cookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  return { status: result.status, body: result.body, cookie };
}

const manager = await login(managerAccount);
check("Testing Manager can sign in", manager.status === 200 && Boolean(manager.cookie), `status=${manager.status}`);
const managerMe = await request("/api/auth/me", { cookie: manager.cookie });
check("Testing Manager session has support role", managerMe.status === 200 && (managerMe.body.user?.roles ?? []).includes("support"), `roles=${(managerMe.body.user?.roles ?? []).join(",")}`);
const managerList = await request("/api/admin/support/tickets?pageSize=50", { cookie: manager.cookie });
check("Testing Manager can read the support/test report inbox", managerList.status === 200, `status=${managerList.status}`);
check("Testing Manager is denied payout access", (await request("/api/admin/payouts", { cookie: manager.cookie })).status === 403);
check("Testing Manager is denied super-admin platform settings", (await request("/api/super-admin/system", { cookie: manager.cookie })).status === 403);

const tester = await login(testerAccount);
check("Tester02 can sign in", tester.status === 200 && Boolean(tester.cookie), `status=${tester.status}`);
const marker = `STAGING ACCESS CHECK ${Date.now()}`;
const created = await request("/api/support/tickets", {
  cookie: tester.cookie,
  body: {
    vertical: "general",
    topic: "other",
    subject: marker,
    message: "Verification ticket created by the staging tester-access check. Removed automatically."
  }
});
check("Tester02 can submit a support/bug report", created.status === 201 && Boolean(created.body.reference), `status=${created.status}`);
const own = await request("/api/support/tickets/mine", { cookie: tester.cookie });
check("Tester02 can read their own reports", own.status === 200, `status=${own.status}`);
check("Tester02 is denied the support console", (await request("/api/admin/support/tickets", { cookie: tester.cookie })).status === 403);
check("Tester02 is denied seller access", (await request("/api/seller/overview", { cookie: tester.cookie })).status === 403);

const managerTickets = await request("/api/admin/support/tickets?pageSize=50", { cookie: manager.cookie });
const ticketId = (managerTickets.body.tickets ?? []).find((row) => row.reference === created.body.reference)?.id;
check("Testing Manager sees the tester's report", Boolean(ticketId), ticketId ? "visible" : "missing");
if (ticketId) {
  const assign = await request(`/api/admin/support/tickets/${ticketId}/assign`, {
    cookie: manager.cookie,
    body: { assigneeId: managerMe.body.user.id }
  });
  check("Testing Manager can assign the report to themself", assign.status === 200, `status=${assign.status}`);
  const reply = await request(`/api/admin/support/tickets/${ticketId}/messages`, {
    cookie: manager.cookie,
    body: { message: "Staging verification reply. This ticket is removed automatically.", internal: true }
  });
  check("Testing Manager can add an internal note", reply.status === 201, `status=${reply.status}`);
}

const seller = await login(sellerAccount);
check("Seller persona can sign in", seller.status === 200 && Boolean(seller.cookie), `status=${seller.status}`);
check("Seller persona can read the seller overview", (await request("/api/seller/overview", { cookie: seller.cookie })).status === 200);
check("Seller persona is denied the support console", (await request("/api/admin/support/tickets", { cookie: seller.cookie })).status === 403);

const driver = await login(driverAccount);
check("Driver persona can sign in", driver.status === 200 && Boolean(driver.cookie), `status=${driver.status}`);
check("Driver persona can read driver presence", (await request("/api/drive/driver/presence", { cookie: driver.cookie })).status === 200);
check("Driver persona is denied seller access", (await request("/api/seller/overview", { cookie: driver.cookie })).status === 403);
check("Driver persona is denied the support console", (await request("/api/admin/support/tickets", { cookie: driver.cookie })).status === 403);

// Remove the verification ticket and any notifications/intents it produced.
const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
const db = new Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  const ticket = (await db.query('select id from "SupportTicket" where reference=$1', [created.body.reference])).rows[0];
  if (ticket) {
    const intents = await db.query('select "dedupeKey" from "NotificationIntent" where "entityId"=$1', [ticket.id]);
    const keys = intents.rows.map((row) => `notification:${row.dedupeKey}`);
    await db.query('delete from "NotificationAttempt" where "notificationId" in (select id from "Notification" where "entityId"=$1 or "dedupeKey" = any($2))', [ticket.id, keys]);
    await db.query('delete from "Notification" where "entityId"=$1 or "dedupeKey" = any($2)', [ticket.id, keys]);
    await db.query('delete from "NotificationIntent" where "entityId"=$1', [ticket.id]);
    await db.query('delete from "SupportMessage" where "ticketId"=$1', [ticket.id]);
    await db.query('delete from "SupportTicketEvent" where "ticketId"=$1', [ticket.id]);
    await db.query('delete from "SupportAccessToken" where "ticketId"=$1', [ticket.id]);
    await db.query('delete from "SupportTicket" where id=$1', [ticket.id]);
    await db.query('delete from "AuditLog" where "entityId"=$1', [ticket.id]);
    await db.query('delete from "SystemEvent" where "entityId"=$1', [ticket.id]);
    check("Verification ticket and its notification rows removed", true);
  } else {
    check("Verification ticket found for cleanup", false);
  }
  const leftovers = await db.query(`select (select count(*) from "SupportTicket") tickets, (select count(*) from "NotificationIntent") intents, (select count(*) from "Notification") notifications`);
  check("No verification fixtures remain", Object.values(leftovers.rows[0]).every((value) => Number(value) === 0), JSON.stringify(leftovers.rows[0]));
} finally {
  await db.end();
}

const failed = checks.filter((row) => !row.ok);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
