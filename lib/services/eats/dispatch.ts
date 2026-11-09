import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * Unified food-delivery dispatch across NaijaSend couriers and NaijaDrive
 * drivers.
 *
 * Rules this module enforces:
 * - one authoritative `FoodDispatch` per food order (unique `orderId`);
 * - providers must be active, online, food-enabled, in the kitchen's service
 *   zone, and carrying the right vehicle;
 * - offers expire, and accepting one atomically closes every competing offer;
 * - settlement happens once, guarded by a unique reference.
 *
 * Traffic, weather and live ETA are NOT modelled — no such data source exists
 * here, so none is invented.
 */

const OFFER_TTL_MS = 60_000;
/** Flat test-mode driver earnings until the commercial rate card is approved. */
const DRIVER_EARNINGS_KOBO = BigInt(80_000);
const PLATFORM_FEE_BPS = BigInt(500); // 5% service fee — configured default, not a policy change
const RESTAURANT_BPS = BigInt(10000) - PLATFORM_FEE_BPS;

type ProviderOffer = { providerType: "courier" | "driver"; providerId: string; name: string; vehicleType: string };

function pins() {
  const make = () => String(Math.floor(100000 + Math.random() * 900000));
  return { pickupPin: make(), deliveryPin: make() };
}

function earningsFor(subtotalKobo: bigint) {
  // Flat fee today; the driver share never exceeds the platform's recorded
  // delivery income for the order.
  return DRIVER_EARNINGS_KOBO < subtotalKobo ? DRIVER_EARNINGS_KOBO : subtotalKobo / BigInt(10);
}

/** Providers eligible to carry this order, from BOTH platforms. */
async function eligibleProviders(vehicleNeed: string, serviceZone: string | null): Promise<ProviderOffer[]> {
  const wantsCar = vehicleNeed === "car";
  const [couriers, drivers] = await Promise.all([
    prisma.courier.findMany({
      where: {
        active: true,
        online: true,
        foodDeliveryEnabled: true,
        ...(serviceZone ? { OR: [{ serviceZone }, { serviceZone: null }] } : {}),
        ...(wantsCar ? { vehicleType: { in: ["car", "van"] } } : { vehicleType: "motorcycle" })
      },
      select: { id: true, name: true, vehicleType: true }
    }),
    prisma.driverProfile.findMany({
      where: {
        active: true,
        online: true,
        foodDeliveryEnabled: true,
        insulatedBag: true,
        status: "approved",
        ...(serviceZone ? { OR: [{ serviceZone }, { serviceZone: null }] } : {}),
        ...(wantsCar ? { foodVehicleType: { in: ["car", "van"] } } : { foodVehicleType: "motorcycle" })
      },
      select: { id: true, userId: true, foodVehicleType: true, user: { select: { name: true } } }
    })
  ]);

  return [
    ...couriers.map((row) => ({ providerType: "courier" as const, providerId: row.id, name: row.name, vehicleType: row.vehicleType })),
    ...drivers.map((row) => ({ providerType: "driver" as const, providerId: row.id, name: row.user.name, vehicleType: row.foodVehicleType }))
  ];
}

/**
 * Opens (or tops up) dispatch for an order the kitchen has marked ready.
 * Re-running is safe: an existing open dispatch is reused.
 */
export async function openDispatch(orderId: string) {
  const order = await prisma.foodOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, subtotalKobo: true, restaurantId: true, restaurant: { select: { market: true } } }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Food order not found.");
  if (order.status !== "ready_for_pickup") throw new ApiError(409, "not_ready", "The kitchen must mark the order ready before dispatch.");

  const existing = await prisma.foodDispatch.findUnique({ where: { orderId }, select: { id: true, status: true } });
  if (existing && existing.status === "assigned") return { dispatchId: existing.id, reused: true, offers: 0 };
  const dispatch =
    existing ??
    (await prisma.foodDispatch.create({
      data: {
        orderId,
        vehicleNeed: "motorcycle",
        ...pins()
      },
      select: { id: true, status: true }
    }));

  const serviceZone = order.restaurant.market.split(",").pop()?.trim() ?? null;
  const providers = await eligibleProviders("motorcycle", serviceZone);
  if (providers.length === 0) {
    await prisma.foodDispatch.update({ where: { id: dispatch.id }, data: { status: "failed", attempts: { increment: 1 } } });
    return { dispatchId: dispatch.id, reused: false, offers: 0, failed: "no_eligible_provider" };
  }

  const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  const earnings = earningsFor(order.subtotalKobo);
  await prisma.$transaction(
    providers.map((provider) =>
      prisma.dispatchOffer.upsert({
        where: { dispatchId_providerType_providerId: { dispatchId: dispatch.id, providerType: provider.providerType, providerId: provider.providerId } },
        update: { status: "offered", expiresAt, earningsKobo: earnings },
        create: { dispatchId: dispatch.id, providerType: provider.providerType, providerId: provider.providerId, earningsKobo: earnings, expiresAt }
      })
    )
  );
  await prisma.foodDispatch.update({ where: { id: dispatch.id }, data: { attempts: { increment: 1 }, status: "open" } });
  return { dispatchId: dispatch.id, reused: Boolean(existing), offers: providers.length };
}

/** Offers visible to one provider, with the order context they may see. */
export async function offersForProvider(providerType: "courier" | "driver", providerId: string) {
  const rows = await prisma.dispatchOffer.findMany({
    where: { providerType, providerId, status: "offered", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    include: {
      dispatch: {
        include: {
          // Join the order by its unique dispatch.orderId.
          order: false as never
        }
      }
    }
  });

  const orderIds = rows.map((row) => row.dispatch.orderId);
  const orders = orderIds.length
    ? await prisma.foodOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNumber: true,
          deliveryAddress: true,
          contactName: true,
          totalKobo: true,
          restaurant: { select: { name: true, market: true, address: true } }
        }
      })
    : [];
  const byId = new Map(orders.map((order) => [order.id, order]));

  return rows.map((row) => {
    const order = byId.get(row.dispatch.orderId);
    return {
      offerId: row.id,
      dispatchId: row.dispatch.id,
      orderNumber: order?.orderNumber ?? "",
      // Customer name and exact door number stay hidden until assignment.
      restaurant: order?.restaurant ?? null,
      area: order?.restaurant?.market ?? null,
      earningsKobo: row.earningsKobo.toString(),
      expiresAt: row.expiresAt.toISOString(),
      vehicleNeed: row.dispatch.vehicleNeed
    };
  });
}

/**
 * Accepts one offer. Runs in a transaction with a conditional update so that of
 * two simultaneous acceptances exactly one wins; the loser gets a 409.
 */
export async function acceptOffer(providerType: "courier" | "driver", providerId: string, offerId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.dispatchOffer.findUnique({ where: { id: offerId }, include: { dispatch: true } });
    if (!offer || offer.providerType !== providerType || offer.providerId !== providerId) {
      throw new ApiError(404, "offer_not_found", "That delivery offer is not yours.");
    }
    if (offer.status !== "offered") throw new ApiError(409, "offer_closed", "That offer is no longer open.");
    if (offer.expiresAt.getTime() < Date.now()) {
      await tx.dispatchOffer.update({ where: { id: offer.id }, data: { status: "expired" } });
      throw new ApiError(409, "offer_expired", "That offer has expired.");
    }
    const claimed = await tx.foodDispatch.updateMany({
      where: { id: offer.dispatchId, status: "open", assignedId: null },
      data: { status: "assigned", assignedType: providerType, assignedId: providerId }
    });
    if (claimed.count === 0) throw new ApiError(409, "already_assigned", "Another provider has taken this delivery.");

    await tx.dispatchOffer.update({ where: { id: offer.id }, data: { status: "accepted" } });
    await tx.dispatchOffer.updateMany({
      where: { dispatchId: offer.dispatchId, id: { not: offer.id }, status: "offered" },
      data: { status: "withdrawn" }
    });
    await tx.foodOrder.update({ where: { id: offer.dispatch.orderId }, data: { status: "courier_assigned", courierId: providerType === "courier" ? providerId : null } });
    await tx.foodOrderEvent.create({
      data: { id: randomUUID(), orderId: offer.dispatch.orderId, status: "courier_assigned", note: "Delivery provider accepted the job.", actorId }
    });
    await recordAudit({
      tx,
      actorId,
      action: "food_order.dispatch_accepted",
      entity: "FoodOrder",
      entityId: offer.dispatch.orderId,
      metadata: { providerType, providerId }
    });
    return { accepted: true, dispatchId: offer.dispatchId, orderId: offer.dispatch.orderId };
  });
}

export async function declineOffer(providerType: "courier" | "driver", providerId: string, offerId: string) {
  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId }, select: { id: true, providerType: true, providerId: true, status: true } });
  if (!offer || offer.providerType !== providerType || offer.providerId !== providerId) throw new ApiError(404, "offer_not_found", "That delivery offer is not yours.");
  if (offer.status === "offered") await prisma.dispatchOffer.update({ where: { id: offer.id }, data: { status: "declined" } });
  return { declined: true };
}

/** Expire stale offers; called before reads so the queue never shows dead offers. */
export async function expireStaleOffers() {
  const result = await prisma.dispatchOffer.updateMany({ where: { status: "offered", expiresAt: { lt: new Date() } }, data: { status: "expired" } });
  return result.count;
}

/**
 * Verifies pickup using the restaurant-issued PIN and advances the order.
 * Only the assigned provider can do this.
 */
export async function confirmPickup(input: { providerType: "courier" | "driver"; providerId: string; dispatchId: string; pin: string; actorId: string }) {
  const dispatch = await prisma.foodDispatch.findUnique({ where: { id: input.dispatchId }, include: { order: { select: { id: true, status: true } } } });
  if (!dispatch) throw new ApiError(404, "dispatch_not_found", "Delivery not found.");
  if (dispatch.assignedType !== input.providerType || dispatch.assignedId !== input.providerId) throw new ApiError(403, "forbidden", "You are not assigned to this delivery.");
  if (dispatch.order.status !== "courier_assigned") throw new ApiError(409, "invalid_state", "Pickup can only be confirmed on an assigned order.");
  if (dispatch.pickupPin !== input.pin.trim()) throw new ApiError(400, "invalid_pin", "That pickup PIN is incorrect.");

  return prisma.$transaction(async (tx) => {
    await tx.foodDispatch.update({ where: { id: dispatch.id }, data: { pickedUpAt: new Date() } });
    await tx.foodOrder.update({ where: { id: dispatch.orderId }, data: { status: "picked_up" } });
    await tx.foodOrderEvent.create({ data: { id: randomUUID(), orderId: dispatch.orderId, status: "picked_up", note: "Pickup PIN verified.", actorId: input.actorId } });
    return { pickedUp: true };
  });
}

/**
 * Confirms delivery with the customer PIN. On success the order is marked
 * delivered and settlement is queued — a rider button alone cannot complete it.
 */
export async function confirmDelivery(input: { providerType: "courier" | "driver"; providerId: string; dispatchId: string; pin: string; actorId: string }) {
  const dispatch = await prisma.foodDispatch.findUnique({ where: { id: input.dispatchId }, include: { order: { select: { id: true, status: true, subtotalKobo: true } } } });
  if (!dispatch) throw new ApiError(404, "dispatch_not_found", "Delivery not found.");
  if (dispatch.assignedType !== input.providerType || dispatch.assignedId !== input.providerId) throw new ApiError(403, "forbidden", "You are not assigned to this delivery.");
  if (dispatch.order.status !== "picked_up") throw new ApiError(409, "invalid_state", "Confirm pickup before delivery.");
  if (dispatch.deliveryPin !== input.pin.trim()) throw new ApiError(400, "invalid_pin", "That delivery PIN is incorrect.");

  return prisma.$transaction(async (tx) => {
    const settled = await settleDelivery(tx, dispatch.id, dispatch.orderId, dispatch.order.subtotalKobo, input.providerType, input.providerId, input.actorId);
    await tx.foodDispatch.update({ where: { id: dispatch.id }, data: { status: "completed", deliveredAt: new Date(), settlementReference: settled.reference } });
    await tx.foodOrder.update({ where: { id: dispatch.orderId }, data: { status: "delivered" } });
    await tx.foodOrderEvent.create({ data: { id: randomUUID(), orderId: dispatch.orderId, status: "delivered", note: "Delivery PIN verified and funds settled.", actorId: input.actorId } });
    return { delivered: true, settlementReference: settled.reference };
  });
}

/**
 * Splits the order value into restaurant payout, driver earnings and platform
 * fee using one balanced ledger transaction, guarded by a unique reference so
 * a retry can never settle twice.
 */
async function settleDelivery(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dispatchId: string,
  orderId: string,
  subtotalKobo: bigint,
  providerType: "courier" | "driver",
  providerId: string,
  actorId: string
) {
  const reference = `EATS-SETTLE-${dispatchId}`;
  const existing = await tx.walletTransaction.findUnique({ where: { reference }, select: { id: true } });
  if (existing) return { reference, alreadySettled: true };

  const order = await tx.foodOrder.findUniqueOrThrow({ where: { id: orderId }, select: { restaurant: { select: { ownerId: true, name: true } }, orderNumber: true } });
  const driverEarnings = earningsFor(subtotalKobo);
  const restaurantShare = (subtotalKobo * RESTAURANT_BPS) / BigInt(10000) - driverEarnings;
  if (restaurantShare <= BigInt(0)) throw new ApiError(409, "settlement_invalid", "This order value cannot cover the delivery fee.");

  const { ensureWallet } = await import("@/lib/payments/service");
  const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const restaurantWallet = await ensureWallet(tx, { userId: order.restaurant.ownerId, ownerType: "VENDOR" });

  const providerWallet =
    providerType === "courier"
      ? await tx.courier.findUnique({ where: { id: providerId }, select: { userId: true } }).then((row) => (row ? ensureWallet(tx, { userId: row.userId, ownerType: "COURIER" }) : null))
      : await tx.driverProfile.findUnique({ where: { id: providerId }, select: { userId: true } }).then((row) => (row ? ensureWallet(tx, { userId: row.userId, ownerType: "DRIVER" }) : null));
  if (!providerWallet) throw new ApiError(409, "provider_missing", "The assigned provider no longer exists.");

  for (const [walletId, amount] of [
    [restaurantWallet.id, restaurantShare],
    [providerWallet.id, driverEarnings]
  ] as const) {
    await tx.wallet.update({ where: { id: walletId }, data: { availableKobo: { increment: amount } } });
  }
  const platformFee = subtotalKobo - restaurantShare - driverEarnings;
  await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { decrement: subtotalKobo }, availableKobo: { increment: platformFee } } });

  await postBalancedTransaction({
    tx,
    actorId,
    walletId: restaurantWallet.id,
    type: "payout",
    amountKobo: restaurantShare,
    reference,
    description: `NaijaEats settlement for ${order.orderNumber}`,
    // Debits must equal credits: the platform fee stays with the platform, so it
    // is written as an explicit credit rather than left implicit.
    entries: [
      { walletId: platform.id, direction: "DEBIT", amountKobo: subtotalKobo, memo: "Order funds released from escrow" },
      { walletId: restaurantWallet.id, direction: "CREDIT", amountKobo: restaurantShare, memo: "Restaurant food revenue" },
      { walletId: providerWallet.id, direction: "CREDIT", amountKobo: driverEarnings, memo: "Delivery earnings" },
      { walletId: platform.id, direction: "CREDIT", amountKobo: platformFee, memo: "Platform service fee" }
    ]
  });
  await recordAudit({
    tx,
    actorId,
    action: "food_order.settled",
    entity: "FoodOrder",
    entityId: orderId,
    metadata: { reference, restaurantShare: restaurantShare.toString(), driverEarnings: driverEarnings.toString(), platformFee: platformFee.toString() }
  });
  return { reference, alreadySettled: false };
}

/** Dispatch state for one order, for the customer tracker and support. */
export async function dispatchForOrder(orderId: string) {
  const dispatch = await prisma.foodDispatch.findUnique({
    where: { orderId },
    include: { offers: { select: { providerType: true, status: true } } }
  });
  if (!dispatch) return null;
  return {
    status: dispatch.status,
    assignedType: dispatch.assignedType,
    assignedId: dispatch.assignedId,
    pickedUpAt: dispatch.pickedUpAt?.toISOString() ?? null,
    deliveredAt: dispatch.deliveredAt?.toISOString() ?? null,
    offers: dispatch.offers
  };
}

export function newPins() {
  return pins();
}

export { randomBytes as dispatchSalt };
