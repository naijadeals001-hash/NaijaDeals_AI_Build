import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

function text(value: unknown, field: string, max = 120) {
  const out = typeof value === "string" ? value.trim() : "";
  if (!out) throw new ApiError(400, "validation_error", `${field} is required.`);
  if (out.length > max) throw new ApiError(400, "validation_error", `${field} is too long.`);
  return out;
}

/**
 * Host application (POST) and property creation (PUT). A property is created in
 * `pending` state and only becomes bookable after Control Center approval.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const existing = await prisma.stayHost.findUnique({ where: { ownerId: user.id }, select: { id: true } });
    if (existing) throw new ApiError(409, "host_exists", "This account is already registered as a host.");
    const host = await prisma.stayHost.create({
      data: {
        ownerId: user.id,
        displayName: text(body.displayName, "Name", 120),
        phone: text(body.phone, "Phone", 40),
        country: text(body.country, "Country", 60),
        documentRef: typeof body.documentRef === "string" ? body.documentRef.trim().slice(0, 80) || null : null
      }
    });
    await recordAudit({ actorId: user.id, action: "stay_host.applied", entity: "StayHost", entityId: host.id, metadata: { country: host.country } });
    return NextResponse.json(jsonSafe({ hostId: host.id, status: host.status }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const host = await prisma.stayHost.findUnique({ where: { ownerId: user.id }, select: { id: true, status: true } });
    if (!host) throw new ApiError(404, "host_missing", "Apply to host first.");
    if (host.status !== "verified") throw new ApiError(403, "host_unverified", "Your host account is awaiting verification, so new listings cannot be submitted yet.");

    const body = await readJson<Record<string, unknown>>(request);
    const listingType = String(body.listingType ?? "stay");
    if (!["stay", "rent", "sale", "land"].includes(listingType)) throw new ApiError(400, "invalid_type", "Choose stay, rent, sale or land.");
    const nightlyNaira = Number(body.nightlyNaira ?? 0);
    const saleNaira = Number(body.saleNaira ?? 0);
    if ((listingType === "stay" || listingType === "rent") && !(nightlyNaira > 0)) throw new ApiError(400, "invalid_price", "Enter the nightly price.");
    if ((listingType === "sale" || listingType === "land") && !(saleNaira > 0)) throw new ApiError(400, "invalid_price", "Enter the asking price.");

    const title = text(body.title, "Title", 140);
    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "stay";
    let slug = slugBase;
    if (await prisma.stayProperty.findUnique({ where: { slug }, select: { id: true } })) slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

    const property = await prisma.stayProperty.create({
      data: {
        hostId: host.id,
        slug,
        title,
        category: String(body.category ?? "hotels"),
        listingType,
        description: text(body.description, "Description", 2000),
        city: text(body.city, "City", 80),
        country: text(body.country ?? "Nigeria", "Country", 60),
        maxGuests: Math.max(1, Number(body.maxGuests ?? 2)),
        bedrooms: Math.max(0, Number(body.bedrooms ?? 1)),
        beds: Math.max(1, Number(body.beds ?? 1)),
        bathrooms: Math.max(0, Number(body.bathrooms ?? 1)),
        nightlyKobo: BigInt(Math.round(nightlyNaira * 100)),
        salePriceKobo: saleNaira > 0 ? BigInt(Math.round(saleNaira * 100)) : null,
        cleaningFeeKobo: BigInt(Math.round(Number(body.cleaningNaira ?? 0) * 100)),
        amenities: Array.isArray(body.amenities) ? body.amenities.map(String).slice(0, 20) : [],
        status: "pending"
      }
    });
    await prisma.stayUnit.create({ data: { propertyId: property.id, name: "Entire place", maxGuests: property.maxGuests, nightlyKobo: property.nightlyKobo } });
    await recordAudit({ actorId: user.id, action: "stay_property.submitted", entity: "StayProperty", entityId: property.id, metadata: { slug, listingType } });
    return NextResponse.json(jsonSafe({ propertyId: property.id, slug, status: property.status }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
