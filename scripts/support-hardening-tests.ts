#!/usr/bin/env node
/**
 * Hardening regression suite for the support system, added after the
 * independent review. It covers the behaviours the first suite did not:
 * single-use links vs session credentials, idempotent guest retries without
 * cross-requester leakage, message ordering, PENDING reopen, closed-ticket
 * guards, unknown-country queue policy and untrusted-proxy rate limiting.
 *
 * Usage (disposable database only):
 *   SUPPORT_TEST_DATABASE_URL=postgresql://…/nd_support_test_* \
 *   DISPOSABLE_TEST_DATABASE=1 npx tsx scripts/support-hardening-tests.ts
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  assignTicket,
  createTicket,
  exchangeGuestToken,
  getCustomerTicket,
  getStaffTicket,
  listStaffTickets,
  postCustomerReply,
  setTicketStatus,
  staffReply,
  staffScope
} from "../lib/services/core/support.service";
import { supportRateLimit } from "../lib/services/core/support-rate-limit";

const url = process.env.SUPPORT_TEST_DATABASE_URL ?? "";
if (!url) throw new Error("SUPPORT_TEST_DATABASE_URL is required.");
const database = new URL(url).pathname.replace(/^\//, "");
if (!database.startsWith("nd_support_test_")) {
  throw new Error(`Refusing to run against ${database}; expected nd_support_test_ prefix.`);
}
if (process.env.DISPOSABLE_TEST_DATABASE !== "1") throw new Error("DISPOSABLE_TEST_DATABASE=1 is required.");

const rows: Array<{ ok: boolean; name: string; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  rows.push({ ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    shell: true
  });
  check("migrations apply", migrate.status === 0, (migrate.stderr || "").slice(-160));

  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const role = await prisma.role.upsert({ where: { name: "support" }, update: {}, create: { name: "support" } });
  const agent = await prisma.user.create({
    data: { email: `hard-agent-${stamp}@naijadeals.test`, name: "Agent", passwordHash: "x", roles: { create: { roleId: role.id } } }
  });
  const ghAgent = await prisma.user.create({
    data: {
      email: `hard-gh-${stamp}@naijadeals.test`,
      name: "GH Agent",
      passwordHash: "x",
      scopeCountryCode: "GH",
      roles: { create: { roleId: role.id } }
    }
  });
  const customer = await prisma.user.create({ data: { email: `hard-cust-${stamp}@naijadeals.test`, name: "Customer", passwordHash: "x" } });

  try {
    // --- single-use link and separate session ------------------------------
    const guest = await createTicket({
      actor: null,
      guestName: "Hardening Guest",
      email: `hard-guest-${stamp}@example.test`,
      vertical: "shop",
      topic: "order",
      subject: "Session lifecycle",
      message: "Testing the access link lifecycle end to end."
    });
    const first = await exchangeGuestToken(guest.accessToken!);
    check("exchange returns a session token distinct from the link", Boolean(first.sessionToken) && first.sessionToken !== guest.accessToken);
    let replay = false;
    try {
      await exchangeGuestToken(guest.accessToken!);
    } catch {
      replay = true;
    }
    check("replaying a consumed link is refused", replay);
    const viaSession = await getCustomerTicket(guest.ticket.reference, { guestToken: first.sessionToken });
    check("session token opens the ticket", viaSession.reference === guest.ticket.reference);
    let rawLink = false;
    try {
      await getCustomerTicket(guest.ticket.reference, { guestToken: guest.accessToken });
    } catch {
      rawLink = true;
    }
    check("consumed link token cannot act as a session", rawLink);

    // --- idempotency and cross-requester isolation ------------------------
    const key = `key-${stamp}`;
    const keyed = await createTicket({
      actor: null, guestName: "Keyed", email: `keyed-${stamp}@example.test`, vertical: "general", topic: "other",
      subject: "Keyed", message: "Keyed enquiry body text.", idempotencyKey: key
    });
    const retry = await createTicket({
      actor: null, guestName: "Keyed", email: `keyed-${stamp}@example.test`, vertical: "general", topic: "other",
      subject: "Keyed", message: "Keyed enquiry body text.", idempotencyKey: key
    });
    check("idempotency key returns the same ticket", retry.duplicate && retry.ticket.reference === keyed.ticket.reference);
    check("a duplicate retry never returns a raw token", retry.accessToken === null);
    const impostor = await createTicket({
      actor: null, guestName: "Impostor", email: `keyed-${stamp}@example.test`, vertical: "general", topic: "other",
      subject: "Keyed", message: "Keyed enquiry body text."
    });
    check("same email/subject/message without the key creates a new ticket", !impostor.duplicate && impostor.ticket.reference !== keyed.ticket.reference);
    check("the impostor gets its own access token", Boolean(impostor.accessToken) && impostor.accessToken !== keyed.accessToken);

    // --- ordering, reopen, closed guards ---------------------------------
    const ticket = await createTicket({
      actor: { userId: customer.id, name: customer.name, email: customer.email },
      vertical: "wallet", topic: "payment", subject: "Ordering", message: "Initial message for ordering checks."
    });
    const scope = staffScope(agent as never);
    await staffReply(agent as never, scope, ticket.ticket.id, "A staff reply moves the ticket to PENDING.", false);
    let afterStaff = await prisma.supportTicket.findUnique({ where: { id: ticket.ticket.id }, select: { status: true } });
    check("a staff reply moves OPEN to PENDING", afterStaff?.status === "PENDING", String(afterStaff?.status));
    await postCustomerReply(ticket.ticket.reference, { userId: customer.id }, "Customer answers the pending question.");
    afterStaff = await prisma.supportTicket.findUnique({ where: { id: ticket.ticket.id }, select: { status: true } });
    check("a customer reply reopens the PENDING ticket", afterStaff?.status === "OPEN", String(afterStaff?.status));
    for (let i = 0; i < 4; i += 1) {
      await postCustomerReply(ticket.ticket.reference, { userId: customer.id }, `Bulk reply number ${i} for ordering.`);
    }
    await postCustomerReply(ticket.ticket.reference, { userId: customer.id }, "Newest message marker.");
    const view = await getCustomerTicket(ticket.ticket.reference, { userId: customer.id });
    check("newest message is last and present", view.messages[view.messages.length - 1].body.includes("Newest message marker"));
    const sorted = view.messages.every((m, i, all) => i === 0 || new Date(all[i - 1].createdAt) <= new Date(m.createdAt));
    check("messages are chronological", sorted);

    await setTicketStatus(agent as never, scope, ticket.ticket.id, "CLOSED");
    let customerClosed = false;
    try {
      await postCustomerReply(ticket.ticket.reference, { userId: customer.id }, "Closed reply attempt.");
    } catch {
      customerClosed = true;
    }
    check("closed ticket rejects customer reply", customerClosed);
    let staffClosed = false;
    try {
      await staffReply(agent as never, scope, ticket.ticket.id, "Closed staff reply attempt.", false);
    } catch {
      staffClosed = true;
    }
    check("closed ticket rejects staff reply", staffClosed);

    // --- unknown-country policy ------------------------------------------
    const unscoped = await listStaffTickets({ countryCode: null }, { page: 1, pageSize: 50 });
    const gh = await listStaffTickets(staffScope(ghAgent as never), { page: 1, pageSize: 50 });
    check("unscoped staff see the guest ticket", unscoped.tickets.some((t) => t.reference === guest.ticket.reference));
    check("GH-scoped staff do not see the unknown-country ticket", !gh.tickets.some((t) => t.reference === guest.ticket.reference));
    const ghDirect = await getStaffTicket(staffScope(ghAgent as never), guest.ticket.id).then(() => true).catch(() => false);
    check("GH-scoped staff cannot open it by id", ghDirect === false);

    // --- country cannot be chosen by a guest ------------------------------
    const chosen = await createTicket({
      actor: null, guestName: "Geo Guest", email: `geo-${stamp}@example.test`, vertical: "general", topic: "other",
      subject: "Geo", message: "Country selection attempt in the service payload.", countryCode: "ZZ"
    });
    const stored = await prisma.supportTicket.findUnique({ where: { id: chosen.ticket.id }, select: { countryCode: true } });
    check("a guest cannot choose a regional queue", stored?.countryCode === null, String(stored?.countryCode));
    check("guest tickets carry no country", guest.ticket ? (await prisma.supportTicket.findUnique({ where: { id: guest.ticket.id }, select: { countryCode: true } }))?.countryCode === null : false);

    // --- untrusted forwarded headers --------------------------------------
    const previous = process.env.SUPPORT_TRUST_PROXY;
    delete process.env.SUPPORT_TRUST_PROXY;
    let sharedLimited = false;
    for (let i = 0; i < 8; i += 1) {
      if (!supportRateLimit("submit", "unknown").allowed) sharedLimited = true;
    }
    check("shared untrusted identity hits the limit", sharedLimited);
    if (previous !== undefined) process.env.SUPPORT_TRUST_PROXY = previous;
  } finally {
    await prisma.supportTicket.deleteMany({ where: { OR: [{ userId: customer.id }, { guestEmail: { contains: `-${stamp}@` } }] } });
    await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: "support:" } } });
    await prisma.auditLog.deleteMany({ where: { entity: "support_ticket" } });
    await prisma.userRole.deleteMany({ where: { userId: { in: [customer.id, agent.id, ghAgent.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, agent.id, ghAgent.id] } } });
    await prisma.role.deleteMany({ where: { name: "support", users: { none: {} } } });
    const left = await prisma.supportTicket.count();
    check("run-owned data removed", left === 0, `remaining: ${left}`);
    await prisma.$disconnect();
  }

  const failed = rows.filter((row) => !row.ok).length;
  console.log(`\nRESULT ${rows.length - failed}/${rows.length} checks passed (database ${database})`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
