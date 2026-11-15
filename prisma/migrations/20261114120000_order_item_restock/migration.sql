-- Durable per-item physical-stock recovery ledger.
--
-- The order-level `order.stock_restocked` SystemEvent remains the legacy
-- exactly-once marker, but it cannot represent a partially suppressed restore:
-- one order can contain items whose stock source disappeared or became
-- variant-managed, and the old marker made every later retry report
-- "already restocked" while the physical units were never returned.
--
-- This table records the real per-item outcome. A completed financial refund
-- therefore never implies that stock was restored; `status = 'SUPPRESSED'`
-- rows stay visible for reconciliation and remain retryable once the source
-- is resolvable. `orderItemId` is unique so a retry can never increment the
-- same physical units twice.
CREATE TYPE "OrderItemRestockStatus" AS ENUM ('RESTORED', 'SUPPRESSED', 'LEGACY_RECORDED');

CREATE TABLE "OrderItemRestock" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" "OrderItemRestockStatus" NOT NULL,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastSource" TEXT,
    "lastActorId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItemRestock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderItemRestock_orderItemId_key" ON "OrderItemRestock"("orderItemId");
CREATE INDEX "OrderItemRestock_orderId_status_idx" ON "OrderItemRestock"("orderId", "status");
CREATE INDEX "OrderItemRestock_status_updatedAt_idx" ON "OrderItemRestock"("status", "updatedAt");

ALTER TABLE "OrderItemRestock"
  ADD CONSTRAINT "OrderItemRestock_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItemRestock"
  ADD CONSTRAINT "OrderItemRestock_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
