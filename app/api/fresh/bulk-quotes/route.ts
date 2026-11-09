import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Business/wholesale quote requests.
 *
 * Buyers ask the farm for a quantity; the farm answers with its own price. No
 * quote is ever generated on the farm's behalf, and no market price is assumed.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const [mine, forMyFarms] = await Promise.all([
      prisma.bulkQuoteRequest.findMany({
        where: { buyerId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { listing: { select: { name: true, unit: true, priceKobo: true, farm: { select: { name: true, slug: true } } } } }
      }),
      prisma.bulkQuoteRequest.findMany({
        where: { listing: { farm: { ownerId: user.id } } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { listing: { select: { name: true, unit: true } }, buyer: { select: { name: true, email: true } } }
      })
    ]);
    return NextResponse.json(jsonSafe({ mine, forMyFarms }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const listingId = String(body.listingId ?? "");
    const quantity = Number(body.quantity ?? 0);
    if (!listingId) throw new ApiError(400, "listing_required", "Choose the produce you want a quote for.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError(400, "invalid_quantity", "Quantity must be a whole number above zero.");
    const listing = await prisma.produceListing.findUnique({ where: { id: listingId }, select: { id: true, unit: true, farm: { select: { ownerId: true } } } });
    if (!listing) throw new ApiError(404, "listing_not_found", "That produce listing no longer exists.");
    if (listing.farm.ownerId === user.id) throw new ApiError(400, "own_listing", "You cannot request a quote from your own farm.");
    const quote = await prisma.bulkQuoteRequest.create({
      data: { listingId: listing.id, buyerId: user.id, quantity, note: typeof body.note === "string" ? body.note.slice(0, 500) : null }
    });
    return NextResponse.json(jsonSafe(quote), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/** The farm answers a request with its own price per unit, or declines it. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const id = String(body.id ?? "");
    const decision = String(body.status ?? "");
    const quote = await prisma.bulkQuoteRequest.findUnique({ where: { id }, select: { id: true, listing: { select: { farm: { select: { ownerId: true } } } } } });
    if (!quote) throw new ApiError(404, "quote_not_found", "Quote request not found.");
    if (quote.listing.farm.ownerId !== user.id) throw new ApiError(403, "forbidden", "Only the farm owner can answer this request.");
    if (decision === "declined") {
      return NextResponse.json(jsonSafe(await prisma.bulkQuoteRequest.update({ where: { id }, data: { status: "declined" } })));
    }
    if (decision !== "quoted") throw new ApiError(400, "invalid_status", "status must be quoted or declined.");
    const price = Number(body.quotedPriceKobo ?? 0);
    if (!Number.isInteger(price) || price <= 0) throw new ApiError(400, "invalid_price", "Enter the farm's price per unit in kobo.");
    return NextResponse.json(jsonSafe(await prisma.bulkQuoteRequest.update({ where: { id }, data: { status: "quoted", quotedPriceKobo: BigInt(price) } })));
  } catch (error) {
    return jsonError(error);
  }
}
