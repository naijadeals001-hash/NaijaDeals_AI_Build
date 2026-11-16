import { createHash, randomBytes } from "node:crypto";
import { Prisma, SupportMessageAuthor, SupportTicketStatus, SupportTicketPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "./audit.service";
import { enqueueIntent } from "@/lib/notifications/intent.service";
import { verticals } from "@/lib/data/ecosystem";

/**
 * Customer support: one ticket system shared by every vertical.
 *
 * Rules that the whole module depends on:
 *  - a ticket belongs either to a signed-in user (userId) or to a guest email,
 *    and a guest email never auto-links to an account;
 *  - guest access requires a random token whose sha256 hash is stored; a
 *    ticket reference alone grants nothing;
 *  - internal notes (isInternal) are excluded from every customer projection
 *    and from the customer's unread count;
 *  - an order/booking/trip reference typed by a customer is stored as text in
 *    the message only; it is never used to fetch or expose a record here.
 */

export const SUPPORT_GENERAL_VERTICAL = "general";
export const SUPPORT_TOPICS = [
  "order",
  "payment",
  "delivery",
  "account",
  "technical",
  "partnership",
  "other"
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  PENDING: "Waiting on you",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

export const SUPPORT_LIMITS = {
  subject: 160,
  message: 8000,
  name: 120,
  email: 254,
  pageSize: 20,
  maxPageSize: 50
} as const;

const GUEST_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** An exchanged guest session is deliberately shorter than the link. */
const GUEST_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Legacy cookie name, still accepted for tickets opened before hardening. */
export const GUEST_ACCESS_COOKIE = "nd_support_access";

/**
 * Per-ticket cookie name. One global cookie would mean a guest with two
 * enquiries lost the first whenever they opened the second.
 */
export function guestCookieName(reference: string): string {
  return `nd_support_${reference.replace(/[^A-Za-z0-9]/g, "")}`;
}

export function supportVerticalOptions(): Array<{ key: string; label: string }> {
  const list = verticals.map((vertical) => ({ key: vertical.key, label: vertical.name.replace(/^Naija/, "") }));
  return [{ key: SUPPORT_GENERAL_VERTICAL, label: "General NaijaDeals" }, ...list];
}

export function assertVertical(value: unknown): string {
  const keys = new Set([SUPPORT_GENERAL_VERTICAL, ...verticals.map((vertical) => vertical.key)]);
  const key = typeof value === "string" ? value.trim() : "";
  if (!keys.has(key)) throw new ApiError(422, "invalid_vertical", "Choose a supported NaijaDeals service.");
  return key;
}

export function assertTopic(value: unknown): SupportTopic {
  const topic = typeof value === "string" ? value.trim() : "";
  if (!(SUPPORT_TOPICS as readonly string[]).includes(topic)) {
    throw new ApiError(422, "invalid_topic", "Choose a supported topic.");
  }
  return topic as SupportTopic;
}

export function normaliseEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > SUPPORT_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ApiError(422, "invalid_email", "Enter a valid email address.");
  }
  return email;
}

function cleanText(value: unknown, field: string, max: number, min = 1): string {
  const text = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  if (text.length < min) throw new ApiError(422, `invalid_${field}`, `Enter your ${field.replace(/_/g, " ")}.`);
  if (text.length > max) throw new ApiError(422, `invalid_${field}`, `Keep the ${field.replace(/_/g, " ")} under ${max} characters.`);
  return text;
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  return `ND-SUP-${out}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SupportActor = {
  userId: string | null;
  name: string | null;
  email: string | null;
};

export type CreateTicketInput = {
  actor: SupportActor | null;
  guestName?: unknown;
  email?: unknown;
  vertical: unknown;
  topic: unknown;
  subject: unknown;
  message: unknown;
  countryCode?: string | null;
  /** Optional idempotency key from the client; a repeat returns the same ticket. */
  idempotencyKey?: string | null;
};

export type CreatedTicket = {
  ticket: { id: string; reference: string };
  /** Present only for guest submissions; shown once so the guest can return. */
  accessToken: string | null;
  accessExpiresAt: string | null;
  duplicate: boolean;
};

/**
 * Create a ticket and its first message in one transaction.
 *
 * Guest tokens are created in the same transaction, so the raw token is only
 * ever returned when the ticket itself committed.
 */
export async function createTicket(input: CreateTicketInput): Promise<CreatedTicket> {
  const vertical = assertVertical(input.vertical);
  const topic = assertTopic(input.topic);
  const subject = cleanText(input.subject, "subject", SUPPORT_LIMITS.subject, 3);
  const message = cleanText(input.message, "message", SUPPORT_LIMITS.message, 10);

  const guest = !input.actor;
  const guestName = guest ? cleanText(input.guestName, "name", SUPPORT_LIMITS.name, 2) : null;
  const guestEmail = guest ? normaliseEmail(input.email) : null;

  // Cross-worker abuse cap: a single guest address may open at most five
  // tickets per ten minutes. This is enforced from the database so it holds
  // even when more than one application instance is running.
  if (guest && guestEmail) {
    const recent = await prisma.supportTicket.count({
      where: { guestEmail, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }
    });
    if (recent >= 5) {
      throw new ApiError(429, "rate_limited", "Too many enquiries from this address. Please wait before submitting again.");
    }
  }

  // Duplicate suppression is scoped to the requester:
  //  - a signed-in customer is deduped by their user id;
  //  - a guest is deduped only when the same normalised email *and* the same
  //    client idempotency key match, so one visitor can never be handed another
  //    visitor's reference just by guessing subject and message text.
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.slice(0, 80) : null;
  const duplicate = await prisma.supportTicket.findFirst({
    where: input.actor
      ? {
          userId: input.actor.userId,
          OR: [
            ...(key ? [{ idempotencyKey: key }] : []),
            { subject, createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) }, messages: { some: { body: message, isInternal: false } } }
          ]
        }
      : key && guestEmail
        ? { guestEmail, idempotencyKey: key }
        : { id: "__never__" },
    select: { id: true, reference: true }
  });
  if (duplicate) {
    return { ticket: duplicate, accessToken: null, accessExpiresAt: null, duplicate: true };
  }

  const rawToken = guest ? randomBytes(32).toString("base64url") : null;
  const expiresAt = rawToken ? new Date(Date.now() + GUEST_LINK_TTL_MS) : null;
  // One country decision for both the stored ticket and the staff fan-out, so a
  // ticket can never be routed by a country it did not actually record.
  const ticketCountry =
    input.actor && input.countryCode ? input.countryCode.trim().toUpperCase().slice(0, 2) || null : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const reference = newReference();
        const ticket = await tx.supportTicket.create({
          data: {
            reference,
            vertical,
            topic,
            subject,
            // Only a signed-in customer can carry a country, and the route
            // derives it from the account. A guest never selects a queue.
            countryCode: ticketCountry,
            userId: input.actor?.userId ?? null,
            guestName,
            guestEmail,
            idempotencyKey: key,
            lastCustomerMessageAt: new Date(),
            messages: {
              create: {
                authorType: SupportMessageAuthor.CUSTOMER,
                authorUserId: input.actor?.userId ?? null,
                body: message
              }
            },
            events: { create: { type: "CREATED", actorUserId: input.actor?.userId ?? null, toValue: "OPEN" } }
          },
          select: { id: true, reference: true }
        });
        if (rawToken && expiresAt) {
          await tx.supportAccessToken.create({
            data: { ticketId: ticket.id, tokenHash: hashToken(rawToken), expiresAt }
          });
          await tx.supportTicketEvent.create({
            data: { ticketId: ticket.id, type: "ACCESS_ISSUED", note: "Guest access link issued at submission" }
          });
        }
        // Durable outbox: staff alerts are written in the same transaction as the
        // ticket, so a rollback removes both. The worker (or the authenticated
        // n8n consumer) delivers them later with lease/ack/retry semantics.
        const staff = await tx.user.findMany({
          where: {
            roles: { some: { role: { name: { in: ["super_admin", "admin", "ops", "support", "staging_test_manager"] } } } },
            OR: ticketCountry
              ? [{ scopeCountryCode: null }, { scopeCountryCode: ticketCountry }]
              : [{ scopeCountryCode: null }]
          },
          select: { id: true },
          take: 20
        });
        for (const member of staff) {
          await enqueueIntent(tx, {
            dedupeKey: `support.ticket.created:${ticket.id}:${member.id}`,
            eventType: "support.ticket.created",
            entityType: "support_ticket",
            entityId: ticket.id,
            recipientUserId: member.id,
            payload: { version: 1, reference, subject, vertical, priority: "NORMAL" }
          });
        }
        return ticket;
      });

      return { ticket: created, accessToken: rawToken, accessExpiresAt: expiresAt?.toISOString() ?? null, duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 4) continue;
      throw error;
    }
  }
  throw new ApiError(500, "ticket_creation_failed", "The ticket could not be created. Try again.");
}

// ---------------------------------------------------------------------------
// Guest access
// ---------------------------------------------------------------------------

export async function resolveGuestTicket(reference: string, rawToken: string | null | undefined) {
  if (!rawToken) return null;
  const token = await prisma.supportAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      purpose: true,
      consumedAt: true,
      expiresAt: true,
      revokedAt: true,
      ticket: { select: { id: true, reference: true } }
    }
  });
  if (!token || token.purpose !== "SESSION" || token.revokedAt || token.expiresAt.getTime() <= Date.now()) return null;
  if (token.ticket.reference !== reference) return null;
  await prisma.supportAccessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return token.ticket;
}

export async function exchangeGuestToken(rawToken: string) {
  if (!rawToken || rawToken.length < 20) throw new ApiError(422, "invalid_token", "This access link is not valid.");
  const token = await prisma.supportAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, purpose: true, consumedAt: true, expiresAt: true, revokedAt: true, ticketId: true, ticket: { select: { reference: true } } }
  });
  if (
    !token ||
    token.purpose !== "LINK" ||
    token.consumedAt ||
    token.revokedAt ||
    token.expiresAt.getTime() <= Date.now()
  ) {
    throw new ApiError(401, "invalid_token", "This access link is invalid, already used or has expired.");
  }

  const sessionRaw = randomBytes(32).toString("base64url");
  const sessionExpires = new Date(Math.min(token.expiresAt.getTime(), Date.now() + GUEST_SESSION_TTL_MS));

  // Single use: the conditional update is the replay guard. If another request
  // consumed the link first, exactly one transaction wins.
  const consumed = await prisma.$transaction(async (tx) => {
    const result = await tx.supportAccessToken.updateMany({
      where: { id: token.id, purpose: "LINK", consumedAt: null, revokedAt: null },
      data: { consumedAt: new Date(), lastUsedAt: new Date() }
    });
    if (result.count !== 1) return null;
    await tx.supportAccessToken.create({
      data: { ticketId: token.ticketId, tokenHash: hashToken(sessionRaw), purpose: "SESSION", expiresAt: sessionExpires }
    });
    return { reference: token.ticket.reference, expiresAt: sessionExpires.toISOString() };
  });
  if (!consumed) throw new ApiError(401, "invalid_token", "This access link was already used. Ask support for a new one.");
  return { ...consumed, sessionToken: sessionRaw };
}

export async function issueGuestAccess(ticketId: string, actorId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + GUEST_LINK_TTL_MS);
  await prisma.$transaction([
    prisma.supportAccessToken.create({ data: { ticketId, tokenHash: hashToken(rawToken), purpose: "LINK", expiresAt } }),
    prisma.supportTicketEvent.create({
      data: { ticketId, type: "ACCESS_ISSUED", actorUserId: actorId, note: "Staff issued a guest access link" }
    })
  ]);
  return { token: rawToken, expiresAt: expiresAt.toISOString() };
}

export async function revokeGuestAccess(ticketId: string, actorId: string) {
  const result = await prisma.supportAccessToken.updateMany({
    where: { ticketId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (result.count > 0) {
    await prisma.supportTicketEvent.create({
      data: { ticketId, type: "ACCESS_REVOKED", actorUserId: actorId, note: `${result.count} guest token(s) revoked` }
    });
  }
  return result.count;
}

// ---------------------------------------------------------------------------
// Customer projections
// ---------------------------------------------------------------------------

export type CustomerMessage = {
  id: string;
  author: "CUSTOMER" | "STAFF" | "SYSTEM";
  body: string;
  createdAt: string;
};

const customerMessageSelect = {
  id: true,
  authorType: true,
  body: true,
  createdAt: true,
  isInternal: true
} as const;

function toCustomerMessages(rows: Array<{ id: string; authorType: SupportMessageAuthor; body: string; createdAt: Date; isInternal: boolean }>): CustomerMessage[] {
  return rows
    .filter((row) => !row.isInternal)
    .map((row) => ({ id: row.id, author: row.authorType, body: row.body, createdAt: row.createdAt.toISOString() }));
}

export async function listCustomerTickets(userId: string, page: number, pageSize: number) {
  const take = Math.min(Math.max(pageSize, 1), SUPPORT_LIMITS.maxPageSize);
  const skip = Math.max(page - 1, 0) * take;
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        reference: true,
        subject: true,
        vertical: true,
        topic: true,
        status: true,
        lastActivityAt: true,
        createdAt: true,
        _count: { select: { messages: { where: { isInternal: false } } } }
      }
    })
  ]);
  return {
    total,
    page,
    pageSize: take,
    tickets: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      subject: row.subject,
      vertical: row.vertical,
      topic: row.topic,
      status: row.status,
      messageCount: row._count.messages,
      lastActivityAt: row.lastActivityAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    }))
  };
}

export async function getCustomerTicket(reference: string, viewer: { userId?: string | null; guestToken?: string | null }) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { reference },
    select: {
      id: true,
      reference: true,
      subject: true,
      vertical: true,
      topic: true,
      status: true,
      userId: true,
      guestName: true,
      createdAt: true,
      lastActivityAt: true,
      closedAt: true,
      messages: { select: customerMessageSelect, orderBy: { createdAt: "desc" }, take: 200 }
    }
  });
  if (!ticket) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");

  const isOwner = Boolean(viewer.userId && ticket.userId === viewer.userId);
  const isGuest = !ticket.userId ? Boolean(await resolveGuestTicket(reference, viewer.guestToken)) : false;
  if (!isOwner && !isGuest) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");

  return {
    id: ticket.id,
    reference: ticket.reference,
    subject: ticket.subject,
    vertical: ticket.vertical,
    topic: ticket.topic,
    status: ticket.status,
    name: ticket.guestName,
    createdAt: ticket.createdAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
    messages: toCustomerMessages(ticket.messages).reverse()
  };
}

export async function postCustomerReply(reference: string, viewer: { userId?: string | null; guestToken?: string | null }, bodyInput: unknown) {
  const body = cleanText(bodyInput, "message", SUPPORT_LIMITS.message, 1);
  const ticket = await prisma.supportTicket.findUnique({
    where: { reference },
    select: { id: true, userId: true, status: true, assignedToId: true, reference: true, subject: true, countryCode: true }
  });
  if (!ticket) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");
  const isOwner = Boolean(viewer.userId && ticket.userId === viewer.userId);
  const isGuest = !ticket.userId ? Boolean(await resolveGuestTicket(reference, viewer.guestToken)) : false;
  if (!isOwner && !isGuest) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");
  if (ticket.status === "CLOSED") throw new ApiError(409, "ticket_closed", "This ticket is closed. Open a new enquiry if you need more help.");

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: ticket.status === "RESOLVED" || ticket.status === "PENDING" ? "OPEN" : ticket.status,
        lastActivityAt: now,
        lastCustomerMessageAt: now
      }
    });
    const created = await tx.supportMessage.create({
      data: { ticketId: ticket.id, authorType: SupportMessageAuthor.CUSTOMER, authorUserId: viewer.userId ?? null, body }
    });
    await tx.supportTicketEvent.create({
      data: { ticketId: ticket.id, type: "CUSTOMER_REPLY", actorUserId: viewer.userId ?? null }
    });
    // Durable outbox in the same transaction as the message: a rollback removes
    // both, and the assigned agent is alerted exactly once per message.
    if (ticket.assignedToId) {
      await enqueueIntent(tx, {
        dedupeKey: `support.ticket.customer_reply:${created.id}`,
        eventType: "support.ticket.customer_reply",
        entityType: "support_ticket",
        entityId: ticket.id,
        recipientUserId: ticket.assignedToId,
        payload: { version: 1, reference: ticket.reference, subject: ticket.subject }
      });
    } else {
      // Unassigned: a customer reply must still reach the queue, scoped by the
      // country the ticket actually stored.
      const staff = await tx.user.findMany({
        where: {
          roles: { some: { role: { name: { in: ["super_admin", "admin", "ops", "support", "staging_test_manager"] } } } },
          OR: ticket.countryCode
            ? [{ scopeCountryCode: null }, { scopeCountryCode: ticket.countryCode }]
            : [{ scopeCountryCode: null }]
        },
        select: { id: true },
        take: 20
      });
      for (const member of staff) {
        await enqueueIntent(tx, {
          dedupeKey: `support.ticket.queued_reply:${created.id}:${member.id}`,
          eventType: "support.ticket.queued_reply",
          entityType: "support_ticket",
          entityId: ticket.id,
          recipientUserId: member.id,
          payload: { version: 1, reference: ticket.reference, subject: ticket.subject }
        });
      }
    }
    return created;
  });

  return { id: message.id, createdAt: message.createdAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Staff projections and actions
// ---------------------------------------------------------------------------

export type StaffScope = { countryCode: string | null };

export function staffScope(user: SessionUser): StaffScope {
  return { countryCode: user.scopeCountryCode ?? null };
}

function scopedWhere(scope: StaffScope): Prisma.SupportTicketWhereInput {
  return scope.countryCode ? { countryCode: scope.countryCode } : {};
}

export async function listStaffTickets(
  scope: StaffScope,
  filters: {
    status?: string | null;
    vertical?: string | null;
    topic?: string | null;
    priority?: string | null;
    assignedToId?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  }
) {
  const take = Math.min(Math.max(filters.pageSize ?? SUPPORT_LIMITS.pageSize, 1), SUPPORT_LIMITS.maxPageSize);
  const page = Math.max(filters.page ?? 1, 1);
  const where: Prisma.SupportTicketWhereInput = {
    ...scopedWhere(scope),
    ...(filters.status ? { status: filters.status as SupportTicketStatus } : {}),
    ...(filters.vertical ? { vertical: filters.vertical } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.priority ? { priority: filters.priority as SupportTicketPriority } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.search
      ? {
          OR: [
            { reference: { contains: filters.search, mode: "insensitive" } },
            { subject: { contains: filters.search, mode: "insensitive" } },
            { guestEmail: { contains: filters.search, mode: "insensitive" } },
            { user: { email: { contains: filters.search, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        reference: true,
        subject: true,
        vertical: true,
        topic: true,
        status: true,
        priority: true,
        guestEmail: true,
        lastActivityAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { messages: { where: { isInternal: false } } } }
      }
    })
  ]);

  return {
    total,
    page,
    pageSize: take,
    tickets: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      subject: row.subject,
      vertical: row.vertical,
      topic: row.topic,
      status: row.status,
      priority: row.priority,
      customer: row.user ? { name: row.user.name, email: row.user.email } : { name: "Guest", email: row.guestEmail ? maskEmail(row.guestEmail) : null },
      assignee: row.assignedTo ? { id: row.assignedTo.id, name: row.assignedTo.name } : null,
      messageCount: row._count.messages,
      lastActivityAt: row.lastActivityAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    }))
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export async function getStaffTicket(scope: StaffScope, id: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, ...scopedWhere(scope) },
    select: {
      id: true,
      reference: true,
      subject: true,
      vertical: true,
      topic: true,
      status: true,
      priority: true,
      guestName: true,
      guestEmail: true,
      countryCode: true,
      createdAt: true,
      lastActivityAt: true,
      lastCustomerMessageAt: true,
      lastStaffMessageAt: true,
      closedAt: true,
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      messages: {
        select: {
          id: true,
          authorType: true,
          isInternal: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 300
      },
      events: {
        select: { id: true, type: true, fromValue: true, toValue: true, note: true, createdAt: true, actor: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 300
      },
      accessTokens: { select: { id: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true } }
    }
  });
  if (!ticket) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");
  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    lastCustomerMessageAt: ticket.lastCustomerMessageAt?.toISOString() ?? null,
    lastStaffMessageAt: ticket.lastStaffMessageAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    messages: ticket.messages
      .slice()
      .reverse()
      .map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
    events: ticket.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    accessTokens: ticket.accessTokens.map((token) => ({
      ...token,
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
      revokedAt: token.revokedAt?.toISOString() ?? null,
      lastUsedAt: token.lastUsedAt?.toISOString() ?? null
    }))
  };
}

async function requireScopedTicket(scope: StaffScope, id: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, ...scopedWhere(scope) },
    select: { id: true, reference: true, subject: true, userId: true, status: true, priority: true, assignedToId: true }
  });
  if (!ticket) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");
  return ticket;
}

export async function staffReply(
  actor: SessionUser,
  scope: StaffScope,
  id: string,
  bodyInput: unknown,
  internal: boolean
) {
  const ticket = await requireScopedTicket(scope, id);
  if (ticket.status === "CLOSED") throw new ApiError(409, "ticket_closed", "Reopen the ticket before replying.");
  const body = cleanText(bodyInput, "message", SUPPORT_LIMITS.message, 1);
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: SupportMessageAuthor.STAFF,
        authorUserId: actor.id,
        isInternal: internal,
        body
      }
    });
    if (!internal) {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.status === "OPEN" ? "PENDING" : ticket.status,
          lastActivityAt: now,
          lastStaffMessageAt: now
        }
      });
    }
    await tx.supportTicketEvent.create({
      data: { ticketId: ticket.id, type: internal ? "INTERNAL_NOTE" : "STAFF_REPLY", actorUserId: actor.id }
    });
    // A public staff reply notifies the owner through the durable outbox in the
    // same transaction. An internal note is staff-only and never enqueues.
    if (!internal && ticket.userId) {
      await enqueueIntent(tx, {
        dedupeKey: `support.ticket.staff_reply:${created.id}`,
        eventType: "support.ticket.staff_reply",
        entityType: "support_ticket",
        entityId: ticket.id,
        recipientUserId: ticket.userId,
        payload: { version: 1, reference: ticket.reference, subject: ticket.subject }
      });
    }
    return created;
  });

  await recordAudit({
    actorId: actor.id,
    action: internal ? "support.note" : "support.reply",
    entity: "support_ticket",
    entityId: ticket.id,
    metadata: { messageId: message.id, internal }
  }).catch(() => undefined);

  return { id: message.id, createdAt: message.createdAt.toISOString(), internal };
}

export async function assignTicket(actor: SessionUser, scope: StaffScope, id: string, assigneeId: string | null) {
  const ticket = await requireScopedTicket(scope, id);
  let assigneeName: string | null = null;
  if (assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, roles: { some: { role: { name: { in: ["super_admin", "admin", "ops", "support", "staging_test_manager"] } } } } },
      select: { id: true, name: true }
    });
    if (!assignee) throw new ApiError(422, "invalid_assignee", "That person cannot be assigned support tickets.");
    assigneeName = assignee.name;
  }
  await prisma.$transaction([
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { assignedToId: assigneeId } }),
    prisma.supportTicketEvent.create({
      data: {
        ticketId: ticket.id,
        type: assigneeId ? "ASSIGNED" : "UNASSIGNED",
        actorUserId: actor.id,
        toValue: assigneeName
      }
    })
  ]);
  await recordAudit({
    actorId: actor.id,
    action: assigneeId ? "support.assign" : "support.unassign",
    entity: "support_ticket",
    entityId: ticket.id,
    metadata: { assigneeId }
  }).catch(() => undefined);
  return { assignedToId: assigneeId };
}

export async function setTicketStatus(actor: SessionUser, scope: StaffScope, id: string, statusInput: unknown) {
  const status = String(statusInput ?? "").toUpperCase() as SupportTicketStatus;
  if (!Object.values(SupportTicketStatus).includes(status)) {
    throw new ApiError(422, "invalid_status", "Choose a valid ticket status.");
  }
  const ticket = await requireScopedTicket(scope, id);
  if (ticket.status === status) return { status };

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        closedAt: status === "CLOSED" ? new Date() : null,
        lastActivityAt: new Date()
      }
    });
    const event = await tx.supportTicketEvent.create({
      data: { ticketId: ticket.id, type: "STATUS_CHANGED", actorUserId: actor.id, fromValue: ticket.status, toValue: status },
      select: { id: true }
    });
    // Keyed by the event id, so one status transition produces one intent and a
    // repeated call (which returns early above) can never notify twice.
    if (ticket.userId) {
      await enqueueIntent(tx, {
        dedupeKey: `support.ticket.status_changed:${event.id}`,
        eventType: "support.ticket.status_changed",
        entityType: "support_ticket",
        entityId: ticket.id,
        recipientUserId: ticket.userId,
        payload: { version: 1, reference: ticket.reference, subject: ticket.subject, status }
      });
    }
  });
  await recordAudit({
    actorId: actor.id,
    action: "support.status",
    entity: "support_ticket",
    entityId: ticket.id,
    metadata: { from: ticket.status, to: status }
  }).catch(() => undefined);

  return { status };
}

export async function setTicketPriority(actor: SessionUser, scope: StaffScope, id: string, priorityInput: unknown) {
  const priority = String(priorityInput ?? "").toUpperCase() as SupportTicketPriority;
  if (!Object.values(SupportTicketPriority).includes(priority)) {
    throw new ApiError(422, "invalid_priority", "Choose a valid priority.");
  }
  const ticket = await requireScopedTicket(scope, id);
  if (ticket.priority === priority) return { priority };
  await prisma.$transaction([
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { priority } }),
    prisma.supportTicketEvent.create({
      data: { ticketId: ticket.id, type: "PRIORITY_CHANGED", actorUserId: actor.id, fromValue: ticket.priority, toValue: priority }
    })
  ]);
  await recordAudit({
    actorId: actor.id,
    action: "support.priority",
    entity: "support_ticket",
    entityId: ticket.id,
    metadata: { from: ticket.priority, to: priority }
  }).catch(() => undefined);
  return { priority };
}

export async function listStaffAssignees(scope: StaffScope) {
  const users = await prisma.user.findMany({
    where: {
      roles: { some: { role: { name: { in: ["super_admin", "admin", "ops", "support", "staging_test_manager"] } } } },
      ...(scope.countryCode
        ? { OR: [{ scopeCountryCode: null }, { scopeCountryCode: scope.countryCode }] }
        : {})
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 50
  });
  return users;
}
