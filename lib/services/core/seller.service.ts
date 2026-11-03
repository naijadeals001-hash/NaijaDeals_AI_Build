import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { updateOrderStatus } from "./order.service";
import { refundPayment } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";

export async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findFirst({ where: { ownerId: userId } });
  if (!vendor) throw new ApiError(403, "not_a_seller", "No seller profile is linked to this account.");
  return vendor;
}

export async function getSellerOverview(userId: string) {
  const vendor = await getVendorForUser(userId);
  const [orders, products, lowStock, returns, payouts, wallet] = await Promise.all([
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
    prisma.inventoryStock.count({ where: { product: { vendorId: vendor.id }, quantity: { lte: 3 } } }),
    prisma.returnRequest.findMany({
      where: { vendorId: vendor.id },
      include: { order: { select: { orderNumber: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } }),
    prisma.wallet.findFirst({ where: { vendorId: vendor.id, ownerType: "VENDOR" } })
  ]);

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
  imageUrl: string;
  quantity: number;
  lowStockLevel?: number;
  variants?: Array<{ name: string; sku: string; priceKobo: bigint; stock: number }>;
}) {
  const vendor = await getVendorForUser(userId);
  if (vendor.status !== "VERIFIED") throw new ApiError(403, "seller_not_verified", "Only verified sellers can publish products.");
  if (input.priceKobo <= BigInt(0)) throw new ApiError(400, "validation_error", "Price must be greater than zero.");
  if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new ApiError(400, "validation_error", "Stock must be a non-negative integer.");
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new ApiError(400, "invalid_category", "Choose a valid category.");
  if (!/^(https:\/\/|\/)/.test(input.imageUrl)) throw new ApiError(400, "invalid_image", "Image must be an https URL or a local /path.");

  const slugBase = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "product";
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: input.name,
        slug,
        description: input.description,
        brand: input.brand ?? null,
        condition: input.condition || "NEW",
        priceKobo: input.priceKobo,
        compareAtKobo: input.compareAtKobo ?? null,
        weightGrams: input.weightGrams ?? 500,
        status: "ACTIVE",
        images: { create: [{ url: input.imageUrl, alt: input.name, sortOrder: 0 }] },
        stock: { create: { quantity: input.quantity, lowStockLevel: input.lowStockLevel ?? 3 } },
        variants: input.variants?.length
          ? {
              create: input.variants.map((variant) => ({
                name: variant.name,
                sku: variant.sku,
                priceKobo: variant.priceKobo,
                stock: variant.stock
              }))
            }
          : undefined
      },
      include: { images: true, stock: true, variants: true }
    });
    await recordAudit({
      tx,
      actorId: userId,
      action: "product.created",
      entity: "Product",
      entityId: product.id,
      metadata: { name: product.name, vendorId: vendor.id }
    });
    return product;
  });
}

export async function updateSellerProduct(userId: string, productId: string, input: {
  name?: string;
  description?: string;
  priceKobo?: bigint;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  quantity?: number;
  lowStockLevel?: number;
}) {
  const vendor = await getVendorForUser(userId);
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { stock: true } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  if (product.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This product belongs to another seller.");
  if (input.priceKobo !== undefined && input.priceKobo <= BigInt(0)) {
    throw new ApiError(400, "validation_error", "Price must be greater than zero.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: product.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.priceKobo !== undefined ? { priceKobo: input.priceKobo } : {}),
        ...(input.status ? { status: input.status } : {})
      }
    });
    if (input.quantity !== undefined) {
      if (!Number.isInteger(input.quantity) || input.quantity < 0) {
        throw new ApiError(400, "validation_error", "Stock must be a non-negative integer.");
      }
      if (product.stock) {
        await tx.inventoryStock.update({
          where: { productId: product.id },
          data: { quantity: input.quantity, ...(input.lowStockLevel !== undefined ? { lowStockLevel: input.lowStockLevel } : {}) }
        });
      } else {
        await tx.inventoryStock.create({
          data: { productId: product.id, quantity: input.quantity, lowStockLevel: input.lowStockLevel ?? 3 }
        });
      }
    }
    await recordAudit({
      tx,
      actorId: userId,
      action: "product.updated",
      entity: "Product",
      entityId: product.id,
      metadata: { vendorId: vendor.id }
    });
    return updated;
  });
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

export async function resolveReturn(userId: string, returnId: string, action: "approve" | "reject" | "receive") {
  const vendor = await getVendorForUser(userId);
  const request = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { include: { items: true, payments: true } } }
  });
  if (!request) throw new ApiError(404, "return_not_found", "Return request not found.");
  if (request.vendorId !== vendor.id) throw new ApiError(403, "forbidden", "This return belongs to another seller.");

  if (action === "approve") {
    if (request.status !== "REQUESTED") throw new ApiError(409, "invalid_transition", "Only requested returns can be approved.");
    return prisma.returnRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", resolvedAt: new Date() }
    });
  }
  if (action === "reject") {
    if (request.status !== "REQUESTED") throw new ApiError(409, "invalid_transition", "Only requested returns can be rejected.");
    return prisma.returnRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", resolvedAt: new Date() }
    });
  }

  if (request.status !== "APPROVED" && request.status !== "REQUESTED") {
    throw new ApiError(409, "invalid_transition", "Only approved returns can be received.");
  }

  // Restock returned units, then refund the verified payment.
  await prisma.$transaction(async (tx) => {
    for (const item of request.order.items) {
      if (item.variantId) {
        await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      } else {
        await tx.inventoryStock.update({
          where: { productId: item.productId },
          data: { quantity: { increment: item.quantity } }
        });
      }
    }
    await tx.returnRequest.update({
      where: { id: request.id },
      data: { status: "RECEIVED", restocked: true, resolvedAt: new Date() }
    });
  });

  const refund = await refundPayment({
    orderId: request.orderId,
    actorId: userId,
    reason: `Return received: ${request.reason}`,
    restock: false
  });

  return prisma.returnRequest.update({
    where: { id: request.id },
    data: { status: "REFUNDED", refundKobo: BigInt(refund.refundedKobo) }
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
