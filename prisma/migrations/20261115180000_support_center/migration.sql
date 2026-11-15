-- Customer support: tickets, messages, timeline events and guest access tokens.

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportMessageAuthor" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');
CREATE TYPE "SupportEventType" AS ENUM (
  'CREATED', 'ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED',
  'STAFF_REPLY', 'INTERNAL_NOTE', 'CUSTOMER_REPLY', 'ACCESS_ISSUED', 'ACCESS_REVOKED'
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "vertical" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "subject" VARCHAR(160) NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  "countryCode" TEXT,
  "userId" TEXT,
  "guestName" VARCHAR(120),
  "guestEmail" TEXT,
  "assignedToId" TEXT,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCustomerMessageAt" TIMESTAMP(3),
  "lastStaffMessageAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorType" "SupportMessageAuthor" NOT NULL,
  "authorUserId" TEXT,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "body" VARCHAR(8000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketEvent" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "SupportEventType" NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "note" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAccessToken" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "SupportAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");
CREATE INDEX "SupportTicket_status_lastActivityAt_idx" ON "SupportTicket"("status", "lastActivityAt");
CREATE INDEX "SupportTicket_vertical_status_lastActivityAt_idx" ON "SupportTicket"("vertical", "status", "lastActivityAt");
CREATE INDEX "SupportTicket_userId_lastActivityAt_idx" ON "SupportTicket"("userId", "lastActivityAt");
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");
CREATE INDEX "SupportTicket_guestEmail_idx" ON "SupportTicket"("guestEmail");

CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "SupportMessage_ticketId_isInternal_createdAt_idx" ON "SupportMessage"("ticketId", "isInternal", "createdAt");

CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

CREATE UNIQUE INDEX "SupportAccessToken_tokenHash_key" ON "SupportAccessToken"("tokenHash");
CREATE INDEX "SupportAccessToken_ticketId_expiresAt_idx" ON "SupportAccessToken"("ticketId", "expiresAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAccessToken" ADD CONSTRAINT "SupportAccessToken_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
