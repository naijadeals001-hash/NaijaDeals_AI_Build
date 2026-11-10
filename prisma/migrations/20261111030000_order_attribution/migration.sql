CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "touchId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");
CREATE INDEX "OrderAttribution_affiliateId_idx" ON "OrderAttribution"("affiliateId");
CREATE INDEX "OrderAttribution_campaignId_idx" ON "OrderAttribution"("campaignId");
