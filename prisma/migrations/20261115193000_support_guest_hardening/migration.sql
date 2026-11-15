-- Guest access hardening: one-time link tokens, separate session credentials,
-- and an idempotency key scoped to the submitting owner.

ALTER TABLE "SupportTicket" ADD COLUMN "idempotencyKey" TEXT;
CREATE INDEX "SupportTicket_guestEmail_idempotencyKey_idx" ON "SupportTicket"("guestEmail", "idempotencyKey");

ALTER TABLE "SupportAccessToken" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'LINK';
ALTER TABLE "SupportAccessToken" ADD COLUMN "consumedAt" TIMESTAMP(3);
CREATE INDEX "SupportAccessToken_ticketId_purpose_idx" ON "SupportAccessToken"("ticketId", "purpose");
