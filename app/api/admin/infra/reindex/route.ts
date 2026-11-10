import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { reindexCatalogue } from "@/lib/infra/catalogue-index";
import { QUEUE_NAMES, enqueue, isQueueConfigured } from "@/lib/infra/queue";

/**
 * Rebuilds the Meilisearch catalogue projection.
 *
 * Queued when BullMQ is available so a large catalogue does not block the
 * request; performed inline when no queue backend is configured, so the
 * capability exists in every environment. Requires `products:moderate` and a
 * same-origin request, and is written to the audit log either way.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");

    if (isQueueConfigured()) {
      const jobId = await enqueue(QUEUE_NAMES.searchIndex, "reindex", { requestedBy: admin.id });
      if (jobId) {
        await recordAudit({
          actorId: admin.id,
          action: "infra.search_reindex_queued",
          entity: "SearchIndex",
          entityId: jobId,
          metadata: { queue: QUEUE_NAMES.searchIndex }
        });
        return NextResponse.json({ queued: true, jobId }, { status: 202 });
      }
    }

    const result = await reindexCatalogue();
    await recordAudit({
      actorId: admin.id,
      action: "infra.search_reindex_completed",
      entity: "SearchIndex",
      entityId: "products",
      metadata: { indexed: result.indexed, skipped: result.skipped, queued: false }
    });
    return NextResponse.json({ queued: false, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
