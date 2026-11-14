import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { assertRegion } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { updateCountryTheme } from "@/lib/services/countries/discovery.service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("countries:editorial:write");
    const body = await readJson<Record<string, unknown>>(request);
    const themeId = String(body.themeId ?? "").trim();
    if (!themeId) return NextResponse.json({ error: "Theme id is required.", code: "validation_error" }, { status: 400 });
    const theme = await prisma.countryTheme.findUnique({ where: { id: themeId }, select: { countryCode: true } });
    if (!theme) return NextResponse.json({ error: "Country theme not found.", code: "theme_not_found" }, { status: 404 });
    assertRegion(admin, { countryCode: theme.countryCode }, "country theme");
    const sources = Array.isArray(body.sources)
      ? body.sources.map((entry) =>
          entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
        )
      : undefined;
    const profile = await updateCountryTheme(admin, {
      themeId,
      label: typeof body.label === "string" ? body.label : undefined,
      association: typeof body.association === "string" ? body.association : undefined,
      imageUrl: body.imageUrl === null ? null : typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: body.imageAlt === null ? null : typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      imageKind: body.imageKind === null ? null : typeof body.imageKind === "string" ? body.imageKind : undefined,
      imageProvenance:
        body.imageProvenance === null
          ? null
          : typeof body.imageProvenance === "string"
            ? body.imageProvenance
            : undefined,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      editorialStatus:
        body.editorialStatus === "NEEDS_REVIEW" || body.editorialStatus === "REVIEWED"
          ? body.editorialStatus
          : undefined,
      sources: sources as Array<{ title?: string; publisher?: string | null; url?: string; accessedAt?: string }> | undefined
    });
    return NextResponse.json(jsonSafe(profile));
  } catch (error) {
    return jsonError(error);
  }
}
