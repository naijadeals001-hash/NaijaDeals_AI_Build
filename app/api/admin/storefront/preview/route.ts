import { NextResponse } from "next/server";
import { getStorefrontPreview } from "@/lib/services/core/storefront.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Authorized draft preview.
 *
 * Requires the same `products:moderate` permission as the editor. The response
 * is never cached and is not reachable anonymously, so it cannot be used to
 * read an unpublished storefront draft.
 */
export async function GET() {
  try {
    await requireAdminPermission("products:moderate");
    return NextResponse.json(jsonSafe(await getStorefrontPreview()), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
