import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Saves or unsaves a property. Stored in the shared favourites table (kind: stay_property). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const propertyId = String(body.propertyId ?? "");
    if (!propertyId) throw new ApiError(400, "property_required", "propertyId is required.");
    const property = await prisma.stayProperty.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!property) throw new ApiError(404, "property_not_found", "That property does not exist.");
    const existing = await prisma.eatsFavourite.findUnique({ where: { userId_kind_targetId: { userId: user.id, kind: "stay_property", targetId: propertyId } } });
    if (existing) {
      await prisma.eatsFavourite.delete({ where: { id: existing.id } });
      return NextResponse.json(jsonSafe({ saved: false }));
    }
    await prisma.eatsFavourite.create({ data: { userId: user.id, kind: "stay_property", targetId: propertyId } });
    return NextResponse.json(jsonSafe({ saved: true }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
