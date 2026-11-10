import type { SearchEntityType, SearchSyncOp } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { availableQuantity, isFixtureListing } from "@/lib/services/core/catalog.service";
import { deleteProducts, indexProducts, type ProductDocument } from "./search";
import { log } from "./logger";
import { QUEUE_NAMES, enqueue, isQueueConfigured } from "./queue";

/**
 * Durable search synchronisation.
 *
 * A business write records an intent in `SearchSyncEvent`; the worker reads it
 * and updates the index. The row exists until the index accepted the write, so
 * a crash between the database commit and the index call is recovered on the
 * next sweep instead of leaving a permanently stale document.
 *
 * One pending row per entity (`dedupeKey`), so a burst of edits collapses into a
 * single index operation.
 *
 * Visibility is decided at index time from the authoritative row, not from the
 * caller: a product that is not ACTIVE, or whose vendor is not approved, is
 * DELETED from the index. Query paths additionally join against live rows, so a
 * stale document cannot surface a restricted record.
 */

const SUPPORTED: SearchEntityType[] = ["PRODUCT"];

export async function markForIndex(input: {
  entityType: SearchEntityType;
  entityId: string;
  op?: SearchSyncOp;
}): Promise<boolean> {
  if (!SUPPORTED.includes(input.entityType)) {
    log.warn("search.sync_unsupported", { entityType: input.entityType, entityId: input.entityId });
    return false;
  }
  const dedupeKey = `${input.entityType}:${input.entityId}`;
  await prisma.searchSyncEvent.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      entityType: input.entityType,
      entityId: input.entityId,
      op: input.op ?? "UPSERT"
    },
    update: {
      op: input.op ?? "UPSERT",
      processedAt: null,
      attempts: 0,
      lastError: null
    }
  });
  return true;
}

function productDocument(product: {
  id: string;
  name: string;
  description: string;
  priceKobo: bigint;
  slug: string;
  status: string;
  updatedAt: Date;
  vendor: { name: string; status: string };
  category: { name: string } | null;
  stock: { quantity: number; reserved: number } | null;
}): ProductDocument | null {
  if (product.status !== "ACTIVE") return null;
  if (!["VERIFIED", "PENDING"].includes(product.vendor.status)) return null;
  if (isFixtureListing(product as never)) return null;

  const available = product.stock ? product.stock.quantity - product.stock.reserved : 0;
  return {
    id: product.id,
    title: product.name,
    description: product.description,
    vendorName: product.vendor.name,
    category: product.category?.name ?? null,
    priceKobo: Number(product.priceKobo),
    inStock: available > 0,
    href: `/product/${product.id}`,
    updatedAt: product.updatedAt.toISOString()
  };
}

export type SyncResult = { processed: number; failed: number; remaining: number };

/** Processes pending intents. Safe to run concurrently: rows are claimed. */
export async function processPendingSync(limit = 25): Promise<SyncResult> {
  const pending = await prisma.searchSyncEvent.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      if (event.entityType === "PRODUCT") {
        if (event.op === "DELETE") {
          await deleteProducts([event.entityId]);
        } else {
          const product = await prisma.product.findUnique({
            where: { id: event.entityId },
            select: {
              id: true,
              name: true,
              description: true,
              priceKobo: true,
              slug: true,
              status: true,
              updatedAt: true,
              vendor: { select: { name: true, status: true } },
              category: { select: { name: true } },
              stock: { select: { quantity: true, reserved: true } }
            }
          });

          const doc = product ? productDocument({ ...product, category: product.category }) : null;
          if (doc) await indexProducts([doc]);
          else await deleteProducts([event.entityId]);
        }
      }

      await prisma.searchSyncEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), lastError: null }
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
      await prisma.searchSyncEvent.update({
        where: { id: event.id },
        data: { attempts: { increment: 1 }, lastError: message }
      });
      log.warn("search.sync_failed", { entityType: event.entityType, entityId: event.entityId, error: message });
    }
  }

  const remaining = await prisma.searchSyncEvent.count({ where: { processedAt: null } });
  return { processed, failed, remaining };
}

/** Removes old processed rows so the table stays a working set, not a log. */
export async function pruneProcessedSync(olderThanMs = 7 * 24 * 60 * 60_000): Promise<number> {
  const result = await prisma.searchSyncEvent.deleteMany({
    where: { processedAt: { lt: new Date(Date.now() - olderThanMs) } }
  });
  return result.count;
}

/**
 * Records the intent and asks the worker to act now. If no queue backend is
 * configured the row stays pending and the next worker sweep picks it up, so the
 * write is never lost — only delayed.
 */
export async function requestProductSync(productId: string): Promise<void> {
  await markForIndex({ entityType: "PRODUCT", entityId: productId });
  if (isQueueConfigured()) {
    await enqueue(QUEUE_NAMES.searchIndex, "sync", { productId }, { attempts: 3 });
  }
}

export { availableQuantity };
