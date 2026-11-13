import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  canPreviewVertical,
  normaliseCityCode,
  normaliseCountryCode,
  unavailableMessage,
  verticalAccess,
  verticalDefinition
} from "@/lib/services/core/vertical-activation.service";

export const dynamic = "force-dynamic";

/**
 * Public availability signal for the Shop storefront.
 *
 * The homepage card and Shop navigation must not advertise a service that the
 * catalogue/checkout routes will refuse. This endpoint exposes only the
 * effective state (never the operator's internal reason) for the requested
 * country/city. A signed-in Control Center user may probe PREVIEW; the public
 * receives `available: false` in that state.
 */
export async function GET(request: NextRequest) {
  const definition = verticalDefinition("shop");
  const countryCode = normaliseCountryCode(request.nextUrl.searchParams.get("country") || "NG");
  const cityCode = normaliseCityCode(request.nextUrl.searchParams.get("city"));
  const user = await getSessionUser().catch(() => null);
  const { effective, accessible } = await verticalAccess("shop", {
    countryCode,
    cityCode: cityCode || null,
    previewAuthorized: canPreviewVertical(user)
  });

  return NextResponse.json(
    {
      vertical: definition.key,
      label: definition.publicLabel,
      status: effective.status,
      scope: effective.scope,
      countryCode: effective.countryCode,
      cityCode: effective.cityCode,
      available: accessible,
      preview: effective.status === "PREVIEW" && accessible,
      message: accessible ? null : unavailableMessage(definition, effective)
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
