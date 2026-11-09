import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * NaijaFresh basket and favourites.
 *
 * The basket is stored per account and grouped by farm: checkout creates one
 * order per farm so each harvest is paid to the farm that grew it. Prices and
 * units are always re-read from the listing, never taken from the client.
 */

const MAX_QUANTITY = 500;

export type FreshBasketLine = {
  id: string;
  listingId: string;
  slug: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  unitPriceKobo: string;
  quantity: number;
  available: boolean;
  stock: number;
  minimumOrder: number;
  lineTotalKobo: string;
};

export type FreshBasketGroup = {
  farmId: string;
  farmSlug: string;
  farmName: string;
  city: string;
  state: string;
  country: string;
  deliveryFeeKobo: string;
  subtotalKobo: string;
  lines: FreshBasketLine[];
};

export type FreshBasket = { groups: FreshBasketGroup[]; subtotalKobo: string; deliveryKobo: string; totalKobo: string; count: number };

export async function getFreshBasket(userId: string): Promise<FreshBasket> {
  const rows = await prisma.freshCartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      listing: {
        select: {
          id: true,
          slug: true,
          name: true,
          unit: true,
          imageUrl: true,
          priceKobo: true,
          available: true,
          quantity: true,
          minimumOrder: true,
          farm: { select: { id: true, slug: true, name: true, city: true, state: true, country: true, deliveryFeeKobo: true } }
        }
      }
    }
  });

  const groups = new Map<string, FreshBasketGroup>();
  for (const row of rows) {
    const listing = row.listing;
    const farm = listing.farm;
    const group =
      groups.get(farm.id) ??
      ({
        farmId: farm.id,
        farmSlug: farm.slug,
        farmName: farm.name,
        city: farm.city,
        state: farm.state,
        country: farm.country,
        deliveryFeeKobo: farm.deliveryFeeKobo.toString(),
        subtotalKobo: "0",
        lines: []
      } satisfies FreshBasketGroup);
    const lineTotal = listing.priceKobo * BigInt(row.quantity);
    group.lines.push({
      id: row.id,
      listingId: listing.id,
      slug: listing.slug,
      name: listing.name,
      unit: listing.unit,
      imageUrl: listing.imageUrl,
      unitPriceKobo: listing.priceKobo.toString(),
      quantity: row.quantity,
      available: listing.available && listing.quantity > 0,
      stock: listing.quantity,
      minimumOrder: listing.minimumOrder,
      lineTotalKobo: lineTotal.toString()
    });
    group.subtotalKobo = (BigInt(group.subtotalKobo) + lineTotal).toString();
    groups.set(farm.id, group);
  }

  const list = [...groups.values()];
  const subtotal = list.reduce((sum, group) => sum + BigInt(group.subtotalKobo), BigInt(0));
  const delivery = list.reduce((sum, group) => sum + BigInt(group.deliveryFeeKobo), BigInt(0));
  return {
    groups: list,
    subtotalKobo: subtotal.toString(),
    deliveryKobo: delivery.toString(),
    totalKobo: (subtotal + delivery).toString(),
    count: list.reduce((sum, group) => sum + group.lines.reduce((inner, line) => inner + line.quantity, 0), 0)
  };
}

/** Basket line count for the header badge; 0 when signed out. */
export async function freshBasketCount(userId: string | null) {
  if (!userId) return 0;
  const rows = await prisma.freshCartItem.aggregate({ where: { userId }, _sum: { quantity: true } });
  return rows._sum.quantity ?? 0;
}

async function requireSellable(listingId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new ApiError(400, "invalid_quantity", `Choose a quantity between 1 and ${MAX_QUANTITY}.`);
  }
  const listing = await prisma.produceListing.findUnique({
    where: { id: listingId },
    select: { id: true, name: true, available: true, quantity: true, minimumOrder: true }
  });
  if (!listing) throw new ApiError(404, "listing_not_found", "That produce listing no longer exists.");
  if (!listing.available || listing.quantity <= 0) throw new ApiError(409, "out_of_stock", `${listing.name} is out of stock.`);
  if (quantity < listing.minimumOrder) throw new ApiError(400, "below_minimum", `${listing.name} has a minimum order of ${listing.minimumOrder}.`);
  if (quantity > listing.quantity) throw new ApiError(409, "insufficient_stock", `Only ${listing.quantity} available for ${listing.name}.`);
  return listing;
}

export async function addFreshItem(userId: string, listingId: string, quantity: number) {
  const listing = await requireSellable(listingId, quantity);
  const existing = await prisma.freshCartItem.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { quantity: true } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > listing.quantity) throw new ApiError(409, "insufficient_stock", `Only ${listing.quantity} in stock for ${listing.name}.`);
  await prisma.freshCartItem.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: { userId, listingId, quantity },
    update: { quantity: next }
  });
  return getFreshBasket(userId);
}

export async function setFreshQuantity(userId: string, lineId: string, quantity: number) {
  const line = await prisma.freshCartItem.findFirst({ where: { id: lineId, userId }, select: { id: true, listingId: true } });
  if (!line) throw new ApiError(404, "line_not_found", "That basket line no longer exists.");
  if (quantity <= 0) {
    await prisma.freshCartItem.delete({ where: { id: line.id } });
    return getFreshBasket(userId);
  }
  const listing = await requireSellable(line.listingId, quantity);
  if (quantity > listing.quantity) throw new ApiError(409, "insufficient_stock", `Only ${listing.quantity} in stock.`);
  await prisma.freshCartItem.update({ where: { id: line.id }, data: { quantity } });
  return getFreshBasket(userId);
}

export async function removeFreshLine(userId: string, lineId: string) {
  const result = await prisma.freshCartItem.deleteMany({ where: { id: lineId, userId } });
  if (!result.count) throw new ApiError(404, "line_not_found", "That basket line no longer exists.");
  return getFreshBasket(userId);
}

/** Clears the lines for one farm after a successful checkout of that farm. */
export async function clearFreshFarmBasket(userId: string, farmId: string) {
  const kept = await prisma.freshCartItem.findMany({ where: { userId }, select: { id: true, listing: { select: { farmId: true } } } });
  const ids = kept.filter((row) => row.listing.farmId === farmId).map((row) => row.id);
  if (ids.length) await prisma.freshCartItem.deleteMany({ where: { id: { in: ids }, userId } });
  return getFreshBasket(userId);
}

export async function toggleFreshFavourite(userId: string, kind: "listing" | "farm", targetId: string) {
  const existing = await prisma.eatsFavourite.findUnique({ where: { userId_kind_targetId: { userId, kind: `fresh_${kind}`, targetId } } });
  if (existing) {
    await prisma.eatsFavourite.delete({ where: { id: existing.id } });
    return { favourited: false };
  }
  await prisma.eatsFavourite.create({ data: { userId, kind: `fresh_${kind}`, targetId } });
  return { favourited: true };
}

export async function listFreshFavourites(userId: string) {
  const rows = await prisma.eatsFavourite.findMany({ where: { userId, kind: { in: ["fresh_listing", "fresh_farm"] } }, orderBy: { createdAt: "desc" } });
  const listingIds = rows.filter((row) => row.kind === "fresh_listing").map((row) => row.targetId);
  const farmIds = rows.filter((row) => row.kind === "fresh_farm").map((row) => row.targetId);
  const [listings, farms] = await Promise.all([
    listingIds.length
      ? prisma.produceListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, slug: true, name: true, unit: true, priceKobo: true, quantity: true, imageUrl: true, farm: { select: { name: true } } }
        })
      : [],
    farmIds.length
      ? prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, slug: true, name: true, city: true, state: true, avatarUrl: true, specialities: true } })
      : []
  ]);
  return { listings, farms };
}
