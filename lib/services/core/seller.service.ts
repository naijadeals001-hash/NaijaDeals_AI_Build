import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { resolveSellerProductCategory } from "@/lib/services/taxonomy/eligibility";
import { validateImage, type CatalogueImageInput } from "./catalogue-admin.service";
import { COUNTRIES } from "@/lib/config/commerce";
import {
  assertProductQuantityAllowed,
  parseVariantsPayload,
  syncProductVariants,
  variantSnapshot
} from "./variant-contract";
import {
  assertNoBlockingRefundObligation,
  loadOrderRefundState,
  lockOrderRow,
  updateOrderStatus
} from "./order.service";
import { refundPayment, restockOrderItemsOnce } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { assertShopAccess } from "./vertical-activation.service";

const MAX_PRODUCT_IMAGES = 6;

/**
 * Seller gallery rules are the same as the Control Center product editor:
 * 1..6 images, project-path or HTTPS URL, accessible alt text on every image,
 * no duplicate URL, and at most one explicit primary image (stored first).
 */
function normaliseSellerImages(
  images: unknown,
  imageUrl?: string,
  imageAlt?: string
): Array<{ url: string; alt: string }> {
  const entries: CatalogueImageInput[] = Array.isArray(images)
    ? images.map((entry) => (entry && typeof entry === "object" ? (entry as CatalogueImageInput) : { url: entry }))
    : imageUrl !== undefined
      ? [{ url: imageUrl, alt: imageAlt }]
      : [];
  const parsed: Array<{ url: string; alt: string; order: number; primary: boolean; index: number }> = [];
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const image = validateImage(entry.url, entry.alt, false);
    if (!image.imageUrl || !image.imageAlt) return;
    if (seen.has(image.imageUrl)) throw new ApiError(400, "duplicate_image", "The same image was supplied more than once.");
    seen.add(image.imageUrl);
    const rawOrder = entry.sortOrder ?? entry.order;
    const order = Number.isSafeInteger(Number(rawOrder)) && Number(rawOrder) >= 0 ? Number(rawOrder) : index;
    parsed.push({ url: image.imageUrl, alt: image.imageAlt, order, primary: entry.primary === true, index });
  });
  if (parsed.length === 0) {
    throw new ApiError(400, "image_required", "Add at least one product image with accessible alt text.");
  }
  if (parsed.length > MAX_PRODUCT_IMAGES) {
    throw new ApiError(400, "too_many_images", `A listing can have at most ${MAX_PRODUCT_IMAGES} images.`);
  }
  if (parsed.filter((image) => image.primary).length > 1) {
    throw new ApiError(400, "multiple_primary_images", "Choose exactly one primary (cover) image.");
  }
  return parsed
    .sort(
      (left, right) =>
        Number(right.primary) - Number(left.primary) ||
        left.order - right.order ||
        left.index - right.index
    )
    .map((image) => ({ url: image.url, alt: image.alt }));
}

export async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findFirst({ where: { ownerId: userId } });
  if (!vendor) throw new ApiError(403, "not_a_seller", "No seller profile is linked to this account.");
  return vendor;
}

export async function getSellerOverview(userId: string) {
  const vendor = await getVendorForUser(userId);
  const [orders, products, returns, payouts, wallet] = await Promise.all([
    prisma.order.findMany({
      where: { vendorId: vendor.id },
      include: { items: true, customer: { select: { name: true } }, deliveries: true },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.product.findMany({
      where: { vendorId: vendor.id },
      include: { images: true, stock: true, variants: true, category: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.returnRequest.findMany({
      where: { vendorId: vendor.id },
      include: { order: { select: { orderNumber: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } }),
    prisma.wallet.findFirst({ where: { vendorId: vendor.id, ownerType: "VENDOR" } })
  ]);

  const lowStock = products.filter((product) => {
    const active = product.variants.filter((variant) => variant.isActive);
    if (active.length > 0) {
      return active.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0) <= 3;
    }
    return product.stock ? Math.max(product.stock.quantity - product.stock.reserved, 0) <= 3 : true;
  }).length;

  const paid = orders.filter((order) => order.paymentStatus === "paid");
  const grossKobo = paid.reduce((total, order) => total + order.subtotalKobo, BigInt(0));
  const commissionKobo = paid.reduce((total, order) => total + order.commissionKobo, BigInt(0));
  const pendingOrders = orders.filter((order) =>
    ["vendor_notified", "accepted", "preparing", "ready_for_pickup"].includes(order.status)
  );

  return {
    wallet: {
      availableKobo: (wallet?.availableKobo ?? BigInt(0)).toString(),
      heldKobo: (wallet?.heldKobo ?? BigInt(0)).toString()
    },
    vendor: {
      id: vendor.id,
      name: vendor.name,
      slug: vendor.slug,
      status: vendor.status,
      suspendedReason: vendor.suspendedReason,
      market: vendor.market,
      pickupAddress: vendor.pickupAddress,
      pickupPhone: vendor.pickupPhone,
      description: vendor.description,
      payoutBank: vendor.payoutBank,
      payoutAccountName: vendor.payoutAccountName,
      payoutAccountNumber: vendor.payoutAccountNumber,
      trustScore: vendor.trustScore,
      commissionBps: vendor.commissionBps
    },
    stats: {
      productCount: products.length,
      lowStockCount: lowStock,
      pendingOrderCount: pendingOrders.length,
      grossKobo: grossKobo.toString(),
      commissionKobo: commissionKobo.toString(),
      netKobo: (grossKobo - commissionKobo).toString(),
      openReturnCount: returns.filter((request) => ["REQUESTED", "APPROVED"].includes(request.status)).length
    },
    orders,
    products,
    returns,
    payouts
  };
}

export async function createSellerProduct(userId: string, input: {
  name: string;
  description: string;
  categoryId: string;
  priceKobo: bigint;
  compareAtKobo?: bigint | null;
  brand?: string | null;
  condition?: string;
  weightGrams?: number;
  imageUrl?: string;
  imageAlt?: string;
  images?: CatalogueImageInput[];
  quantity: number;
  lowStockLevel?: number;
  /** Explicit variant set; presence of the key is significant. */
  variants?: unknown;
  /** Validated against the category's CategoryAttribute rows inside the transaction. */
  attributes?: unknown;
  /**
   * New listings are always created as DRAFT. Publication belongs to the
   * Control Center moderation workflow (`publishProduct`), so an explicit
   * ACTIVE request is refused here rather than silently honoured.
   */
  status?: "DRAFT";
  /** Only an authenticated Control Center caller may write during PREVIEW. */
  previewAuthorized?: boolean;
}) {
  const vendor = await getVendorForUser(userId);
  if (vendor.status !== "VERIFIED") throw new ApiError(403, "seller_not_verified", "Only verified sellers can publish products.");
  if ((input.status as string | undefined) === "ACTIVE") {
    throw new ApiError(
      403,
      "admin_publication_required",
      "Only the Control Center can publish a listing. Save it as a draft and submit it for moderation."
    );
  }
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw new ApiError(400, "validation_error", 'status must be "DRAFT".');
  }
  // New Shop listings are a public-facing commitment: refuse them while the
  // vertical is DISABLED (and during PREVIEW unless the caller is authorized
  // staff). Existing listings, orders and payouts remain manageable.
  await assertShopAccess({
    countryCode: vendor.countryCode,
    previewAuthorized: input.previewAuthorized,
    statusCode: 409,
    message:
      "Shop is not accepting new listings in this market yet. Existing listings, orders and payouts remain manageable."
  });
  if (input.priceKobo <= BigInt(0)) throw new ApiError(400, "validation_error", "Price must be greater than zero.");
  if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new ApiError(400, "validation_error", "Stock must be a non-negative integer.");
  const variants = parseVariantsPayload(input.variants);
  if (variants && variants.some((variant) => variant.isActive) && input.quantity !== 0) {
    const error = new ApiError(
      400,
      "variant_stock_conflict",
      "A variant product uses variant stock. Set product-level quantity to 0 and enter stock on each variant.",
      { productName: input.name, quantity: input.quantity, activeVariantsRequested: variants.filter((variant) => variant.isActive).length }
    );
    await recordBlockedVariantTransition({
      actorId: userId,
      vendorId: vendor.id,
      productId: null,
      productName: input.name,
      source: "seller.create",
      error
    });
    throw error;
  }
  const images = normaliseSellerImages(input.images, input.imageUrl, input.imageAlt ?? input.name);

  const slugBase = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "product";
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const resolved = await resolveSellerProductCategory({
      db: tx,
      categoryId: input.categoryId,
      countryCode: vendor.countryCode,
      attributes: input.attributes
    });
    const product = await tx.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: resolved.category.id,
        name: input.name,
        slug,
        description: input.description,
        brand: input.brand ?? null,
        condition: input.condition || "NEW",
        priceKobo: input.priceKobo,
        compareAtKobo: input.compareAtKobo ?? null,
        weightGrams: input.weightGrams ?? 500,
        status: "DRAFT",
        attributes: resolved.attributes ? (resolved.attributes as Prisma.InputJsonValue) : undefined,
        images: {
          create: images.map((image, index) => ({ url: image.url, alt: image.alt, sortOrder: index }))
        },
        stock: {
          create: {
            quantity: variants && variants.some((variant) => variant.isActive) ? 0 : input.quantity,
            lowStockLevel: input.lowStockLevel ?? 3
          }
        }
      },
      include: { images: true, stock: true, variants: true }
    });
    const variantState =
      variants !== undefined
        ? await syncProductVariants({
            tx,
            productId: product.id,
            productCurrency: COUNTRIES[product.countryCode]?.currency ?? "NGN",
            variants
          })
        : null;
    await recordAudit({
      tx,
      actorId: userId,
      action: "product.created",
      entity: "Product",
      entityId: product.id,
      metadata: {
        name: product.name,
        vendorId: vendor.id,
        categoryId: product.categoryId,
        status: product.status,
        attributes: resolved.attributes ?? null,
        images: images.map((image, index) => ({ ...image, sortOrder: index, primary: index === 0 })),
        variants: variantState ? { before: variantState.before, after: variantState.after } : { before: [], after: [] },
        before: null,
        after: {
          status: product.status,
          categoryId: product.categoryId,
          attributes: resolved.attributes ?? null,
          images: images.map((image, index) => ({ ...image, sortOrder: index, primary: index === 0 })),
          ...(variantState ? { variants: variantState.after } : {})
        }
      }
    });
    return variants !== undefined
      ? tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: { images: true, stock: true, variants: true }
        })
      : product;
    });
  } catch (error) {
    await recordBlockedVariantTransition({
      actorId: userId,
      vendorId: vendor.id,
      productId: null,
      productName: input.name,
      source: "seller.create",
      error
    });
    throw error;
  }
}

export async function updateSellerProduct(userId: string, productId: string, input: {
  name?: string;
  description?: string;
  priceKobo?: bigint;
  /** Publication is refused here; the Control Center owns publish/reactivate. */
  status?: "DRAFT" | "ARCHIVED";
  quantity?: number;
  lowStockLevel?: number;
  categoryId?: string;
  attributes?: unknown;
  /** Explicit variant set; undefined leaves variants unchanged. */
  variants?: unknown;
  imageUrl?: string;
  imageAlt?: string;
  images?: CatalogueImageInput[];
  /** Only an authenticated Control Center caller may write during PREVIEW. */
  previewAuthorized?: boolean;
}) {
  const vendor = await getVendorForUser(userId);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      stock: true,
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }
    }
  });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  if (product.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This product belongs to another seller.");
  if ((input.status as string | undefined) === "ACTIVE") {
    throw new ApiError(
      403,
      "admin_publication_required",
      "Only the Control Center can publish or reactivate a listing."
    );
  }
  if (input.priceKobo !== undefined && input.priceKobo <= BigInt(0)) {
    throw new ApiError(400, "validation_error", "Price must be greater than zero.");
  }
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 0)) {
    throw new ApiError(400, "validation_error", "Stock must be a non-negative integer.");
  }
  const images =
    input.images !== undefined || input.imageUrl !== undefined || input.imageAlt !== undefined
      ? normaliseSellerImages(input.images, input.imageUrl, input.imageAlt)
      : null;
  const variants = parseVariantsPayload(input.variants);

  // Republishing is a taxonomy-sensitive action: the destination category must
  // still be live and publishable for the seller's country, and the stored (or
  // newly supplied) attributes must satisfy its definitions.
  const taxonomyTouched = input.categoryId !== undefined || input.attributes !== undefined;

  try {
    return await prisma.$transaction(async (tx) => {
      // Snapshot variants even when the payload omits them: an unchanged variant
      // state must be recorded as the real before/after rows, not null/[].
      const beforeVariants = await tx.productVariant.findMany({
        where: { productId: product.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      let categoryId: string | undefined;
      let attributesUpdate: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
      if (taxonomyTouched) {
        const resolved = await resolveSellerProductCategory({
          db: tx,
          categoryId: input.categoryId ?? product.categoryId,
          countryCode: vendor.countryCode,
          attributes: input.attributes !== undefined ? input.attributes : product.attributes
        });
        categoryId = resolved.category.id;
        if (input.attributes !== undefined) {
          attributesUpdate = resolved.attributes
            ? (resolved.attributes as Prisma.InputJsonValue)
            : Prisma.DbNull;
        }
      }

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.priceKobo !== undefined ? { priceKobo: input.priceKobo } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(attributesUpdate !== undefined ? { attributes: attributesUpdate } : {})
        }
      });
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: product.id } });
        await tx.productImage.createMany({
          data: images.map((image, index) => ({ productId: product.id, url: image.url, alt: image.alt, sortOrder: index }))
        });
      }
      const variantState =
        variants !== undefined
          ? await syncProductVariants({
              tx,
              productId: product.id,
              productCurrency: COUNTRIES[product.countryCode]?.currency ?? "NGN",
              variants,
              allowZeroProductStock: input.quantity === 0
            })
          : null;
      if (input.quantity !== undefined) {
        // One transaction-scoped guard: locks InventoryStock, re-checks that no
        // active variant owns the stock source, then refuses a quantity below
        // the units already reserved by open orders.
        await assertProductQuantityAllowed(tx, product.id, input.quantity);
        // `assertProductQuantityAllowed` creates and locks a zero row for a
        // legacy product that had none. Upsert (do not branch on the stale
        // pre-transaction read) so the lock-created row is updated instead of
        // colliding with a second create.
        await tx.inventoryStock.upsert({
          where: { productId: product.id },
          create: {
            productId: product.id,
            quantity: input.quantity,
            lowStockLevel: input.lowStockLevel ?? 3
          },
          update: {
            quantity: input.quantity,
            ...(input.lowStockLevel !== undefined ? { lowStockLevel: input.lowStockLevel } : {})
          }
        });
      }
      const freshImages = await tx.productImage.findMany({
        where: { productId: product.id },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { url: true, alt: true, sortOrder: true }
      });
      const freshProduct = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { images: true, stock: true, variants: true }
      });
      const afterVariants = await tx.productVariant.findMany({
        where: { productId: product.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });
      const variantAudit =
        variantState !== null
          ? { before: variantState.before, after: variantState.after, active: variantState.active }
          : {
              before: beforeVariants.map(variantSnapshot),
              after: afterVariants.map(variantSnapshot),
              active: afterVariants.filter((variant) => variant.isActive).length
            };
      const productBefore = {
        name: product.name,
        description: product.description,
        priceKobo: product.priceKobo.toString(),
        status: product.status,
        quantity: product.stock?.quantity ?? null,
        reserved: product.stock?.reserved ?? null,
        lowStockLevel: product.stock?.lowStockLevel ?? null,
        categoryId: product.categoryId,
        attributes: product.attributes ?? null,
        images: product.images.map((image, index) => ({
          url: image.url,
          alt: image.alt,
          sortOrder: image.sortOrder,
          primary: index === 0
        })),
        variants: variantAudit.before
      };
      const productAfter = {
        name: updated.name,
        description: updated.description,
        priceKobo: updated.priceKobo.toString(),
        status: updated.status,
        quantity: freshProduct.stock?.quantity ?? null,
        reserved: freshProduct.stock?.reserved ?? null,
        lowStockLevel: freshProduct.stock?.lowStockLevel ?? null,
        categoryId: updated.categoryId,
        attributes: updated.attributes ?? null,
        images: freshImages.map((image, index) => ({
          url: image.url,
          alt: image.alt,
          sortOrder: image.sortOrder,
          primary: index === 0
        })),
        variants: variantAudit.after
      };
      await recordAudit({
        tx,
        actorId: userId,
        action: "product.updated",
        entity: "Product",
        entityId: product.id,
        metadata: {
          vendorId: vendor.id,
          before: productBefore,
          after: productAfter,
          variants: { before: variantAudit.before, after: variantAudit.after, active: variantAudit.active },
          variantsSupplied: variants !== undefined
        }
      });
      return freshProduct;
    });
  } catch (error) {
    await recordBlockedVariantTransition({
      actorId: userId,
      vendorId: vendor.id,
      productId: product.id,
      productName: product.name,
      source: "seller.update",
      error
    });
    throw error;
  }
}

export async function listSellerOrders(userId: string) {
  const vendor = await getVendorForUser(userId);
  return prisma.order.findMany({
    where: { vendorId: vendor.id },
    include: {
      items: true,
      customer: { select: { name: true, phone: true, email: true } },
      deliveries: { include: { trackingEvents: true } },
      returnRequests: true
    },
    orderBy: { createdAt: "desc" }
  });
}

const sellerTransitions: Record<string, string[]> = {
  vendor_notified: ["accepted"],
  accepted: ["preparing"],
  preparing: ["ready_for_pickup"]
};

export async function advanceSellerOrder(userId: string, orderId: string, status: "accepted" | "preparing" | "ready_for_pickup", note?: string) {
  const vendor = await getVendorForUser(userId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This order belongs to another seller.");
  if (!sellerTransitions[order.status]?.includes(status)) {
    throw new ApiError(409, "invalid_transition", `Cannot move order from ${order.status} to ${status}.`);
  }
  if (order.paymentStatus !== "paid") throw new ApiError(409, "unpaid_order", "Orders can only be prepared after verified payment.");
  return prisma.$transaction((tx) =>
    updateOrderStatus({
      tx,
      actorId: userId,
      orderId,
      status: status as "accepted" | "preparing" | "ready_for_pickup",
      note: note || `Seller marked order ${status}.`
    })
  );
}

/**
 * Record an unsafe catalogue variant transition after its transaction rolled
 * back. The refusal stays a stable API error; this is durable evidence for the
 * Control Center that the requested quantity/variant change was rejected
 * because of reserved or live-cart state.
 */
async function recordBlockedVariantTransition(input: {
  actorId: string;
  vendorId: string;
  productId: string | null;
  productName?: string | null;
  source: "seller.create" | "seller.update";
  error: unknown;
}) {
  if (!(input.error instanceof ApiError)) return;
  const codes = ["variant_stock_conflict", "variant_in_use", "variant_stock_below_reserved", "stock_below_reserved", "variant_stock_managed", "product_in_live_cart"];
  if (!codes.includes(input.error.code)) return;
  try {
    await recordSystemEvent({
      type: "product.variant_transition_blocked",
      actorId: input.actorId,
      entity: "Product",
      entityId: input.productId,
      payload: {
        source: input.source,
        vendorId: input.vendorId,
        productId: input.productId,
        productName: input.productName ?? null,
        code: input.error.code,
        message: input.error.message,
        details: (input.error.details ?? null) as Prisma.InputJsonValue
      }
    });
  } catch {
    // Evidence must never mask the authoritative refusal.
  }
}

const RETURN_REFUND_INTENT = "return.refund_intent";

type ReturnRefundIntent = { attempt: number; idempotencyKey: string };

/**
 * Persisted refund intent for a return receipt.
 *
 * A return receipt moves stock and money in two different systems: inventory is
 * a database transaction, while a wallet/provider refund is not something a
 * surrounding Prisma transaction can cover. The old code restocked, committed
 * `RECEIVED`, and only then called `refundPayment`; a provider failure or a
 * process death left the return permanently un-refundable because a retry was
 * rejected as an invalid transition.
 *
 * The `SystemEvent` row is the durable intent. It is written in the same
 * transaction as the physical receipt and records the exact idempotency key
 * used for that attempt. A retry:
 *   - reuses a PENDING/COMPLETED attempt key (refundPayment resumes or returns
 *     the settled refund);
 *   - allocates a new attempt number only after the previous attempt is
 *     definitively FAILED and its reservation was released.
 */
async function loadLatestReturnIntent(db: Prisma.TransactionClient | typeof prisma, returnId: string) {
  const events = await db.systemEvent.findMany({
    where: { type: RETURN_REFUND_INTENT, entity: "ReturnRequest", entityId: returnId },
    select: { payload: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  let latest: ReturnRefundIntent | null = null;
  for (const event of events) {
    const payload = event.payload as Record<string, unknown> | null;
    const attempt = typeof payload?.attempt === "number" ? payload.attempt : null;
    const idempotencyKey = typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey : null;
    if (attempt === null || !idempotencyKey) continue;
    if (!latest || attempt > latest.attempt) latest = { attempt, idempotencyKey };
  }
  return latest;
}

async function recordReturnIntent(
  tx: Prisma.TransactionClient,
  input: { returnId: string; orderId: string; actorId: string; attempt: number; idempotencyKey: string; restocked: boolean }
) {
  await recordSystemEvent({
    tx,
    type: RETURN_REFUND_INTENT,
    actorId: input.actorId,
    entity: "ReturnRequest",
    entityId: input.returnId,
    payload: {
      orderId: input.orderId,
      attempt: input.attempt,
      idempotencyKey: input.idempotencyKey,
      restocked: input.restocked
    }
  });
}

/**
 * Legacy helper retained for the receipt path. The order-level marker in
 * `restockOrderItemsOnce` is what makes the restore exactly-once across a
 * seller receipt, a full refund and a retry.
 */
async function restockReturnedItems(
  tx: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  options: { recordOnly?: boolean } = {}
) {
  return restockOrderItemsOnce(tx, orderId, {
    actorId,
    source: "return",
    reason: "Seller received returned items",
    recordOnly: options.recordOnly
  });
}

/**
 * Finalise a physically received return once its refund has settled.
 *
 * Conditional on `status = RECEIVED`, so two concurrent retries cannot both
 * write a second refund amount. A return whose order was already fully refunded
 * elsewhere records `REFUNDED` with `refundKobo = 0` and an explicit system
 * event; no invented money is posted.
 */
async function finalizeReceivedReturn(input: {
  returnId: string;
  actorId: string;
  refundedKobo: bigint;
  refundId?: string;
  alreadyRefunded: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const hint = await tx.returnRequest.findUnique({ where: { id: input.returnId }, select: { orderId: true } });
    if (!hint) throw new ApiError(404, "return_not_found", "Return request not found.");
    await lockOrderRow(tx, hint.orderId);
    const current = await tx.returnRequest.findUniqueOrThrow({ where: { id: input.returnId } });
    if (current.status === "REFUNDED") return current;

    const updated = await tx.returnRequest.updateMany({
      where: { id: input.returnId, status: "RECEIVED" },
      data: {
        status: "REFUNDED",
        refundKobo: input.refundedKobo,
        resolvedAt: new Date()
      }
    });
    if (updated.count !== 1) {
      throw new ApiError(
        409,
        "return_conflict",
        "This return changed while its refund was settling. Reload it before retrying."
      );
    }
    await recordSystemEvent({
      tx,
      type: input.alreadyRefunded ? "return.refund_skipped_already_refunded" : "return.refunded",
      actorId: input.actorId,
      entity: "ReturnRequest",
      entityId: input.returnId,
      payload: {
        orderId: current.orderId,
        refundId: input.refundId ?? null,
        refundedKobo: input.refundedKobo.toString(),
        alreadyRefunded: input.alreadyRefunded
      }
    });
    await recordAudit({
      tx,
      actorId: input.actorId,
      action: input.alreadyRefunded ? "return.refund_skipped_already_refunded" : "return.refunded",
      entity: "ReturnRequest",
      entityId: input.returnId,
      metadata: {
        orderId: current.orderId,
        before: { status: current.status, refundKobo: current.refundKobo.toString() },
        after: { status: "REFUNDED", refundKobo: input.refundedKobo.toString() },
        refundId: input.refundId ?? null,
        alreadyRefunded: input.alreadyRefunded
      }
    });
    return tx.returnRequest.findUniqueOrThrow({ where: { id: input.returnId } });
  });
}

export async function resolveReturn(userId: string, returnId: string, action: "approve" | "reject" | "receive") {
  const vendor = await getVendorForUser(userId);
  const hint = await prisma.returnRequest.findUnique({ where: { id: returnId }, select: { orderId: true } });
  if (!hint) throw new ApiError(404, "return_not_found", "Return request not found.");

  if (action === "approve" || action === "reject") {
    return prisma.$transaction(async (tx) => {
      await lockOrderRow(tx, hint.orderId);
      const request = await tx.returnRequest.findUnique({ where: { id: returnId } });
      if (!request) throw new ApiError(404, "return_not_found", "Return request not found.");
      if (request.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This return belongs to another seller.");
      if (request.status !== "REQUESTED") {
        throw new ApiError(
          409,
          "invalid_transition",
          action === "approve" ? "Only requested returns can be approved." : "Only requested returns can be rejected."
        );
      }
      const status = action === "approve" ? "APPROVED" : "REJECTED";
      const claimed = await tx.returnRequest.updateMany({
        where: { id: request.id, status: "REQUESTED" },
        data: { status, resolvedAt: new Date() }
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "invalid_transition", "This return changed before it could be resolved.");
      }
      await recordAudit({
        tx,
        actorId: userId,
        action: action === "approve" ? "return.approved" : "return.rejected",
        entity: "ReturnRequest",
        entityId: request.id,
        metadata: { orderId: request.orderId, before: { status: request.status }, after: { status } }
      });
      return tx.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
    });
  }

  // 1. Physical receipt and the durable refund intent commit together.
  const receipt = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, hint.orderId);
    const request = await tx.returnRequest.findUnique({
      where: { id: returnId },
      include: { order: { include: { items: true, payments: true } } }
    });
    if (!request) throw new ApiError(404, "return_not_found", "Return request not found.");
    if (request.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This return belongs to another seller.");
    if (request.status === "REFUNDED") {
      return { alreadyFinal: true as const, request, idempotencyKey: null, attempt: 0, refundCompleted: true };
    }
    if (!["REQUESTED", "APPROVED", "RECEIVED"].includes(request.status)) {
      throw new ApiError(409, "invalid_transition", "Only approved returns can be received.");
    }

    let restockedNow = false;
    let restockOutcome: Awaited<ReturnType<typeof restockReturnedItems>> | null = null;
    if (!request.restocked) {
      const claimed = await tx.returnRequest.updateMany({
        // RECEIVED with restocked=false is a legacy/interrupted receipt: the
        // physical units still need restoring exactly once.
        where: { id: request.id, status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] }, restocked: false },
        data: { status: "RECEIVED", restocked: true, resolvedAt: new Date() }
      });
      if (claimed.count === 1) {
        // The physical units are back with the seller. The order-level marker
        // inside restockOrderItemsOnce makes this restore exactly-once even if
        // the order was already fully refunded with a restock request.
        restockOutcome = await restockReturnedItems(tx, request.orderId, userId);
        restockedNow = restockOutcome.restored;
        await recordAudit({
          tx,
          actorId: userId,
          action: "return.received",
          entity: "ReturnRequest",
          entityId: request.id,
          metadata: {
            orderId: request.orderId,
            restocked: true,
            stockRestored: restockOutcome.restored,
            alreadyRestocked: restockOutcome.alreadyRestocked,
            suppressedItems: restockOutcome.suppressedItems,
            before: { status: request.status },
            after: { status: "RECEIVED" }
          }
        });
      }
    }

    // Re-read after the conditional claim so concurrent receivers agree on the
    // stored status and restock flag.
    const fresh = await tx.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (!restockedNow) {
      // Two cases reach this point: a retry whose marker already exists (no-op),
      // or a legacy receipt that stored `restocked=true` before the order-level
      // marker existed. Writing the marker without touching stock stops a later
      // refund from restoring the same units a second time.
      restockOutcome = await restockReturnedItems(tx, request.orderId, userId, { recordOnly: true });
    }

    const latest = await loadLatestReturnIntent(tx, request.id);
    let intent: ReturnRefundIntent;
    if (!latest) {
      intent = { attempt: 1, idempotencyKey: `return:${request.id}:1` };
      await recordReturnIntent(tx, {
        returnId: request.id,
        orderId: request.orderId,
        actorId: userId,
        attempt: intent.attempt,
        idempotencyKey: intent.idempotencyKey,
        restocked: fresh.restocked
      });
    } else {
      const prior = await tx.refund.findUnique({ where: { idempotencyKey: latest.idempotencyKey }, select: { status: true } });
      if (prior?.status === "FAILED") {
        intent = { attempt: latest.attempt + 1, idempotencyKey: `return:${request.id}:${latest.attempt + 1}` };
        await recordReturnIntent(tx, {
          returnId: request.id,
          orderId: request.orderId,
          actorId: userId,
          attempt: intent.attempt,
          idempotencyKey: intent.idempotencyKey,
          restocked: fresh.restocked
        });
      } else {
        intent = latest;
      }
    }

    const priorRefund = await tx.refund.findUnique({
      where: { idempotencyKey: intent.idempotencyKey },
      select: { id: true, status: true, amountKobo: true }
    });
    return {
      alreadyFinal: false as const,
      request: fresh,
      idempotencyKey: intent.idempotencyKey,
      attempt: intent.attempt,
      refundCompleted: priorRefund?.status === "COMPLETED",
      priorRefundId: priorRefund?.id ?? null,
      priorRefundKobo: priorRefund?.amountKobo ?? BigInt(0),
      restockedNow
    };
  });

  if (receipt.alreadyFinal) return receipt.request;

  const order = await prisma.order.findUniqueOrThrow({ where: { id: receipt.request.orderId } });
  const reason = `Return received: ${receipt.request.reason}`;

  // A crash after the provider confirmed but before the local settlement is
  // recovered by the same key: refundPayment treats a COMPLETED row as
  // idempotent. No provider call is made in that case.
  if (!receipt.refundCompleted) {
    const state = await loadOrderRefundState(prisma, order.id);
    try {
      // Reuse the shared fail-closed guard instead of refunding around a
      // pending/uncertain claim.
      assertNoBlockingRefundObligation(state);
    } catch (error) {
      await prisma.systemEvent
        .create({
          data: {
            type: "return.refund_blocked",
            actorId: userId,
            entity: "ReturnRequest",
            entityId: receipt.request.id,
            payload: {
              orderId: order.id,
              reason: error instanceof ApiError ? error.code : "refund_state_conflict",
              pendingClaimKobo: state.pendingClaimKobo.toString(),
              uncertainProviderClaimKobo: state.uncertainProviderClaimKobo.toString()
            }
          }
        })
        .catch(() => undefined);
      throw error;
    }

    const remainingKobo = order.totalKobo - state.claimedKobo;
    if (remainingKobo <= BigInt(0)) {
      if (order.paymentStatus === "refunded" || state.settledKobo >= order.totalKobo) {
        return finalizeReceivedReturn({
          returnId: receipt.request.id,
          actorId: userId,
          refundedKobo: BigInt(0),
          alreadyRefunded: true
        });
      }
      throw new ApiError(
        409,
        "refund_reservation_unreconciled",
        "The order has no refundable balance but is not fully refunded. Reconcile it before finalising the return."
      );
    }

    try {
      const refund = await refundPayment({
        orderId: order.id,
        actorId: userId,
        reason,
        amountKobo: remainingKobo,
        restock: false,
        idempotencyKey: receipt.idempotencyKey
      });
      return finalizeReceivedReturn({
        returnId: receipt.request.id,
        actorId: userId,
        refundedKobo: BigInt(refund.refundedKobo),
        refundId: refund.refundId,
        alreadyRefunded: false
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "already_refunded") {
        const fresh = await prisma.order.findUnique({
          where: { id: order.id },
          select: { paymentStatus: true, status: true }
        });
        if (fresh?.paymentStatus === "refunded" || fresh?.status === "refunded") {
          return finalizeReceivedReturn({
            returnId: receipt.request.id,
            actorId: userId,
            refundedKobo: BigInt(0),
            alreadyRefunded: true
          });
        }
      }
      // The intent and the receipt stay committed. A retry of `receive` reuses
      // the PENDING attempt or allocates the next attempt after a definitive
      // failure; it never restocks again.
      await prisma.systemEvent
        .create({
          data: {
            type: "return.refund_attempt_failed",
            actorId: userId,
            entity: "ReturnRequest",
            entityId: receipt.request.id,
            payload: {
              orderId: order.id,
              idempotencyKey: receipt.idempotencyKey,
              attempt: receipt.attempt,
              code: error instanceof ApiError ? error.code : "unknown_error"
            }
          }
        })
        .catch(() => undefined);
      throw error;
    }
  }

  return finalizeReceivedReturn({
    returnId: receipt.request.id,
    actorId: userId,
    refundedKobo: receipt.priorRefundKobo,
    refundId: receipt.priorRefundId ?? undefined,
    alreadyRefunded: false
  });
}


const PROFILE_FIELDS = {
  name: 120,
  description: 1000,
  pickupAddress: 200,
  pickupPhone: 40,
  payoutBank: 80,
  payoutAccountName: 120,
  payoutAccountNumber: 40
} as const;

/** Seller-editable profile. Payout changes are audited with the account number masked. */
export async function updateSellerProfile(input: {
  userId: string;
  actorId: string;
  patch: Record<string, unknown>;
}) {
  const vendor = await getVendorForUser(input.userId);
  const data: Record<string, string | null> = {};

  for (const [field, max] of Object.entries(PROFILE_FIELDS)) {
    if (!(field in input.patch)) continue;
    const raw = input.patch[field];
    if (raw === null) {
      data[field] = field === "name" || field === "pickupAddress" || field === "pickupPhone" ? vendor[field] : null;
      continue;
    }
    const value = String(raw).trim();
    if (field === "name" && value.length < 2) throw new ApiError(400, "validation_error", "Business name is too short.");
    if (field !== "description" && field.startsWith("payout") && value.length === 0) {
      data[field] = null;
      continue;
    }
    if (value.length > max) throw new ApiError(400, "validation_error", `${field} must be at most ${max} characters.`);
    data[field] = value;
  }
  if (Object.keys(data).length === 0) return vendor;

  const before = {
    name: vendor.name,
    description: vendor.description,
    pickupAddress: vendor.pickupAddress,
    pickupPhone: vendor.pickupPhone,
    payoutBank: vendor.payoutBank,
    payoutAccountName: vendor.payoutAccountName,
    payoutAccountNumber: maskAccount(vendor.payoutAccountNumber)
  };
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data });
  await recordAudit({
    actorId: input.actorId,
    action: "vendor.profile_updated",
    entity: "Vendor",
    entityId: vendor.id,
    metadata: {
      before,
      after: {
        name: updated.name,
        description: updated.description,
        pickupAddress: updated.pickupAddress,
        pickupPhone: updated.pickupPhone,
        payoutBank: updated.payoutBank,
        payoutAccountName: updated.payoutAccountName,
        payoutAccountNumber: maskAccount(updated.payoutAccountNumber)
      }
    }
  });
  return updated;
}

function maskAccount(value: string | null) {
  if (!value) return null;
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}
