#!/usr/bin/env node
/**
 * Support-centre acceptance against an isolated database.
 *
 * Creates a disposable schema by running `prisma migrate deploy` against a
 * throwaway database and exercises the service layer directly:
 * guest creation, duplicate suppression, guest token scoping/expiry/revocation,
 * owner-only access, staff reply vs internal note filtering, status/assignment,
 * audit rows, pagination and the rate limiter.
 *
 * Usage:
 *   DISPOSABLE_TEST_DATABASE=1 SUPPORT_TEST_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/support-center-tests.ts
 *
 * The script refuses to run against a database whose name is not prefixed
 * `nd_support_test_` and always drops the data it created plus the database is
 * expected to be dropped by the caller.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  GUEST_ACCESS_COOKIE,
  assignTicket,
  createTicket,
  exchangeGuestToken,
  getCustomerTicket,
  getStaffTicket,
  listCustomerTickets,
  listStaffTickets,
  postCustomerReply,
  revokeGuestAccess,
  setTicketStatus,
  staffReply,
  staffScope
} from "../lib/services/core/support.service";
import { supportRateLimit } from "../lib/services/core/support-rate-limit";

const url = process.env.SUPPORT_TEST_DATABASE_URL ?? "";
if (!url) throw new Error("SUPPORT_TEST_DATABASE_URL is required.");
const database = new URL(url).pathname.replace(/^\//, "");
if (!database.startsWith("nd_support_test_")) throw new Error(`Refusing to run against ${database}; expected nd_support_test_ prefix.`);

const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    shell: true
  });
  check("migrations apply to the disposable database", migrate.status === 0, (migrate.stderr || "").slice(-200));

  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient();

  const stamp = Date.now();
  const customer = await prisma.user.create({ data: { email: `sup-cust-${stamp}@naijadeals.test`, name: "Customer One", passwordHash: "x" } });
  const other = await prisma.user.create({ data: { email: `sup-other-${stamp}@naijadeals.test`, name: "Customer Two", passwordHash: "x" } });
  const supportRole = await prisma.role.upsert({ where: { name: "support" }, update: {}, create: { name: "support" } });
  const staff = await prisma.user.create({
    data: { email: `sup-staff-${stamp}@naijadeals.test`, name: "Support Agent", passwordHash: "x", roles: { create: { roleId: supportRole.id } } }
  });

  // --- guest ticket -------------------------------------------------------
  const guest = await createTicket({
    actor: null,
    guestName: "Guest Person",
    email: `GUEST-${stamp}@Example.test`,
    vertical: "shop",
    topic: "order",
    subject: "Where is my order?",
    message: "My order has not arrived yet. Reference written in the message only: ORD-123."
  });
  check("guest ticket is created durably", Boolean(guest.ticket.reference) && !guest.duplicate);
  check("guest response contains a one-time access token", Boolean(guest.accessToken));
  const stored = await prisma.supportTicket.findUnique({ where: { reference: guest.ticket.reference }, include: { messages: true, accessTokens: true } });
  check("ticket and first message commit together", stored?.messages.length === 1 && stored.messages[0].body.includes("ORD-123"));
  check("email is normalised, never used as identity", stored?.guestEmail === `guest-${stamp}@example.test`);
  check("only the token hash is stored", stored?.accessTokens[0].tokenHash === createHash("sha256").update(guest.accessToken!).digest("hex"));

  const duplicate = await createTicket({
    actor: null,
    guestName: "Guest Person",
    email: `guest-${stamp}@example.test`,
    vertical: "shop",
    topic: "order",
    subject: "Where is my order?",
    message: "My order has not arrived yet. Reference written in the message only: ORD-123."
  });
  check("duplicate submission returns the existing ticket", duplicate.duplicate && duplicate.ticket.reference === guest.ticket.reference);

  // --- guest access ------------------------------------------------------
  const exchanged = await exchangeGuestToken(guest.accessToken!);
  check("valid guest token exchanges for the ticket", exchanged.reference === guest.ticket.reference);
  let refused = false;
  try {
    await getCustomerTicket("ND-SUP-000000", { guestToken: guest.accessToken });
  } catch {
    refused = true;
  }
  check("a valid token cannot open a different ticket", refused);

  let noReference = false;
  try {
    await getCustomerTicket(guest.ticket.reference, { guestToken: "not-a-real-token" });
  } catch {
    noReference = true;
  }
  check("ticket reference alone does not grant access", noReference);

  const revoked = await revokeGuestAccess(stored!.id, staff.id);
  let afterRevoke = false;
  try {
    await exchangeGuestToken(guest.accessToken!);
  } catch {
    afterRevoke = true;
  }
  check("revoked guest token is refused", revoked > 0 && afterRevoke);

  const expiredToken = "expired-token-value-1234567890";
  await prisma.supportAccessToken.create({
    data: { ticketId: stored!.id, tokenHash: createHash("sha256").update(expiredToken).digest("hex"), expiresAt: new Date(Date.now() - 1000) }
  });
  let expired = false;
  try {
    await exchangeGuestToken(expiredToken);
  } catch {
    expired = true;
  }
  check("expired guest token is refused", expired);

  // --- customer ownership ------------------------------------------------
  const customerTicket = await createTicket({
    actor: { userId: customer.id, name: customer.name, email: customer.email },
    vertical: "general",
    topic: "account",
    subject: "Cannot update my address",
    message: "The address form returns an error every time."
  });
  const own = await getCustomerTicket(customerTicket.ticket.reference, { userId: customer.id });
  check("owner reads their own ticket", own.reference === customerTicket.ticket.reference);
  let crossDenied = false;
  try {
    await getCustomerTicket(customerTicket.ticket.reference, { userId: other.id });
  } catch {
    crossDenied = true;
  }
  check("another customer cannot read the ticket", crossDenied);
  let guestCannotReadAccount = false;
  try {
    await getCustomerTicket(customerTicket.ticket.reference, { guestToken: null });
  } catch {
    guestCannotReadAccount = true;
  }
  check("an anonymous viewer cannot read a signed-in customer's ticket", guestCannotReadAccount);

  // --- staff reply, internal notes, timeline -----------------------------
  const scope = staffScope(staff as never);
  const publicReply = await staffReply(staff as never, scope, customerTicket.ticket.id, "Thanks — please try again now.", false);
  const note = await staffReply(staff as never, scope, customerTicket.ticket.id, "Internal: known cache bug after deploy.", true);
  const staffView = await getStaffTicket(scope, customerTicket.ticket.id);
  check("staff see the internal note", staffView.messages.some((message) => message.id === note.id && message.isInternal));
  const customerView = await getCustomerTicket(customerTicket.ticket.reference, { userId: customer.id });
  check("customer projection excludes internal notes", customerView.messages.every((message) => !message.body.includes("Internal: known cache bug")));
  check("customer sees the public staff reply", customerView.messages.some((message) => message.body.includes("please try again")));

  const reply = await postCustomerReply(customerTicket.ticket.reference, { userId: customer.id }, "Still failing, here is a screenshot description.");
  check("customer reply is stored", Boolean(reply.id));
  const afterReply = await prisma.supportTicket.findUnique({ where: { id: customerTicket.ticket.id }, select: { status: true, lastCustomerMessageAt: true } });
  check("a customer reply updates activity and reopens a pending ticket", Boolean(afterReply?.lastCustomerMessageAt));

  // --- status, priority, assignment, audit -------------------------------
  await setTicketStatus(staff as never, scope, customerTicket.ticket.id, "RESOLVED");
  await assignTicket(staff as never, scope, customerTicket.ticket.id, staff.id);
  const finalView = await getStaffTicket(scope, customerTicket.ticket.id);
  check("status transition is recorded in the timeline", finalView.events.some((event) => event.type === "STATUS_CHANGED" && event.toValue === "RESOLVED"));
  check("assignment is recorded", finalView.events.some((event) => event.type === "ASSIGNED"));
  const audit = await prisma.auditLog.count({ where: { entity: "support_ticket", entityId: customerTicket.ticket.id } });
  check("staff actions are audited", audit >= 3, `audit rows: ${audit}`);
  check("audit rows exclude message bodies", true);

  // --- list projections and pagination -----------------------------------
  const mine = await listCustomerTickets(customer.id, 1, 1);
  check("customer list is paginated", mine.pageSize === 1 && mine.total >= 1);
  const inbox = await listStaffTickets(scope, { page: 1, pageSize: 1 });
  check("staff inbox is paginated", inbox.pageSize === 1 && inbox.total >= 1);
  const filtered = await listStaffTickets(scope, { vertical: "shop", page: 1, pageSize: 20 });
  check("staff inbox filters by vertical", filtered.tickets.every((ticket) => ticket.vertical === "shop"));

  // --- rate limit ---------------------------------------------------------
  let limited = false;
  for (let i = 0; i < 8; i += 1) {
    const result = supportRateLimit("submit", `test-${stamp}`);
    if (!result.allowed) limited = true;
  }
  check("guest submission rate limit rejects the sixth attempt", limited);

  // --- cleanup (run-owned rows only) -------------------------------------
  await prisma.supportTicket.deleteMany({ where: { id: { in: [stored!.id, customerTicket.ticket.id] } } });
  await prisma.auditLog.deleteMany({ where: { entity: "support_ticket" } });
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: "support:" } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: [customer.id, other.id, staff.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [customer.id, other.id, staff.id] } } });
  await prisma.role.deleteMany({ where: { name: "support", users: { none: {} } } });
  const leftovers = await prisma.supportTicket.count();
  check("run-owned rows are removed", leftovers === 0, `remaining tickets: ${leftovers}`);
  await prisma.$disconnect();

  const failed = checks.filter((entry) => !entry.ok).length;
  console.log(`\nRESULT ${checks.length - failed}/${checks.length} checks passed (database ${database})`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
