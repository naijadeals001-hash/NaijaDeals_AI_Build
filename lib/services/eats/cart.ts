import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * Food basket and favourites for NaijaEats.
 *
 * The basket is stored per account so it survives reloads and devices, and is
 * grouped by kitchen — checkout creates one food order per kitchen, so a mixed
 * basket is never silently merged. Prices are always read from the menu item,
 * never from the client.
 */

const MAX_QUANTITY = 10;

export type BasketLine = {
  id: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  unitPriceKobo: string;
  quantity: number;
  available: boolean;
};

export type BasketGroup = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  deliveryFeeKobo: string;
  subtotalKobo: string;
  lines: BasketLine[];
};

export async function getBasket(userId: string): Promise<{ groups: BasketGroup[]; totalKobo: string; count: number }> {
  const rows = await prisma.foodCartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      menuItem: { select: { id: true, name: true, priceKobo: true, imageUrl: true, available: true, restaurantId: true, restaurant: { select: { name: true, slug: true, deliveryFeeKobo: true } } } }
    }
  });

  const groups = new Map<string, BasketGroup>();
  for (const row of rows) {
    const item = row.menuItem;
    const group =
      groups.get(item.restaurantId) ??
      ({
        restaurantId: item.restaurantId,
        restaurantName: item.restaurant.name,
        restaurantSlug: item.restaurant.slug,
        deliveryFeeKobo: item.restaurant.deliveryFeeKobo.toString(),
        subtotalKobo: "0",
        lines: []
      } satisfies BasketGroup);
    group.lines.push({
      id: row.id,
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPriceKobo: item.priceKobo.toString(),
      quantity: row.quantity,
      available: item.available
    });
    group.subtotalKobo = (BigInt(group.subtotalKobo) + item.priceKobo * BigInt(row.quantity)).toString();
    groups.set(item.restaurantId, group);
  }

  const list = [...groups.values()];
  const total = list.reduce((sum, group) => sum + BigInt(group.subtotalKobo), BigInt(0));
  const count = list.reduce((sum, group) => sum + group.lines.reduce((inner, line) => inner + line.quantity, 0), 0);
  return { groups: list, totalKobo: total.toString(), count };
}

export async function addToBasket(userId: string, menuItemId: string, quantity: number, notes?: string) {
  const item = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { id: true, available: true, published: true, restaurantId: true, restaurant: { select: { status: true } } }
  });
  if (!item) throw new ApiError(404, "item_not_found", "That dish no longer exists.");
  if (item.restaurant.status !== "VERIFIED") throw new ApiError(409, "kitchen_unavailable", "This kitchen is not accepting orders.");
  if (!item.published || !item.available) throw new ApiError(409, "item_unavailable", "That dish is not available right now.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError(400, "invalid_quantity", "Choose a quantity of at least 1.");

  const existing = await prisma.foodCartItem.findUnique({ where: { userId_menuItemId: { userId, menuItemId } }, select: { id: true, quantity: true } });
  const nextQuantity = Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + quantity);
  if (existing) {
    await prisma.foodCartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity, notes: notes ?? undefined } });
  } else {
    await prisma.foodCartItem.create({ data: { userId, restaurantId: item.restaurantId, menuItemId, quantity: nextQuantity, notes: notes ?? null } });
  }
  return getBasket(userId);
}

export async function setBasketQuantity(userId: string, lineId: string, quantity: number) {
  const line = await prisma.foodCartItem.findFirst({ where: { id: lineId, userId }, select: { id: true } });
  if (!line) throw new ApiError(404, "line_not_found", "That basket line is not yours.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new ApiError(400, "invalid_quantity", `Quantity must be between 1 and ${MAX_QUANTITY}.`);
  }
  await prisma.foodCartItem.update({ where: { id: line.id }, data: { quantity } });
  return getBasket(userId);
}

export async function removeBasketLine(userId: string, lineId: string) {
  const line = await prisma.foodCartItem.findFirst({ where: { id: lineId, userId }, select: { id: true } });
  if (!line) throw new ApiError(404, "line_not_found", "That basket line is not yours.");
  await prisma.foodCartItem.delete({ where: { id: line.id } });
  return getBasket(userId);
}

export async function clearBasket(userId: string) {
  await prisma.foodCartItem.deleteMany({ where: { userId } });
  return getBasket(userId);
}

/** Remove the lines for one kitchen after a successful order. */
export async function clearBasketForRestaurant(userId: string, restaurantId: string) {
  await prisma.foodCartItem.deleteMany({ where: { userId, restaurantId } });
}

export async function toggleFavourite(userId: string, kind: "restaurant" | "dish", targetId: string) {
  if (!["restaurant", "dish"].includes(kind)) throw new ApiError(400, "invalid_kind", "Favourites support restaurants and dishes.");
  const existing = await prisma.eatsFavourite.findUnique({ where: { userId_kind_targetId: { userId, kind, targetId } }, select: { id: true } });
  if (existing) {
    await prisma.eatsFavourite.delete({ where: { id: existing.id } });
    return { favourited: false };
  }
  if (kind === "restaurant") {
    const exists = await prisma.restaurant.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "restaurant_not_found", "Kitchen not found.");
  } else {
    const exists = await prisma.dish.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "dish_not_found", "Dish not found.");
  }
  await prisma.eatsFavourite.create({ data: { userId, kind, targetId } });
  return { favourited: true };
}

export async function listFavourites(userId: string) {
  const rows = await prisma.eatsFavourite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const restaurantIds = rows.filter((row) => row.kind === "restaurant").map((row) => row.targetId);
  const dishIds = rows.filter((row) => row.kind === "dish").map((row) => row.targetId);
  const [restaurants, dishes] = await Promise.all([
    restaurantIds.length
      ? prisma.restaurant.findMany({ where: { id: { in: restaurantIds } }, select: { id: true, name: true, slug: true, cuisine: true, market: true, logoUrl: true, coverUrl: true } })
      : Promise.resolve([]),
    dishIds.length ? prisma.dish.findMany({ where: { id: { in: dishIds } }, select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true } }) : Promise.resolve([])
  ]);
  return { restaurants, dishes };
}
