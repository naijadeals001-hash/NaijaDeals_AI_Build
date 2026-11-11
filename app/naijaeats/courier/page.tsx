import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Bike, ArrowRight } from "lucide-react";
import {
  PartnerDashboard,
  type AvailabilityInput,
  type AvailabilityResult,
  type OfferMeta,
  type PartnerDashboardData,
  type PartnerTransport,
  type PartnerTransportKind,
  type PartnerViewId,
  type SelectTransportInput
} from "@/components/eats/partner-dashboard";
import { getSessionUser } from "@/lib/auth/session";
import { CITIES } from "@/lib/config/regions";
import { prisma } from "@/lib/prisma";
import { isCityActivated } from "@/lib/services/core/city.service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner dashboard — NaijaEats" };

const OPERATING_TIME_ZONE = "Africa/Lagos";
const EATS_SETTLEMENT_PREFIX = "EATS-SETTLE-";
/** Maximum distance a partner may be from their recorded operating city. */
const SERVICE_AREA_RADIUS_METERS = 80_000;
/** A location reading older than this is not accepted for going online. */
const MAX_POSITION_AGE_MS = 120_000;

/**
 * City centres used only to verify that a partner going online is actually in
 * their recorded operating area. They are real map coordinates, not delivery
 * positions, and are never presented as the location of an order.
 */
const CITY_CENTRES: Record<string, [number, number]> = {
  lagos: [6.5244, 3.3792],
  abuja: [9.0765, 7.3986],
  "port harcourt": [4.8156, 7.0498],
  ibadan: [7.3775, 3.947],
  kano: [12.0022, 8.592],
  enugu: [6.4584, 7.5464],
  "benin city": [6.335, 5.6037],
  kaduna: [10.5222, 7.4383],
  accra: [5.6037, -0.187],
  kumasi: [6.6885, -1.6244],
  nairobi: [-1.2921, 36.8219],
  mombasa: [-4.0435, 39.6682],
  johannesburg: [-26.2041, 28.0473],
  "cape town": [-33.9249, 18.4241],
  durban: [-29.8587, 31.0218],
  london: [51.5072, -0.1276],
  manchester: [53.4808, -2.2426],
  birmingham: [52.4862, -1.8904],
  "new york": [40.7128, -74.006],
  atlanta: [33.749, -84.388],
  houston: [29.7604, -95.3698]
};

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: "Motorbike",
  motorbike: "Motorbike",
  scooter: "Scooter",
  moped: "Scooter / moped",
  "electric-motorcycle": "Electric motorcycle",
  "electric-scooter": "Electric scooter",
  bicycle: "Bicycle",
  bike: "Bicycle",
  "electric-bicycle": "Electric bicycle",
  "e-bike": "Electric bicycle",
  car: "Car",
  tricycle: "Tricycle",
  keke: "Tricycle",
  van: "Van",
  walking: "Walking courier",
  foot: "Walking courier",
  pedestrian: "Walking courier"
};

function vehicleLabel(value: string | null | undefined) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return VEHICLE_LABELS[key] ?? (key ? key.replace(/-/g, " ") : "Transport not recorded");
}

function normaliseVehicle(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

/** UTC instant for midnight today in the operating timezone (Africa/Lagos). */
function zonedDayStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Africa/Lagos is UTC+1 all year, with no daylight-saving transition.
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - 60 * 60 * 1000);
}

function greetingFor(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: OPERATING_TIME_ZONE, hour: "2-digit", hour12: false }).format(now)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function cityCentre(zone: string | null) {
  if (!zone) return null;
  const clean = zone.trim().toLowerCase();
  if (CITY_CENTRES[clean]) return CITY_CENTRES[clean];
  const match = Object.keys(CITY_CENTRES).find((city) => clean.includes(city));
  return match ? CITY_CENTRES[match] : null;
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const radius = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function maskLicence(value: string | null | undefined) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  if (clean.length <= 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}

type ProviderRows = {
  courier: {
    id: string;
    name: string;
    active: boolean;
    suspendedReason: string | null;
    foodDeliveryEnabled: boolean;
    vehicleType: string;
    vehiclePlate: string | null;
    serviceZone: string | null;
    online: boolean;
  } | null;
  driver: {
    id: string;
    status: "pending" | "approved" | "suspended";
    active: boolean;
    suspendedReason: string | null;
    foodDeliveryEnabled: boolean;
    foodVehicleType: string;
    vehiclePlate: string;
    vehicleMake: string;
    vehicleModel: string;
    licenseNumber: string;
    serviceZone: string | null;
    online: boolean;
    insulatedBag: boolean;
  } | null;
};

async function loadProviders(userId: string): Promise<ProviderRows> {
  const [courier, driver] = await Promise.all([
    prisma.courier.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        active: true,
        suspendedReason: true,
        foodDeliveryEnabled: true,
        vehicleType: true,
        vehiclePlate: true,
        serviceZone: true,
        online: true
      }
    }),
    prisma.driverProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        active: true,
        suspendedReason: true,
        foodDeliveryEnabled: true,
        foodVehicleType: true,
        vehiclePlate: true,
        vehicleMake: true,
        vehicleModel: true,
        licenseNumber: true,
        serviceZone: true,
        online: true,
        insulatedBag: true
      }
    })
  ]);
  return { courier, driver };
}

function transportFor(row: ProviderRows, kind: PartnerTransportKind, cityActive: boolean): PartnerTransport | null {
  if (kind === "courier" && row.courier) {
    const courier = row.courier;
    let status: PartnerTransport["status"] = "approved";
    let statusLabel = "Approved";
    if (!courier.active) {
      status = "inactive";
      statusLabel = "Inactive";
    } else if (!courier.foodDeliveryEnabled) {
      status = "not_enabled";
      statusLabel = "Food delivery not enabled";
    }
    return {
      kind,
      id: courier.id,
      label: vehicleLabel(courier.vehicleType),
      rawVehicle: normaliseVehicle(courier.vehicleType),
      online: courier.online,
      approved: status === "approved",
      status,
      statusLabel,
      serviceZone: courier.serviceZone,
      cityActive,
      plate: courier.vehiclePlate,
      makeModel: null,
      insulatedBag: null,
      licenceMasked: null,
      note:
        status === "approved"
          ? courier.serviceZone
            ? `Approved for food delivery in ${courier.serviceZone}.`
            : "Approved for food delivery. No operating city is recorded."
          : courier.suspendedReason ?? (status === "inactive" ? "This transport is not active." : "Food delivery has not been enabled for this transport.")
    };
  }
  if (kind === "driver" && row.driver) {
    const driver = row.driver;
    let status: PartnerTransport["status"] = "approved";
    let statusLabel = "Approved";
    if (driver.status === "pending") {
      status = "pending";
      statusLabel = "Pending approval";
    } else if (driver.status === "suspended" || !driver.active) {
      status = "suspended";
      statusLabel = "Suspended";
    } else if (!driver.foodDeliveryEnabled) {
      status = "not_enabled";
      statusLabel = "Food delivery not enabled";
    }
    return {
      kind,
      id: driver.id,
      label: vehicleLabel(driver.foodVehicleType),
      rawVehicle: normaliseVehicle(driver.foodVehicleType),
      online: driver.online,
      approved: status === "approved",
      status,
      statusLabel,
      serviceZone: driver.serviceZone,
      cityActive,
      plate: driver.vehiclePlate || null,
      makeModel: [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(" ") || null,
      insulatedBag: driver.insulatedBag,
      licenceMasked: maskLicence(driver.licenseNumber),
      note:
        status === "approved"
          ? driver.insulatedBag
            ? "Approved for food delivery with an insulated bag recorded."
            : "Approved, but no insulated bag is recorded, so food offers are not sent."
          : driver.suspendedReason ??
            (status === "pending" ? "Awaiting partner-operations approval." : "Food delivery has not been enabled for this transport.")
    };
  }
  return null;
}

function eligibilityError(row: ProviderRows, kind: PartnerTransportKind) {
  const profile = kind === "courier" ? row.courier : row.driver;
  if (!profile) return "That transport is not registered to this account.";
  if (kind === "courier") {
    if (!profile.active) return "This courier transport is inactive. Contact partner support.";
    if (!profile.foodDeliveryEnabled) return "Food delivery is not enabled for this courier account.";
    return null;
  }
  const driver = row.driver!;
  if (driver.status !== "approved") return "Your NaijaDrive delivery profile is still awaiting approval.";
  if (!driver.active) return "This driver transport is suspended. Contact partner support.";
  if (!driver.foodDeliveryEnabled) return "Food delivery is not enabled for this driver account.";
  if (!driver.insulatedBag) return "An insulated food bag must be recorded before you can take food deliveries.";
  return null;
}

function validatePosition(
  position: AvailabilityInput["position"],
  serviceZone: string | null
): string | null {
  if (!position) return "A current device location is required to go online.";
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  const accuracyM = Number(position.accuracyM);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -85 || latitude > 85 || longitude < -180 || longitude > 180) {
    return "That location reading was not valid. Try again.";
  }
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5_000) {
    return "Your location accuracy is too poor to go online. Move to an open area and try again.";
  }
  const capturedAt = Date.parse(String(position.capturedAt ?? ""));
  if (!Number.isFinite(capturedAt)) return "That location reading had no valid timestamp. Try again.";
  const age = Date.now() - capturedAt;
  if (age > MAX_POSITION_AGE_MS) return "That location reading is stale. Try again.";
  if (age < -60_000) return "Your device clock appears to be ahead. Check the date and time, then try again.";
  const centre = cityCentre(serviceZone);
  if (centre && haversineMeters(centre, [latitude, longitude]) > SERVICE_AREA_RADIUS_METERS) {
    return `Your position is outside ${serviceZone}. Move into your operating area, or ask support to update your operating city.`;
  }
  return null;
}

/** Read-only offer context the provider is authorised to see before accepting. */
async function offerMetaFor(userId: string, offerId: string): Promise<OfferMeta | null> {
  if (!offerId || typeof offerId !== "string") return null;
  const rows = await loadProviders(userId);
  const identities = [
    rows.courier ? { providerType: "courier", providerId: rows.courier.id } : null,
    rows.driver ? { providerType: "driver", providerId: rows.driver.id } : null
  ].filter(Boolean) as Array<{ providerType: string; providerId: string }>;
  if (!identities.length) return null;
  const offer = await prisma.dispatchOffer.findFirst({
    where: { id: offerId, status: "offered", OR: identities },
    select: {
      dispatch: {
        select: {
          vehicleNeed: true,
          order: {
            select: {
              orderNumber: true,
              paymentStatus: true,
              status: true,
              items: { select: { quantity: true } }
            }
          }
        }
      }
    }
  });
  if (!offer) return null;
  const quantity = offer.dispatch.order.items.reduce((total, item) => total + item.quantity, 0);
  const payment = offer.dispatch.order.paymentStatus.toLowerCase();
  return {
    orderNumber: offer.dispatch.order.orderNumber,
    paymentStatus: offer.dispatch.order.paymentStatus,
    paymentLabel: payment === "paid" ? "Paid online" : payment === "pending" ? "Payment pending" : offer.dispatch.order.paymentStatus,
    itemCount: offer.dispatch.order.items.length,
    itemQuantity: quantity,
    vehicleNeed: offer.dispatch.vehicleNeed,
    orderStatus: offer.dispatch.order.status
  };
}

const PARTNER_VIEWS: PartnerViewId[] = ["overview", "deliveries", "earnings", "wallet", "transport", "support", "settings"];

export default async function CourierPage({ searchParams }: { searchParams?: { view?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijaeats/courier");

  const rows = await loadProviders(user.id);
  if (!rows.courier && !rows.driver) {
    return (
      <main className="min-h-screen bg-[#f7f9f8] px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-[640px] rounded-2xl border border-[#e5ebe6] bg-white p-6 shadow-sm sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf7ee] text-[#0b5c33]">
            <Bike className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-[24px] font-extrabold text-[#14241b]">A delivery partner account is required</h1>
          <p className="mt-2 text-[13px] leading-6 text-[#5d6d64]">
            This account is not registered as a NaijaEats delivery partner. Join through NaijaSend for courier transport or through
            NaijaDrive for ride and food-delivery driving, then opt in to food delivery once your details are approved.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/naijasend/transporter" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b5c33] px-5 text-[12.5px] font-bold text-white">
              Register as a transporter <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/naijadrive" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8e2da] px-5 text-[12.5px] font-bold text-[#0b5c33]">
              Explore NaijaDrive
            </Link>
            <Link href="/naijaeats" className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[12.5px] font-bold text-[#5d6d64] underline">
              Back to NaijaEats
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const serviceZone = rows.courier?.serviceZone?.trim() || rows.driver?.serviceZone?.trim() || null;
  const catalogueCity = serviceZone
    ? (CITIES.NG ?? []).find((city) => serviceZone.toLowerCase().includes(city.toLowerCase())) ?? serviceZone
    : null;
  const cityActive = catalogueCity ? await isCityActivated("NG", catalogueCity) : false;
  const transports = [
    transportFor(rows, "courier", cityActive),
    transportFor(rows, "driver", cityActive)
  ].filter((row): row is PartnerTransport => Boolean(row));
  const online = transports.some((transport) => transport.online);
  const activeTransport =
    transports.find((transport) => transport.online) ??
    transports.find((transport) => transport.approved) ??
    transports[0] ??
    null;

  const dayStart = zonedDayStart();
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const identities = transports.map((transport) => ({ assignedType: transport.kind, assignedId: transport.id }));

  const [activeDispatch, completedToday, recentDispatches, wallets] = await Promise.all([
    identities.length
      ? prisma.foodDispatch.findFirst({
          where: { OR: identities, status: "assigned" },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            status: true,
            pickedUpAt: true,
            updatedAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                deliveryAddress: true,
                contactName: true,
                contactPhone: true,
                paymentStatus: true,
                totalKobo: true,
                restaurant: { select: { name: true, address: true, phone: true, market: true } }
              }
            }
          }
        })
      : null,
    identities.length
      ? prisma.foodDispatch.count({
          where: { OR: identities, status: "completed", deliveredAt: { gte: dayStart, lt: dayEnd } }
        })
      : 0,
    identities.length
      ? prisma.foodDispatch.findMany({
          where: { OR: identities, status: "completed" },
          orderBy: { deliveredAt: "desc" },
          take: 12,
          select: {
            id: true,
            deliveredAt: true,
            order: {
              select: {
                orderNumber: true,
                deliveryAddress: true,
                paymentStatus: true,
                totalKobo: true,
                restaurant: { select: { name: true, market: true } }
              }
            }
          }
        })
      : [],
    prisma.wallet.findMany({
      where: { userId: user.id },
      select: { id: true, currency: true, availableKobo: true, heldKobo: true, ownerType: true }
    })
  ]);

  // Delivery earnings are identified by the EATS settlement reference AND the
  // delivery-earnings memo. Scanning every wallet row on the account is
  // deliberate: the current payment service resolves a wallet by user id, so a
  // partner who also operates a kitchen may have the credit posted to the
  // existing vendor wallet. The dashboard must still show the real ledger
  // credit without creating a second wallet.
  const displayCurrency = wallets.find((wallet) => wallet.currency === "NGN")?.currency ?? wallets[0]?.currency ?? "NGN";
  const walletRows = wallets.filter((wallet) => wallet.currency === displayCurrency);
  const walletIds = walletRows.map((wallet) => wallet.id);
  const currency = displayCurrency;
  const settlementFilter = {
    walletId: { in: walletIds },
    direction: "CREDIT" as const,
    memo: "Delivery earnings",
    transaction: { reference: { startsWith: EATS_SETTLEMENT_PREFIX } }
  };

  const [todayEarnings, weekEarnings, allEarnings, recentEarnings] = walletIds.length
    ? await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { ...settlementFilter, createdAt: { gte: dayStart, lt: dayEnd } },
          _sum: { amountKobo: true }
        }),
        prisma.ledgerEntry.aggregate({
          where: { ...settlementFilter, createdAt: { gte: weekStart, lt: dayEnd } },
          _sum: { amountKobo: true }
        }),
        prisma.ledgerEntry.aggregate({ where: settlementFilter, _sum: { amountKobo: true } }),
        prisma.ledgerEntry.findMany({
          where: settlementFilter,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            amountKobo: true,
            memo: true,
            createdAt: true,
            transaction: { select: { reference: true, description: true } }
          }
        })
      ])
    : [
        { _sum: { amountKobo: null } },
        { _sum: { amountKobo: null } },
        { _sum: { amountKobo: null } },
        []
      ];

  const data: PartnerDashboardData = {
    partner: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      greeting: greetingFor(),
      city: serviceZone,
      cityActive,
      online,
      activeTransportKind: activeTransport?.kind ?? null,
      ready: Boolean(online && !activeDispatch && activeTransport?.approved)
    },
    transports,
    stats: {
      earningsTodayKobo: (todayEarnings._sum.amountKobo ?? BigInt(0)).toString(),
      earningsWeekKobo: (weekEarnings._sum.amountKobo ?? BigInt(0)).toString(),
      earningsAllKobo: (allEarnings._sum.amountKobo ?? BigInt(0)).toString(),
      completedToday,
      currency
    },
    activeDelivery: activeDispatch
      ? {
          dispatchId: activeDispatch.id,
          status: activeDispatch.status,
          pickedUpAt: activeDispatch.pickedUpAt?.toISOString() ?? null,
          updatedAt: activeDispatch.updatedAt.toISOString(),
          order: {
            id: activeDispatch.order.id,
            orderNumber: activeDispatch.order.orderNumber,
            status: activeDispatch.order.status,
            deliveryAddress: activeDispatch.order.deliveryAddress,
            contactName: activeDispatch.order.contactName,
            contactPhone: activeDispatch.order.contactPhone,
            paymentStatus: activeDispatch.order.paymentStatus,
            totalKobo: activeDispatch.order.totalKobo.toString(),
            restaurant: activeDispatch.order.restaurant
          }
        }
      : null,
    recentDeliveries: recentDispatches.map((dispatch) => ({
      id: dispatch.id,
      deliveredAt: dispatch.deliveredAt?.toISOString() ?? null,
      orderNumber: dispatch.order.orderNumber,
      deliveryAddress: dispatch.order.deliveryAddress,
      paymentStatus: dispatch.order.paymentStatus,
      totalKobo: dispatch.order.totalKobo.toString(),
      restaurantName: dispatch.order.restaurant.name,
      market: dispatch.order.restaurant.market
    })),
    wallet: {
      availableKobo: walletRows.reduce((total, wallet) => total + wallet.availableKobo, BigInt(0)).toString(),
      heldKobo: walletRows.reduce((total, wallet) => total + wallet.heldKobo, BigInt(0)).toString(),
      currency,
      rows: walletRows.map((wallet) => ({
        id: wallet.id,
        ownerType: wallet.ownerType,
        availableKobo: wallet.availableKobo.toString(),
        heldKobo: wallet.heldKobo.toString()
      })),
      recent: recentEarnings.map((entry) => ({
        id: entry.id,
        amountKobo: entry.amountKobo.toString(),
        memo: entry.memo,
        createdAt: entry.createdAt.toISOString(),
        reference: entry.transaction.reference,
        description: entry.transaction.description
      }))
    }
  };

  async function updateAvailabilityAction(input: AvailabilityInput): Promise<AvailabilityResult> {
    "use server";
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) return { ok: false, code: "unauthenticated", message: "Sign in to change your availability." };
      const kind: PartnerTransportKind = input?.transport === "driver" ? "driver" : "courier";
      const providerRows = await loadProviders(sessionUser.id);
      const profile = kind === "courier" ? providerRows.courier : providerRows.driver;
      if (!profile) return { ok: false, code: "transport_missing", message: "That transport is not registered to this account." };

      if (input.online) {
        const eligibility = eligibilityError(providerRows, kind);
        if (eligibility) return { ok: false, code: "not_eligible", message: eligibility };
        if (!profile.serviceZone) {
          return {
            ok: false,
            code: "city_missing",
            message: "An operating city is required before you can go online. Contact partner support to set your city."
          };
        }
        const active = await isCityActivated("NG", profile.serviceZone);
        if (!active) {
          return { ok: false, code: "city_inactive", message: `Food delivery is not activated in ${profile.serviceZone} yet.` };
        }
        const positionError = validatePosition(input.position, profile.serviceZone);
        if (positionError) return { ok: false, code: "location_invalid", message: positionError };

        const result =
          kind === "courier"
            ? await prisma.$transaction(async (tx) => {
                const updated = await tx.courier.updateMany({
                  where: { id: profile.id, userId: sessionUser.id, active: true, foodDeliveryEnabled: true },
                  data: { online: true }
                });
                await tx.driverProfile.updateMany({ where: { userId: sessionUser.id }, data: { online: false } });
                return updated.count;
              })
            : await prisma.$transaction(async (tx) => {
                const updated = await tx.driverProfile.updateMany({
                  where: { id: profile.id, userId: sessionUser.id, status: "approved", active: true, foodDeliveryEnabled: true, insulatedBag: true },
                  data: { online: true }
                });
                await tx.courier.updateMany({ where: { userId: sessionUser.id }, data: { online: false } });
                return updated.count;
              });
        if (result === 0) return { ok: false, code: "update_blocked", message: "Your transport changed while you were going online. Refresh and try again." };
        revalidatePath("/naijaeats/courier");
        return { ok: true, online: true, message: "You are online. Requests in your operating area can now reach you." };
      }

      const activeJob = await prisma.foodDispatch.findFirst({
        where: { assignedType: kind, assignedId: profile.id, status: "assigned" },
        select: { id: true }
      });
      if (activeJob) {
        return {
          ok: false,
          code: "active_delivery",
          message: "Finish or hand over your active delivery before going offline."
        };
      }
      if (kind === "courier") {
        await prisma.courier.updateMany({ where: { id: profile.id, userId: sessionUser.id }, data: { online: false } });
      } else {
        await prisma.driverProfile.updateMany({ where: { id: profile.id, userId: sessionUser.id }, data: { online: false } });
      }
      revalidatePath("/naijaeats/courier");
      return { ok: true, online: false, message: "You are offline. Location tracking has stopped." };
    } catch {
      return { ok: false, code: "unexpected", message: "Availability could not be changed. Try again." };
    }
  }

  async function selectTransportAction(input: SelectTransportInput): Promise<AvailabilityResult> {
    "use server";
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) return { ok: false, code: "unauthenticated", message: "Sign in to change your transport." };
      const kind: PartnerTransportKind = input?.transport === "driver" ? "driver" : "courier";
      const providerRows = await loadProviders(sessionUser.id);
      const eligibility = eligibilityError(providerRows, kind);
      if (eligibility) return { ok: false, code: "not_eligible", message: eligibility };
      const anyOnline = Boolean(providerRows.courier?.online || providerRows.driver?.online);
      const targetAlreadyOnline = Boolean(kind === "courier" ? providerRows.courier?.online : providerRows.driver?.online);
      if (!anyOnline || targetAlreadyOnline) {
        return {
          ok: true,
          online: anyOnline,
          message: targetAlreadyOnline
            ? `${vehicleLabel(kind === "courier" ? providerRows.courier?.vehicleType : providerRows.driver?.foodVehicleType)} is already your active transport.`
            : `Selected ${vehicleLabel(kind === "courier" ? providerRows.courier?.vehicleType : providerRows.driver?.foodVehicleType)} for your next session.`
        };
      }

      const activeJob = await prisma.foodDispatch.findFirst({
        where: {
          status: "assigned",
          OR: [
            { assignedType: "courier", assignedId: providerRows.courier?.id ?? "" },
            { assignedType: "driver", assignedId: providerRows.driver?.id ?? "" }
          ]
        },
        select: { id: true }
      });
      if (activeJob) {
        return { ok: false, code: "active_delivery", message: "Finish or hand over your active delivery before switching transport." };
      }
      const profile = kind === "courier" ? providerRows.courier : providerRows.driver;
      if (!profile?.serviceZone) {
        return {
          ok: false,
          code: "city_missing",
          message: "An operating city is required before this transport can receive requests. Contact partner support to set it."
        };
      }
      const active = await isCityActivated("NG", profile.serviceZone);
      if (!active) return { ok: false, code: "city_inactive", message: `Food delivery is not activated in ${profile.serviceZone} yet.` };
      const positionError = validatePosition(input.position, profile.serviceZone);
      if (positionError) return { ok: false, code: "location_invalid", message: positionError };

      if (kind === "courier") {
        await prisma.$transaction([
          prisma.courier.updateMany({ where: { userId: sessionUser.id }, data: { online: false } }),
          prisma.driverProfile.updateMany({ where: { userId: sessionUser.id }, data: { online: false } }),
          prisma.courier.updateMany({ where: { id: profile!.id, userId: sessionUser.id }, data: { online: true } })
        ]);
      } else {
        await prisma.$transaction([
          prisma.courier.updateMany({ where: { userId: sessionUser.id }, data: { online: false } }),
          prisma.driverProfile.updateMany({ where: { userId: sessionUser.id }, data: { online: false } }),
          prisma.driverProfile.updateMany({ where: { id: profile!.id, userId: sessionUser.id }, data: { online: true } })
        ]);
      }
      revalidatePath("/naijaeats/courier");
      return { ok: true, online: true, message: "Active transport changed. Only this transport will receive new requests." };
    } catch {
      return { ok: false, code: "unexpected", message: "Transport could not be changed. Try again." };
    }
  }

  async function loadOfferMetaAction(offerId: string): Promise<OfferMeta | null> {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return null;
    try {
      return await offerMetaFor(sessionUser.id, offerId);
    } catch {
      return null;
    }
  }

  const requestedView = typeof searchParams?.view === "string" ? (searchParams.view as PartnerViewId) : null;
  const initialView: PartnerViewId = requestedView && PARTNER_VIEWS.includes(requestedView) ? requestedView : "overview";

  return (
    <PartnerDashboard
      data={data}
      initialView={initialView}
      actions={{
        updateAvailability: updateAvailabilityAction,
        selectTransport: selectTransportAction,
        loadOfferMeta: loadOfferMetaAction
      }}
    />
  );
}
