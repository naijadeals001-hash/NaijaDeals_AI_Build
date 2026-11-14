import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { listPublicEligibleProductIds } from "./catalog.service";

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          vendor: true,
          stock: true,
          images: { orderBy: { sortOrder: "asc" as const }, take: 1 }
        }
      },
      variant: true
    },
    orderBy: { createdAt: "asc" as const }
  }
};

export async function getOrCreateActiveCart(userId: string) {
  const existing = await prisma.cart.findFirst({
    where: { userId, status: "ACTIVE" },
    include: cartInclude
  });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId }, include: cartInclude });
}

function availableStock(item: { variant?: { stock: number; reserved: number } | null; product: { stock: { quantity: number; reserved: number } | null } }) {
  if (item.variant) return item.variant.stock - item.variant.reserved;
  return item.product.stock ? item.product.stock.quantity - item.product.stock.reserved : 0;
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

  let variant = null;
  if (input.variantId) {
    variant = product.variants.find((candidate) => candidate.id === input.variantId && candidate.isActive) ?? null;
    if (!variant) throw new ApiError(400, "variant_unavailable", "The selected option is not available.");
  } else if (product.variants.some((candidate) => candidate.isActive)) {
    // Variant stock and product-level stock are separate pools. Never sell the
    // product-level pool for a product that is actually sold by variant.
    throw new ApiError(400, "variant_required", "Choose a product option before adding this item to the cart.");
  }

  const cart = await getOrCreateActiveCart(input.userId);
  const existing = cart.items.find(
    (item) => item.productId === input.productId && (item.variantId ?? null) === (input.variantId ?? null)
  );
  const desired = (existing?.quantity ?? 0) + quantity;
  const stock = variant ? variant.stock - variant.reserved : product.stock ? product.stock.quantity - product.stock.reserved : 0;
  if (desired > stock) throw new ApiError(409, "insufficient_stock", `Only ${Math.max(stock, 0)} unit(s) available.`);

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variantId: input.variantId ?? null,
        quantity
      }
    });
  }
  return getOrCreateActiveCart(input.userId);
}

export async function updateCartItem(input: { userId: string; itemId: string; quantity: number; savedForLater?: boolean }) {
  const cart = await getOrCreateActiveCart(input.userId);
  const item = cart.items.find((candidate) => candidate.id === input.itemId);
  if (!item) throw new ApiError(404, "cart_item_not_found", "Cart item not found.");
  if (input.quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return getOrCreateActiveCart(input.userId);
  }
  const quantity = Math.trunc(input.quantity);
  if (!Number.isInteger(quantity) || quantity > 10) {
    throw new ApiError(400, "validation_error", "Quantity must be between 1 and 10.");
  }
  if (!input.savedForLater && quantity > availableStock(item)) {
    throw new ApiError(409, "insufficient_stock", `Only ${Math.max(availableStock(item), 0)} unit(s) available.`);
  }
  await prisma.cartItem.update({
    where: { id: item.id },
    data: { quantity, ...(input.savedForLater === undefined ? {} : { savedForLater: input.savedForLater }) }
  });
  return getOrCreateActiveCart(input.userId);
}

export async function deleteCartItem(input: { userId: string; itemId: string }) {
  const cart = await getOrCreateActiveCart(input.userId);
  const item = cart.items.find((candidate) => candidate.id === input.itemId);
  if (!item) throw new ApiError(404, "cart_item_not_found", "Cart item not found.");
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getOrCreateActiveCart(input.userId);
}

export function cartTotals(cart: Awaited<ReturnType<typeof getOrCreateActiveCart>>) {
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
