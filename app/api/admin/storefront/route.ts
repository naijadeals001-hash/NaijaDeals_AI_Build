import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  discardStorefrontDraft,
  getStorefrontAdminState,
  listAfricanFeatureCandidates,
  publishStorefrontDraft,
  saveStorefrontDraft,
  updateStorefrontConfig,
  type StorefrontAdminState
} from "@/lib/services/core/storefront.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import {
  DISCOVERY_CARD_HREFS,
  discoveryImageOptions
} from "@/lib/config/storefront-discovery";

export const dynamic = "force-dynamic";

/**
 * Control Center storefront state.
 *
 * The published config stays at the top level for compatibility with existing
 * clients (`version`, `heroTitle`, …). The operator draft is returned beside it
 * and is never part of the public `/api/storefront` projection.
 */
function adminPayload(
  state: StorefrontAdminState,
  extras?: {
    featuredCandidates?: Awaited<ReturnType<typeof listAfricanFeatureCandidates>>;
  }
) {
  return jsonSafe({
    ...state.published,
    draft: state.draft,
    draftSavedBy: state.draftSavedBy,
    draftSavedAt: state.draftSavedAt,
    ...(extras?.featuredCandidates ? { featuredCandidates: extras.featuredCandidates } : {}),
    discoveryCardHrefs: [...DISCOVERY_CARD_HREFS],
    discoveryImageOptions: discoveryImageOptions()
  });
}

export async function GET() {
  try {
    await requireAdminPermission("products:moderate");
    const [state, featuredCandidates] = await Promise.all([
      getStorefrontAdminState(),
      listAfricanFeatureCandidates()
    ]);
    return NextResponse.json(adminPayload(state, { featuredCandidates }), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const mode = body.mode;
    if (mode !== undefined && mode !== "draft") {
      return NextResponse.json(
        { error: "Use mode \"draft\" to save a draft, or POST /api/admin/storefront to publish it.", code: "invalid_mode" },
        { status: 400 }
      );
    }

    if (mode === "draft") {
      const state = await saveStorefrontDraft(admin.id, body);
      return NextResponse.json(adminPayload(state), { headers: { "Cache-Control": "no-store" } });
    }

    // Legacy contract: a PATCH without a mode publishes immediately. Existing
    // scripts and clients keep this behaviour; the Control Center panel uses
    // mode=draft plus the explicit publish endpoint.
    const published = await updateStorefrontConfig(admin.id, body);
    return NextResponse.json(
      adminPayload({
        published,
        draft: null,
        draftSavedBy: null,
        draftSavedAt: null
      }),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** Publish the saved draft. Requires products:moderate and same-origin. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const published = await publishStorefrontDraft(admin.id, body);
    return NextResponse.json(
      adminPayload({
        published,
        draft: null,
        draftSavedBy: null,
        draftSavedAt: null
      }),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** Discard the saved draft without touching the published config. */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const version = request.nextUrl.searchParams.get("version");
    const state = await discardStorefrontDraft(admin.id, version === null ? {} : { version });
    return NextResponse.json(
      jsonSafe({ ...adminPayload(state), discarded: state.discarded }),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return jsonError(error);
  }
}
