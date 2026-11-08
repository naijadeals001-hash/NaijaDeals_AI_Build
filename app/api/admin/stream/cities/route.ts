import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, optionalString, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { cityImageCoverage } from "@/lib/services/stream/cities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * NaijaStream city catalogue management.
 *
 * Operators with `stream:read` see the catalogue and its image coverage;
 * `stream:write` is required to attach approved city photography or to feature
 * a city. Image approval is explicit: setting an image stamps approvedAt so the
 * public catalogue can distinguish approved artwork from a pending slot.
 */
export async function GET() {
  try {
    await requireAdminPermission("stream:read");
    const [cities, coverage] = await Promise.all([
      prisma.streamCity.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      cityImageCoverage()
    ]);
    return NextResponse.json(jsonSafe({ cities, coverage }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("stream:write");
    const body = await readJson<Record<string, unknown>>(request);
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slug) return NextResponse.json({ error: "slug is required.", code: "validation_error" }, { status: 400 });

    const city = await prisma.streamCity.findUnique({ where: { slug } });
    if (!city) return NextResponse.json({ error: "Unknown city.", code: "not_found" }, { status: 404 });

    const imageUrl = body.imageUrl === undefined ? undefined : optionalString(body.imageUrl, 500);
    const data: Record<string, unknown> = {};
    if (imageUrl !== undefined) {
      // Only same-origin approved paths, never an arbitrary external URL.
      if (imageUrl !== null && !/^\/(generated\/|uploads\/)[\w\-./]+\.(jpg|jpeg|png|webp)$/i.test(imageUrl)) {
        return NextResponse.json({ error: "Images must be approved files under /generated or /uploads.", code: "validation_error" }, { status: 400 });
      }
      data.imageUrl = imageUrl;
      data.imageApprovedAt = imageUrl ? new Date() : null;
      data.imageCredit = body.imageCredit === undefined ? city.imageCredit : optionalString(body.imageCredit, 200);
    }
    if (typeof body.featured === "boolean") data.featured = body.featured;
    if (typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder)) data.sortOrder = body.sortOrder;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update.", code: "validation_error" }, { status: 400 });
    }

    const updated = await prisma.streamCity.update({ where: { slug }, data });
    await recordAudit({
      actorId: admin.id,
      action: "stream.city_updated",
      entity: "StreamCity",
      entityId: updated.id,
      metadata: { slug, fields: Object.keys(data), imageApproved: Boolean(updated.imageApprovedAt) }
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
