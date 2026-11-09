import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Farm applications. New farms are unverified until an admin approves them. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const name = String(body.name ?? "").trim();
    const farmerName = String(body.farmerName ?? "").trim();
    const state = String(body.state ?? "").trim();
    const city = String(body.city ?? "").trim();
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 800) : "";
    const specialities = Array.isArray(body.specialities) ? body.specialities.map(String).map((row) => row.trim()).filter(Boolean).slice(0, 6) : [];
    if (name.length < 2) throw new ApiError(400, "validation_error", "Enter the farm name.");
    if (farmerName.length < 2) throw new ApiError(400, "validation_error", "Enter the farmer's full name.");
    if (!state || !city) throw new ApiError(400, "validation_error", "Enter the state and town of the farm.");

    const existing = await prisma.farm.findFirst({ where: { ownerId: user.id }, select: { slug: true, verified: true } });
    if (existing) return NextResponse.json({ farmSlug: existing.slug, verified: existing.verified, alreadyApplied: true });

    let slug = slugify(name) || `farm-${Date.now()}`;
    if (await prisma.farm.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const farm = await prisma.farm.create({
      data: { slug, ownerId: user.id, name, farmerName, state, city, description: description || null, specialities, verified: false, isSample: false }
    });
    await recordAudit({ actorId: user.id, action: "fresh_farm.applied", entity: "Farm", entityId: farm.id, metadata: { name, state, city } });
    return NextResponse.json(jsonSafe({ farmSlug: farm.slug, verified: farm.verified }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/** Farmer publishes a produce listing on their own verified farm. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const farm = await prisma.farm.findFirst({ where: { ownerId: user.id }, select: { id: true, verified: true, slug: true } });
    if (!farm) throw new ApiError(404, "farm_missing", "Create a farm before listing produce.");
    if (!farm.verified) throw new ApiError(403, "farm_unverified", "Your farm is awaiting NaijaFresh verification. Listings can be published once approved.");

    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const priceNaira = Number(body.priceNaira ?? 0);
    const quantity = Number(body.quantity ?? 0);
    const minimumOrder = Number(body.minimumOrder ?? 1);
    const { FRESH_CATEGORIES } = await import("@/lib/services/fresh/catalogue");
    if (name.length < 2) throw new ApiError(400, "validation_error", "Enter the produce name.");
    if (!FRESH_CATEGORIES.some((row) => row.slug === category)) throw new ApiError(400, "validation_error", "Choose a produce category.");
    if (!unit) throw new ApiError(400, "validation_error", "Enter the unit you sell by (kg, bunch, tuber…).");
    if (!Number.isFinite(priceNaira) || priceNaira <= 0) throw new ApiError(400, "validation_error", "Enter your price per unit.");
    if (!Number.isInteger(quantity) || quantity < 0) throw new ApiError(400, "validation_error", "Enter the quantity available.");
    if (!Number.isInteger(minimumOrder) || minimumOrder < 1) throw new ApiError(400, "validation_error", "Minimum order must be at least 1.");

    let slug = `${farm.slug}-${slugify(name)}`;
    if (await prisma.produceListing.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    const listing = await prisma.produceListing.create({
      data: {
        farmId: farm.id,
        slug,
        name,
        category,
        unit: unit.slice(0, 24),
        priceKobo: BigInt(Math.round(priceNaira * 100)),
        quantity,
        available: quantity > 0,
        minimumOrder,
        description: typeof body.description === "string" ? body.description.trim().slice(0, 600) || null : null
      }
    });
    await recordAudit({ actorId: user.id, action: "fresh_listing.created", entity: "ProduceListing", entityId: listing.id, metadata: { farmId: farm.id, priceKobo: listing.priceKobo.toString(), unit: listing.unit } });
    return NextResponse.json(jsonSafe(listing), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
