import { prisma } from "@/lib/prisma";
import { ApiError } from "./api-error";
import { regionViolation, scopeOf, type RegionTarget } from "./permissions";
import type { SessionUser } from "./session";

/**
 * Server-side region scope enforcement.
 *
 * Every helper here reads the record from PostgreSQL before the caller acts on
 * it, so a request cannot bypass the scope by guessing an identifier. A missing
 * record still returns 404 and does not reveal whether it exists elsewhere.
 */
export function assertRegion(user: SessionUser, target: RegionTarget, label = "record") {
  const reason = regionViolation(user, target);
  if (reason) {
    throw new ApiError(403, "region_forbidden", `Outside your administrative scope. ${reason}`, { scope: scopeOf(user) });
  }
  void label;
}

/** Filters for list queries; an empty object means platform-wide access. */
export function countryScopeWhere(user: SessionUser): { countryCode?: string } {
  const { countryCode } = scopeOf(user);
  return countryCode ? { countryCode } : {};
}

/** Vendor filters include the city when the staff member is city-scoped. */
export function vendorScopeWhere(user: SessionUser): { countryCode?: string; market?: string } {
  const { countryCode, cityCode } = scopeOf(user);
  if (!countryCode) return {};
  return cityCode ? { countryCode, market: cityCode } : { countryCode };
}

export async function assertOrderRegion(user: SessionUser, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { countryCode: true } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  assertRegion(user, { countryCode: order.countryCode });
  return order;
}

export async function assertDeliveryRegion(user: SessionUser, deliveryId: string) {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { countryCode: true } });
  if (!delivery) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
  assertRegion(user, { countryCode: delivery.countryCode });
  return delivery;
}

export async function assertProductRegion(user: SessionUser, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { countryCode: true } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(user, { countryCode: product.countryCode });
  return product;
}

export async function assertApplicationRegion(user: SessionUser, applicationId: string) {
  const application = await prisma.sellerApplication.findUnique({
    where: { id: applicationId },
    select: { countryCode: true, market: true }
  });
  if (!application) throw new ApiError(404, "application_not_found", "Seller application not found.");
  assertRegion(user, { countryCode: application.countryCode, city: application.market });
  return application;
}

export async function assertPayoutRegion(user: SessionUser, payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, vendor: { select: { countryCode: true, market: true } } }
  });
  if (!payout) throw new ApiError(404, "payout_not_found", "Payout not found.");
  assertRegion(user, { countryCode: payout.vendor.countryCode, city: payout.vendor.market });
  return payout;
}

export async function assertVendorRegion(user: SessionUser, vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { countryCode: true, market: true }
  });
  if (!vendor) throw new ApiError(404, "vendor_not_found", "Vendor not found.");
  assertRegion(user, { countryCode: vendor.countryCode, city: vendor.market });
  return vendor;
}
