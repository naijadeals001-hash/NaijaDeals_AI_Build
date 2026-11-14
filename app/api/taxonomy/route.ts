import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPublicTaxonomy } from "@/lib/services/taxonomy/public";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Published taxonomy tree.
 *
 * `country` selects the publication rules and product-count market (default
 * NG). Nodes restricted in that country stay in the response with
 * `canPublish: false` and a `restrictionNote`; they are never silently hidden.
 * `browsingVisible: false` nodes are also included here — they are published,
 * just excluded from browsing rails.
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");
    const city = request.nextUrl.searchParams.get("city");
    return NextResponse.json(jsonSafe(await getPublicTaxonomy({ countryCode: country, city })));
  } catch (error) {
    return jsonError(error);
  }
}
