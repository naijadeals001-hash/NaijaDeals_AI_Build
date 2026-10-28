import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

export async function listAddresses(userId: string) {
  return prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
}

export async function createAddress(userId: string, input: {
  label?: string;
  countryCode: string;
  state: string;
  city: string;
  line1: string;
  line2?: string | null;
  phone: string;
  postalCode?: string | null;
  isDefault?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const count = await tx.address.count({ where: { userId } });
    return tx.address.create({
      data: {
        userId,
        label: input.label || "Home",
        countryCode: input.countryCode,
        state: input.state,
        city: input.city,
        line1: input.line1,
        line2: input.line2 ?? null,
        phone: input.phone,
        postalCode: input.postalCode ?? null,
        isDefault: input.isDefault || count === 0
      }
    });
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const deleted = await prisma.address.deleteMany({ where: { id: addressId, userId } });
  if (deleted.count === 0) throw new ApiError(404, "address_not_found", "Address not found.");
  return { deleted: true };
}

export async function listSavedItems(userId: string) {
  return prisma.savedItem.findMany({
    where: { userId },
    include: {
      product: {
        include: { images: true, vendor: true, stock: true, category: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function toggleSavedItem(userId: string, productId: string) {
  const existing = await prisma.savedItem.findUnique({ where: { userId_productId: { userId, productId } } });
  if (existing) {
    await prisma.savedItem.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  await prisma.savedItem.create({ data: { userId, productId } });
  return { saved: true };
}

export async function listReviews(productId: string) {
  return prisma.review.findMany({
    where: { productId, status: "APPROVED" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" }
  });
}

export async function createReview(userId: string, input: {
  orderId: string;
  productId: string;
  rating: number;
  title: string;
  body: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { items: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== userId) throw new ApiError(403, "forbidden", "You can only review your own orders.");
  if (!["delivered", "completed"].includes(order.status)) {
    throw new ApiError(409, "not_delivered", "Reviews open after delivery.");
  }
  if (!order.items.some((item) => item.productId === input.productId)) {
    throw new ApiError(400, "not_in_order", "This product is not part of that order.");
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ApiError(400, "validation_error", "Rating must be an integer from 1 to 5.");
  }
  const existing = await prisma.review.findUnique({
    where: { orderId_productId: { orderId: input.orderId, productId: input.productId } }
  });
  if (existing) throw new ApiError(409, "review_exists", "You already reviewed this product for this order.");
  return prisma.review.create({
    data: {
      productId: input.productId,
      userId,
      orderId: input.orderId,
      rating: input.rating,
      title: input.title,
      body: input.body,
      status: "PENDING"
    }
  });
}

export async function submitSellerApplication(userId: string, input: {
  businessName: string;
  market: string;
  countryCode: string;
  pickupAddress: string;
  phone: string;
  category: string;
}) {
  const existing = await prisma.sellerApplication.findUnique({ where: { userId } });
  if (existing && existing.status !== "REJECTED") {
    throw new ApiError(409, "application_exists", "You already have a seller application under review.");
  }
  if (existing) {
    return prisma.sellerApplication.update({
      where: { userId },
      data: { ...input, status: "SUBMITTED", note: null, reviewedAt: null }
    });
  }
  return prisma.sellerApplication.create({ data: { userId, ...input } });
}

export async function getSellerApplication(userId: string) {
  return prisma.sellerApplication.findUnique({ where: { userId } });
}

export async function getAccountSummary(userId: string) {
  const [user, addresses, savedCount, orders, application] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } }, vendors: true } }),
    prisma.address.count({ where: { userId } }),
    prisma.savedItem.count({ where: { userId } }),
    prisma.order.count({ where: { customerId: userId } }),
    prisma.sellerApplication.findUnique({ where: { userId } })
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    actorType: user.actorType,
    roles: user.roles.map((entry) => entry.role.name),
    vendors: user.vendors.map((vendor) => ({ id: vendor.id, name: vendor.name, status: vendor.status })),
    addressCount: addresses,
    savedCount,
    orderCount: orders,
    sellerApplication: application
  };
}
