import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { availabilityProjection } from "./availability";
import { listPublicEligibleProductIds } from "./catalog.service";
import { lockInventoryStock } from "./variant-contract";

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          vendor: true,
          stock: true,
          images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
          // Only active variants matter for cart availability: an inactive
          // option is not purchasable, and a product-level line on a product
          // that now sells by variant must ask for a choice.
          variants: {
            where: { isActive: true },
            select: { id: true, isActive: true, stock: true, reserved: true }
          }
        }
      },
      variant: true
    },
    orderBy: { createdAt: "asc" as const }
  }
};

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartItemWithRelations = CartWithItems["items"][number];

export type CartLineAvailability = {
  /** Units a customer can add or move to the active cart now. */
  available: number;
  purchasable: boolean;
  reason: "product_unavailable" | "vendor_unavailable" | "variant_unavailable" | "variant_required" | "out_of_stock" | null;
};

/**
 * Server-authoritative availability for one cart line.
 *
 * Saved-for-later lines are deliberately included: deactivating a variant is
 * allowed while an unrelated customer has it saved, and that saved line must
 * then report itself unavailable (with the option to remove or choose another
 * option) instead of silently failing at checkout.
 */
function cartLineAvailability(item: CartItemWithRelations): CartLineAvailability {
  if (item.product.status !== "ACTIVE") {
    return { available: 0, purchasable: false, reason: "product_unavailable" };
  }
  if (item.product.vendor.status !== "VERIFIED") {
    return { available: 0, purchasable: false, reason: "vendor_unavailable" };
  }
  if (item.variant) {
    if (!item.variant.isActive) {
      return { available: 0, purchasable: false, reason: "variant_unavailable" };
    }
    const available = availabilityProjection({ variants: [item.variant] }).available;
    return {
      available,
      purchasable: available > 0,
      reason: available > 0 ? null : "out_of_stock"
    };
  }
  if (item.product.variants.length > 0) {
    // Variant stock and product-level stock are separate pools. A line that
    // did not choose an option is not fulfilling an active variant product.
    return { available: 0, purchasable: false, reason: "variant_required" };
  }
  const available = availabilityProjection({ stock: item.product.stock }).available;
  return {
    available,
    purchasable: available > 0,
    reason: available > 0 ? null : "out_of_stock"
  };
}

function decorateCart(cart: CartWithItems) {
  return {
    ...cart,
    items: cart.items.map((item) => ({ ...item, availability: cartLineAvailability(item) }))
  };
}

export type DecoratedCart = ReturnType<typeof decorateCart>;

/**
 * Serialise every write for one customer's cart.
 *
 * The user row lock makes cart creation single-writer (there is no unique
 * constraint on one ACTIVE cart per user), and taking it before the cart row
 * keeps the lock order identical to checkout: user -> cart -> stock/variant.
 */
async function lockUserCart(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

async function activeCartIdForUpdate(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Cart"
    WHERE "userId" = ${userId} AND status = 'ACTIVE'
    ORDER BY "createdAt" DESC, id DESC
    FOR UPDATE
  `;
  if (rows[0]) return rows[0].id;
  const created = await tx.cart.create({ data: { userId }, select: { id: true } });
  return created.id;
}

async function loadCart(tx: Prisma.TransactionClient, cartId: string) {
  return tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
}

/**
 * The customer's active cart, newest first (the same cart checkout claims).
 * Creation is serialised on the user row so two first-time requests cannot
 * leave two ACTIVE carts behind.
 */
export async function getOrCreateActiveCart(userId: string): Promise<DecoratedCart> {
  return prisma.$transaction(async (tx) => {
    await lockUserCart(tx, userId);
    const cartId = await activeCartIdForUpdate(tx, userId);
    return decorateCart(await loadCart(tx, cartId));
  });
}

type LockedVariant = { id: string; isActive: boolean; stock: number; reserved: number };

async function lockProductVariant(
  tx: Prisma.TransactionClient,
  productId: string,
  variantId: string
): Promise<LockedVariant | null> {
  const rows = await tx.$queryRaw<LockedVariant[]>`
    SELECT id, "isActive", stock, reserved
    FROM "ProductVariant"
    WHERE id = ${variantId} AND "productId" = ${productId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Add a new item to the customer's active cart.
 *
 * `market` is the visitor's effective market (resolved server-side from the
 * validated locale, never from the request body). It is optional only for
 * non-HTTP maintenance callers: when omitted, eligibility is evaluated against
 * the product's own fulfilment country, which still enforces the public
 * category/regulated rules rather than skipping them. Preview authorization is
 * forwarded to the activation gate only; it never bypasses product eligibility.
 *
 * The stock/variant row is locked before the quantity check, so a concurrent
 * checkout reservation, seller quantity edit or variant deactivation cannot
 * interleave between the read and the cart write. Variant lines and product
 * lines use the same lock the transition/quantity guards use.
 */
export async function addCartItem(input: {
  userId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  market?: { countryCode: string; cityCode?: string | null };
  previewAuthorized?: boolean;
}) {
  const quantity = Math.trunc(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new ApiError(400, "validation_error", "Quantity must be between 1 and 10.");
  }
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { stock: true, vendor: true, variants: true }
  });
  if (!product || product.status !== "ACTIVE") throw new ApiError(404, "product_unavailable", "This product is not available.");
  if (product.saleMode === "contact") {
    throw new ApiError(400, "contact_seller_only", "This listing is fulfilled by the seller directly; use Contact seller instead of checkout.");
  }
  if (product.vendor.status !== "VERIFIED") throw new ApiError(409, "vendor_unavailable", "This seller is not accepting orders.");

  // The selected market is a publication boundary. A product listed for
  // another country keeps the historical refusal code/message; a product that
  // is not publicly eligible in this market (regulated/unresolved category,
  // restricted node or fixture inventory) is rejected before any cart write.
  const marketCountry = (input.market?.countryCode ?? product.countryCode).trim().toUpperCase();
  const cityCode = input.market?.cityCode ?? null;
  if (product.countryCode.trim().toUpperCase() !== marketCountry) {
    throw new ApiError(
      409,
      "product_market_unavailable",
      "This listing is not sold in your selected market. Change your delivery location to shop its home market."
    );
  }
  const eligibleIds = await listPublicEligibleProductIds({
    countryCode: marketCountry,
    cityCode,
    previewAuthorized: input.previewAuthorized,
    productIds: [product.id]
  });
  if (!eligibleIds.has(product.id)) {
    throw new ApiError(
      409,
      "product_market_unavailable",
      "This listing is not available in your selected market. Choose another product or change your delivery location."
    );
  }

  const variantId = input.variantId ?? null;
  if (variantId) {
    const variant = product.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant) throw new ApiError(400, "variant_unavailable", "The selected option is not available.");
  } else if (product.variants.some((candidate) => candidate.isActive)) {
    // Variant stock and product-level stock are separate pools. Never sell the
    // product-level pool for a product that is actually sold by variant.
    throw new ApiError(400, "variant_required", "Choose a product option before adding this item to the cart.");
  }

  return prisma.$transaction(async (tx) => {
    await lockUserCart(tx, input.userId);
    const cartId = await activeCartIdForUpdate(tx, input.userId);

    let available: number;
    if (variantId) {
      // Canonical order: user/cart -> product stock -> variant row. The stock
      // lock (a zero row for a variant-managed product) serialises this add
      // with `syncProductVariants` and the other cart paths, while the variant
      // lock protects its stock/reserved/active state.
      await lockInventoryStock(tx, product.id);
      const locked = await lockProductVariant(tx, product.id, variantId);
      if (!locked || !locked.isActive) {
        throw new ApiError(400, "variant_unavailable", "The selected option is not available.");
      }
      available = availabilityProjection({ variants: [locked] }).available;
    } else {
      // Locking the stock row serialises this add with a seller quantity edit
      // and with `syncProductVariants`, which takes the same row first.
      const locked = await lockInventoryStock(tx, product.id);
      const activeVariants = await tx.productVariant.count({ where: { productId: product.id, isActive: true } });
      if (activeVariants > 0) {
        throw new ApiError(400, "variant_required", "Choose a product option before adding this item to the cart.");
      }
      available = availabilityProjection({ stock: locked }).available;
    }

    const existing = await tx.cartItem.findFirst({
      where: { cartId, productId: input.productId, variantId }
    });
    const desired = (existing?.quantity ?? 0) + quantity;
    if (desired > available) {
      throw new ApiError(409, "insufficient_stock", `Only ${Math.max(available, 0)} unit(s) available.`);
    }

    if (existing) {
      await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
    } else {
      await tx.cartItem.create({
        data: {
          cartId,
          productId: input.productId,
          variantId,
          quantity
        }
      });
    }
    return decorateCart(await loadCart(tx, cartId));
  });
}

export async function updateCartItem(input: {
  userId: string;
  itemId: string;
  quantity: number;
  savedForLater?: boolean;
}) {
  const requestedQuantity = Math.trunc(input.quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity > 10) {
    throw new ApiError(400, "validation_error", "Quantity must be between 1 and 10.");
  }

  return prisma.$transaction(async (tx) => {
    await lockUserCart(tx, input.userId);
    const cartId = await activeCartIdForUpdate(tx, input.userId);
    const item = await tx.cartItem.findFirst({
      where: { id: input.itemId, cartId },
      include: {
        variant: true,
        product: {
          include: {
            stock: true,
            variants: { where: { isActive: true }, select: { id: true, isActive: true, stock: true, reserved: true } }
          }
        }
      }
    });
    if (!item) throw new ApiError(404, "cart_item_not_found", "Cart item not found.");

    if (requestedQuantity <= 0) {
      await tx.cartItem.delete({ where: { id: item.id } });
      return decorateCart(await loadCart(tx, cartId));
    }

    // `savedForLater` is a display state, not a reservation. Only a line that
    // will be inside the active cart needs current stock.
    const willBeActive = input.savedForLater === undefined ? !item.savedForLater : !input.savedForLater;
    if (!willBeActive) {
      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: requestedQuantity, ...(input.savedForLater === undefined ? {} : { savedForLater: true }) }
      });
      return decorateCart(await loadCart(tx, cartId));
    }

    let available: number;
    if (item.variantId) {
      // Canonical order: user/cart -> product stock -> variant row. The stock
      // lock keeps a concurrent variant transition from changing the source
      // between the availability read and the cart write.
      await lockInventoryStock(tx, item.productId);
      // Re-read the variant under its row lock: a concurrent deactivation takes
      // this lock, then counts live cart lines. A saved line may be deactivated
      // while saved; moving it back to the cart must therefore fail cleanly.
      const locked = await lockProductVariant(tx, item.productId, item.variantId);
      if (!locked || !locked.isActive) {
        throw new ApiError(
          409,
          "variant_unavailable",
          "This option is no longer available. Remove the saved item or choose another option."
        );
      }
      available = availabilityProjection({ variants: [locked] }).available;
    } else {
      const locked = await lockInventoryStock(tx, item.productId);
      const activeVariants = await tx.productVariant.count({ where: { productId: item.productId, isActive: true } });
      if (activeVariants > 0) {
        throw new ApiError(
          409,
          "variant_required",
          "This listing now sells by option. Remove the saved item or choose another option."
        );
      }
      available = availabilityProjection({ stock: locked }).available;
    }

    if (item.product.status !== "ACTIVE") {
      throw new ApiError(409, "product_unavailable", "This listing is no longer available. Remove it from your cart.");
    }
    if (requestedQuantity > available) {
      throw new ApiError(409, "insufficient_stock", `Only ${Math.max(available, 0)} unit(s) available.`);
    }

    await tx.cartItem.update({
      where: { id: item.id },
      data: { quantity: requestedQuantity, ...(input.savedForLater === undefined ? {} : { savedForLater: false }) }
    });
    return decorateCart(await loadCart(tx, cartId));
  });
}

export async function deleteCartItem(input: { userId: string; itemId: string }) {
  return prisma.$transaction(async (tx) => {
    await lockUserCart(tx, input.userId);
    const cartId = await activeCartIdForUpdate(tx, input.userId);
    const item = await tx.cartItem.findFirst({ where: { id: input.itemId, cartId }, select: { id: true } });
    if (!item) throw new ApiError(404, "cart_item_not_found", "Cart item not found.");
    await tx.cartItem.delete({ where: { id: item.id } });
    return decorateCart(await loadCart(tx, cartId));
  });
}

export function cartTotals(cart: DecoratedCart) {
  const active = cart.items.filter((item) => !item.savedForLater);
  const subtotalKobo = active.reduce((total, item) => {
    const unit = item.variant ? item.variant.priceKobo : item.product.priceKobo;
    return total + unit * BigInt(item.quantity);
  }, BigInt(0));
  return {
    itemCount: active.reduce((count, item) => count + item.quantity, 0),
    subtotalKobo: subtotalKobo.toString()
  };
}
