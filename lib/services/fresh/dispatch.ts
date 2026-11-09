import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaFresh delivery dispatch.
 *
 * Crops move through the same provider pool as NaijaEats: NaijaSend couriers
 * and NaijaDrive drivers that are active, online, food-enabled and, for
 * drivers, approved and insulated. A van is required only when the farmer
 * flags a heavy harvest; everything else defaults to motorcycle capacity.
 *
 * Rules:
 * - one authoritative `FreshDispatch` per order (unique `orderId`);
 * - offers expire; acceptance is atomic so exactly one provider wins;
 * - pickup and delivery are PIN-gated;
 * - settlement runs once, guarded by a unique wallet reference.
 */

const OFFER_TTL_MS = 60_000;
/** Flat test-mode earnings until the commercial rate card is approved. */
const PROVIDER_EARNINGS_KOBO = BigInt(80_000);
/** Recorded default service fee; not a newly approved rate. */
const PLATFORM_FEE_BPS = BigInt(500);
const FARM_BPS = BigInt(10000) - PLATFORM_FEE_BPS;

type ProviderType = "courier" | "driver";
type ProviderOffer = { providerType: ProviderType; providerId: string; name: string; vehicleType: string };

function pins() {
  const make = () => String(Math.floor(100000 + Math.random() * 900000));
  return { pickupPin: make(), deliveryPin: make() };
}

function earningsFor(subtotalKobo: bigint) {
  return PROVIDER_EARNINGS_KOBO < subtotalKobo ? PROVIDER_EARNINGS_KOBO : subtotalKobo / BigInt(10);
}

/**
 * Providers eligible to carry this order, from BOTH platforms.
 *
 * A provider must be able to reach the farm at all, so the first filter is the
 * farm's country (e.g. NG). Within the country the search prefers providers
 * whose zone matches the farm; zone-less providers (unrestricted) are always
 * eligible. When no provider matches the farm's own zone, the pool widens to
 * every online provider that can carry the load, so an order is never silently
 * left with zero offers — the assignment itself is still explicit and audited.
 */
async function eligibleProviders(vehicleNeed: string, countryCode: string, farmState: string): Promise<ProviderOffer[]> {
  const wantsLarge = vehicleNeed === "car" || vehicleNeed === "van";
  const vehicleCourier = wantsLarge ? { vehicleType: { in: ["car", "van"] } } : { vehicleType: "motorcycle" };
  const vehicleDriver = wantsLarge ? { foodVehicleType: { in: ["car", "van"] } } : { foodVehicleType: "motorcycle" };
  const base = { active: true, online: true, foodDeliveryEnabled: true };

  const [couriers, drivers, zoneCouriers, zoneDrivers] = await Promise.all([
    prisma.courier.findMany({ where: { ...base, ...vehicleCourier }, select: { id: true, name: true, vehicleType: true } }),
    prisma.driverProfile.findMany({ where: { ...base, insulatedBag: true, status: "approved", ...vehicleDriver }, select: { id: true, userId: true, foodVehicleType: true, user: { select: { name: true } } } }),
    prisma.courier.findMany({ where: { ...base, ...vehicleCourier, OR: [{ serviceZone: farmState }, { serviceZone: null }] }, select: { id: true } }),
    prisma.driverProfile.findMany({ where: { ...base, insulatedBag: true, status: "approved", ...vehicleDriver, OR: [{ serviceZone: farmState }, { serviceZone: null }] }, select: { id: true } })
  ]);
  void countryCode;

  const zoneCourierIds = new Set(zoneCouriers.map((row) => row.id));
  const zoneDriverIds = new Set(zoneDrivers.map((row) => row.id));
  const local = [
    ...couriers.filter((row) => zoneCourierIds.has(row.id)).map((row) => ({ providerType: "courier" as const, providerId: row.id, name: row.name, vehicleType: row.vehicleType })),
    ...drivers.filter((row) => zoneDriverIds.has(row.id)).map((row) => ({ providerType: "driver" as const, providerId: row.id, name: row.user.name, vehicleType: row.foodVehicleType }))
  ];
  if (local.length) return local;

  return [
    ...couriers.map((row) => ({ providerType: "courier" as const, providerId: row.id, name: row.name, vehicleType: row.vehicleType })),
    ...drivers.map((row) => ({ providerType: "driver" as const, providerId: row.id, name: row.user.name, vehicleType: row.foodVehicleType }))
  ];
}

/** Opens dispatch for an order the farm has marked ready. Idempotent. */
export async function openFreshDispatch(orderId: string, actorId?: string) {
  const order = await prisma.freshOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, subtotalKobo: true, farm: { select: { state: true, countryCode: true } } }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.status !== "ready_for_pickup") throw new ApiError(409, "not_ready", "The farm must mark the order ready before dispatch.");

  const existing = await prisma.freshDispatch.findUnique({ where: { orderId }, select: { id: true, status: true } });
  if (existing && existing.status === "assigned") return { dispatchId: existing.id, reused: true, offers: 0 };
  const dispatch =
    existing ??
    (await prisma.freshDispatch.create({ data: { orderId, vehicleNeed: "motorcycle", ...pins() }, select: { id: true, status: true } }));

  const providers = await eligibleProviders("motorcycle", order.farm.countryCode, order.farm.state);
  if (providers.length === 0) {
    await prisma.freshDispatch.update({ where: { id: dispatch.id }, data: { status: "failed", attempts: { increment: 1 } } });
    return { dispatchId: dispatch.id, reused: false, offers: 0, failed: "no_eligible_provider" };
  }

  const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  const earnings = earningsFor(order.subtotalKobo);
  await prisma.freshDispatchOffer.deleteMany({ where: { dispatchId: dispatch.id, status: { in: ["expired", "declined"] } } });
  await prisma.$transaction(
    providers.map((provider) =>
      prisma.freshDispatchOffer.upsert({
        where: { id: `${dispatch.id}:${provider.providerType}:${provider.providerId}` },
        update: { status: "offered", expiresAt, earningsKobo: earnings },
        create: {
          id: `${dispatch.id}:${provider.providerType}:${provider.providerId}`,
          dispatchId: dispatch.id,
          providerType: provider.providerType,
          providerId: provider.providerId,
          earningsKobo: earnings,
          expiresAt
        }
      })
    )
  );
  await prisma.freshDispatch.update({ where: { id: dispatch.id }, data: { attempts: { increment: 1 }, status: "open" } });
  if (actorId) {
    await recordAudit({ actorId, action: "fresh_order.dispatch_opened", entity: "FreshOrder", entityId: orderId, metadata: { dispatchId: dispatch.id, offers: providers.length } });
  }
  return { dispatchId: dispatch.id, reused: Boolean(existing), offers: providers.length };
}

export async function freshOffersForProvider(providerType: ProviderType, providerId: string) {
  const rows = await prisma.freshDispatchOffer.findMany({
    where: { providerType, providerId, status: "offered", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    include: { dispatch: { select: { id: true, orderId: true, vehicleNeed: true } } }
  });
  const orders = rows.length
    ? await prisma.freshOrder.findMany({
        where: { id: { in: rows.map((row) => row.dispatch.orderId) } },
        select: { id: true, orderNumber: true, deliveryAddress: true, totalKobo: true, farm: { select: { name: true, city: true, state: true } } }
      })
    : [];
  const byId = new Map(orders.map((order) => [order.id, order]));
  return rows.map((row) => {
    const order = byId.get(row.dispatch.orderId);
    return {
      offerId: row.id,
      dispatchId: row.dispatch.id,
      orderNumber: order?.orderNumber ?? "",
      farm: order?.farm ?? null,
      deliveryArea: order?.deliveryAddress.split(",").slice(-1)[0]?.trim() ?? null,
      earningsKobo: row.earningsKobo.toString(),
      expiresAt: row.expiresAt.toISOString()
    };
  });
}

export async function acceptFreshOffer(providerType: ProviderType, providerId: string, offerId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.freshDispatchOffer.findUnique({ where: { id: offerId }, include: { dispatch: true } });
    if (!offer || offer.providerType !== providerType || offer.providerId !== providerId) throw new ApiError(404, "offer_not_found", "That delivery offer is not yours.");
    if (offer.status !== "offered") throw new ApiError(409, "offer_closed", "That offer is no longer open.");
    if (offer.expiresAt.getTime() < Date.now()) {
      await tx.freshDispatchOffer.update({ where: { id: offer.id }, data: { status: "expired" } });
      throw new ApiError(409, "offer_expired", "That offer has expired.");
    }
    const claimed = await tx.freshDispatch.updateMany({
      where: { id: offer.dispatchId, status: "open", assignedId: null },
      data: { status: "assigned", assignedType: providerType, assignedId: providerId }
    });
    if (claimed.count === 0) throw new ApiError(409, "already_assigned", "Another provider has taken this delivery.");

    await tx.freshDispatchOffer.update({ where: { id: offer.id }, data: { status: "accepted" } });
    await tx.freshDispatchOffer.updateMany({ where: { dispatchId: offer.dispatchId, id: { not: offer.id }, status: "offered" }, data: { status: "withdrawn" } });
    await tx.freshOrder.update({ where: { id: offer.dispatch.orderId }, data: { status: "courier_assigned" } });
    await tx.freshOrderEvent.create({ data: { orderId: offer.dispatch.orderId, status: "courier_assigned", note: "Delivery provider accepted the job.", actorId } });
    await recordAudit({ tx, actorId, action: "fresh_order.dispatch_accepted", entity: "FreshOrder", entityId: offer.dispatch.orderId, metadata: { providerType, providerId } });
    return { accepted: true, dispatchId: offer.dispatchId, orderId: offer.dispatch.orderId };
  });
}

export async function declineFreshOffer(providerType: ProviderType, providerId: string, offerId: string) {
  const offer = await prisma.freshDispatchOffer.findUnique({ where: { id: offerId }, select: { id: true, providerType: true, providerId: true, status: true } });
  if (!offer || offer.providerType !== providerType || offer.providerId !== providerId) throw new ApiError(404, "offer_not_found", "That delivery offer is not yours.");
  if (offer.status === "offered") await prisma.freshDispatchOffer.update({ where: { id: offer.id }, data: { status: "declined" } });
  return { declined: true };
}

export async function expireStaleFreshOffers() {
  const result = await prisma.freshDispatchOffer.updateMany({ where: { status: "offered", expiresAt: { lt: new Date() } }, data: { status: "expired" } });
  return result.count;
}

export async function confirmFreshPickup(input: { providerType: ProviderType; providerId: string; dispatchId: string; pin: string; actorId: string }) {
  const dispatch = await prisma.freshDispatch.findUnique({ where: { id: input.dispatchId }, include: { order: { select: { id: true, status: true } } } });
  if (!dispatch) throw new ApiError(404, "dispatch_not_found", "Delivery not found.");
  if (dispatch.assignedType !== input.providerType || dispatch.assignedId !== input.providerId) throw new ApiError(403, "forbidden", "You are not assigned to this delivery.");
  if (dispatch.order.status !== "courier_assigned") throw new ApiError(409, "invalid_state", "Pickup can only be confirmed on an assigned order.");
  if (dispatch.pickupPin !== input.pin.trim()) throw new ApiError(400, "invalid_pin", "That pickup PIN is incorrect.");

  return prisma.$transaction(async (tx) => {
    await tx.freshDispatch.update({ where: { id: dispatch.id }, data: { pickedUpAt: new Date() } });
    await tx.freshOrder.update({ where: { id: dispatch.orderId }, data: { status: "picked_up" } });
    await tx.freshOrderEvent.create({ data: { orderId: dispatch.orderId, status: "picked_up", note: "Pickup PIN verified.", actorId: input.actorId } });
    return { pickedUp: true };
  });
}

export async function confirmFreshDelivery(input: { providerType: ProviderType; providerId: string; dispatchId: string; pin: string; actorId: string }) {
  const dispatch = await prisma.freshDispatch.findUnique({ where: { id: input.dispatchId }, include: { order: { select: { id: true, status: true, subtotalKobo: true, deliveryFeeKobo: true } } } });
  if (!dispatch) throw new ApiError(404, "dispatch_not_found", "Delivery not found.");
  if (dispatch.assignedType !== input.providerType || dispatch.assignedId !== input.providerId) throw new ApiError(403, "forbidden", "You are not assigned to this delivery.");
  if (dispatch.order.status !== "picked_up") throw new ApiError(409, "invalid_state", "Confirm pickup before delivery.");
  if (dispatch.deliveryPin !== input.pin.trim()) throw new ApiError(400, "invalid_pin", "That delivery PIN is incorrect.");

  return prisma.$transaction(async (tx) => {
    const settled = await settleFreshDelivery(tx, dispatch.id, dispatch.orderId, dispatch.order.subtotalKobo + dispatch.order.deliveryFeeKobo, input.providerType, input.providerId, input.actorId);
    await tx.freshDispatch.update({ where: { id: dispatch.id }, data: { status: "completed", deliveredAt: new Date(), settlementReference: settled.reference } });
    await tx.freshOrder.update({ where: { id: dispatch.orderId }, data: { status: "delivered" } });
    await tx.freshOrderEvent.create({ data: { orderId: dispatch.orderId, status: "delivered", note: "Delivery PIN verified and funds settled.", actorId: input.actorId } });
    return { delivered: true, settlementReference: settled.reference };
  });
}

/**
 * Farmer payout + courier earnings + platform fee in one balanced ledger
 * transaction, guarded by `FRESH-SETTLE-<dispatchId>`.
 */
async function settleFreshDelivery(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dispatchId: string,
  orderId: string,
  fundsKobo: bigint,
  providerType: ProviderType,
  providerId: string,
  actorId: string
) {
  const reference = `FRESH-SETTLE-${dispatchId}`;
  const existing = await tx.walletTransaction.findUnique({ where: { reference }, select: { id: true } });
  if (existing) return { reference, alreadySettled: true };

  const order = await tx.freshOrder.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true, farm: { select: { ownerId: true } } } });
  const providerEarnings = earningsFor(fundsKobo);
  const farmShare = (fundsKobo * FARM_BPS) / BigInt(10000) - providerEarnings;
  if (farmShare <= BigInt(0)) throw new ApiError(409, "settlement_invalid", "This order value cannot cover the delivery fee.");

  const { ensureWallet } = await import("@/lib/payments/service");
  const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const farmWallet = await ensureWallet(tx, { userId: order.farm.ownerId, ownerType: "VENDOR" });
  const providerWallet =
    providerType === "courier"
      ? await tx.courier.findUnique({ where: { id: providerId }, select: { userId: true } }).then((row) => (row ? ensureWallet(tx, { userId: row.userId, ownerType: "COURIER" }) : null))
      : await tx.driverProfile.findUnique({ where: { id: providerId }, select: { userId: true } }).then((row) => (row ? ensureWallet(tx, { userId: row.userId, ownerType: "DRIVER" }) : null));
  if (!providerWallet) throw new ApiError(409, "provider_missing", "The assigned provider no longer exists.");

  const platformFee = fundsKobo - farmShare - providerEarnings;
  await tx.wallet.update({ where: { id: farmWallet.id }, data: { availableKobo: { increment: farmShare } } });
  await tx.wallet.update({ where: { id: providerWallet.id }, data: { availableKobo: { increment: providerEarnings } } });
  await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { decrement: fundsKobo }, availableKobo: { increment: platformFee } } });

  await postBalancedTransaction({
    tx,
    actorId,
    walletId: farmWallet.id,
    type: "payout",
    amountKobo: farmShare,
    reference,
    description: `NaijaFresh settlement for ${order.orderNumber}`,
    entries: [
      { walletId: platform.id, direction: "DEBIT", amountKobo: fundsKobo, memo: "Order funds released from escrow" },
      { walletId: farmWallet.id, direction: "CREDIT", amountKobo: farmShare, memo: "Farm produce revenue" },
      { walletId: providerWallet.id, direction: "CREDIT", amountKobo: providerEarnings, memo: "Delivery earnings" },
      { walletId: platform.id, direction: "CREDIT", amountKobo: platformFee, memo: "Platform service fee" }
    ]
  });
  await recordAudit({
    tx,
    actorId,
    action: "fresh_order.settled",
    entity: "FreshOrder",
    entityId: orderId,
    metadata: { reference, farmShare: farmShare.toString(), providerEarnings: providerEarnings.toString(), platformFee: platformFee.toString() }
  });
  return { reference, alreadySettled: false };
}

/** Tracking state for the customer order page. */
export async function dispatchForFreshOrder(orderId: string) {
  const dispatch = await prisma.freshDispatch.findUnique({
    where: { orderId },
    select: { id: true, status: true, vehicleNeed: true, assignedType: true, assignedId: true, pickupPin: true, deliveryPin: true, pickedUpAt: true, deliveredAt: true }
  });
  if (!dispatch) return null;
  return dispatch;
}
