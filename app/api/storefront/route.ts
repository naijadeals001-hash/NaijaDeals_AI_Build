import { NextResponse } from "next/server";
import { getStorefrontConfig, publicStorefrontConfig } from "@/lib/services/core/storefront.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Public storefront configuration.
 *
 * This route returns the published config only. `publicStorefrontConfig` is an
 * explicit whitelist, so the operator draft stored beside the published config
 * can never be served here.
 */
export async function GET() {
  try {
    const config = await getStorefrontConfig();
    return NextResponse.json(jsonSafe(publicStorefrontConfig(config)), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
