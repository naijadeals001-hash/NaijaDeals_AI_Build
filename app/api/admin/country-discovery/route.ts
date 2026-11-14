import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { assertRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";
import {
  listAdminCountries,
  publishCountry,
  unpublishCountry,
  updateCountryProfile
} from "@/lib/services/countries/discovery.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await requireAdminPermission("countries:editorial:read");
    return NextResponse.json(jsonSafe(await listAdminCountries()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Country code is required.", code: "validation_error" }, { status: 400 });
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "publish") {
      const admin = await requireAdminPermission("countries:editorial:publish");
      assertRegion(admin, { countryCode: code }, "country profile");
      return NextResponse.json(jsonSafe(await publishCountry(admin, code)));
    }
    if (action === "unpublish") {
      const admin = await requireAdminPermission("countries:editorial:publish");
      assertRegion(admin, { countryCode: code }, "country profile");
      return NextResponse.json(jsonSafe(await unpublishCountry(admin, code)));
    }
    if (action) {
      return NextResponse.json({ error: "Unsupported action.", code: "invalid_action" }, { status: 400 });
    }

    const admin = await requireAdminPermission("countries:editorial:write");
    assertRegion(admin, { countryCode: code }, "country profile");
    const profile = await updateCountryProfile(admin, {
      code,
      introduction: typeof body.introduction === "string" ? body.introduction : undefined,
      editorialStatus:
        body.editorialStatus === "NEEDS_REVIEW" || body.editorialStatus === "REVIEWED"
          ? body.editorialStatus
          : undefined,
      homeFeatured: typeof body.homeFeatured === "boolean" ? body.homeFeatured : undefined,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder)
    });
    return NextResponse.json(jsonSafe(profile));
  } catch (error) {
    return jsonError(error);
  }
}
