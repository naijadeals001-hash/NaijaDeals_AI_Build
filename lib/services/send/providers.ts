import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { PROVIDER_TYPES } from "@/lib/services/send/shipments";

/**
 * Independent logistics providers.
 *
 * A provider is an organisation or individual that operates its own transport
 * assets. NaijaSend never records itself as the operator. Providers start
 * `pending` and only a Control Center decision (`verified`) lets them quote.
 *
 * NaijaDrive drivers already hold a `DriverProfile`; they enrol through
 * `enrolFromNaijaDrive`, which links the existing profile instead of copying it.
 * Trucks, carriers, forwarders and warehouses register here directly with their
 * own licence and insurance references.
 */

const TEXT_LIMIT = 160;

export async function createProvider(input: {
  ownerId: string;
  name: string;
  providerType: string;
  country?: string;
  operatingCities?: string[];
  contactPhone: string;
  licenceRef?: string;
  insuranceRef?: string;
  capacityKg?: number;
}) {
  if (!PROVIDER_TYPES.includes(input.providerType as (typeof PROVIDER_TYPES)[number])) {
    throw new ApiError(400, "invalid_provider_type", "Choose a valid provider type.");
  }
  const name = (input.name ?? "").trim();
  const phone = (input.contactPhone ?? "").trim();
  if (name.length < 2) throw new ApiError(400, "validation_error", "Enter the provider or company name.");
  if (!phone) throw new ApiError(400, "validation_error", "Enter a contact phone number.");
  if (input.capacityKg !== undefined && (!Number.isInteger(input.capacityKg) || input.capacityKg < 1)) {
    throw new ApiError(400, "invalid_capacity", "Capacity must be a whole number of kilograms.");
  }

  const existing = await prisma.logisticsProvider.findFirst({ where: { ownerId: input.ownerId }, select: { id: true, status: true } });
  if (existing) throw new ApiError(409, "provider_exists", "This account already operates a provider. Manage it from your transporter dashboard.");

  const provider = await prisma.logisticsProvider.create({
    data: {
      ownerId: input.ownerId,
      name: name.slice(0, TEXT_LIMIT),
      providerType: input.providerType,
      country: (input.country ?? "Nigeria").trim() || "Nigeria",
      operatingCities: (input.operatingCities ?? []).map((city) => city.trim()).filter(Boolean).slice(0, 12),
      contactPhone: phone.slice(0, 40),
      licenceRef: input.licenceRef?.trim().slice(0, 80) || null,
      insuranceRef: input.insuranceRef?.trim().slice(0, 80) || null,
      capacityKg: input.capacityKg ?? null
    }
  });
  await recordAudit({ actorId: input.ownerId, action: "logistics_provider.applied", entity: "LogisticsProvider", entityId: provider.id, metadata: { providerType: provider.providerType, country: provider.country } });
  return provider;
}

/** Enrols an existing NaijaDrive driver as a NaijaSend ground provider. */
export async function enrolFromNaijaDrive(userId: string) {
  const driver = await prisma.driverProfile.findUnique({ where: { userId }, select: { id: true, status: true, vehicleClass: true, vehiclePlate: true, vehicleMake: true, vehicleModel: true, serviceZone: true } });
  if (!driver) throw new ApiError(404, "no_drive_profile", "You do not have a NaijaDrive driver profile yet.");
  if (driver.status !== "approved") throw new ApiError(403, "drive_unapproved", "Your NaijaDrive profile must be approved before it can join NaijaSend.");
  const existing = await prisma.logisticsProvider.findFirst({ where: { ownerId: userId }, select: { id: true } });
  if (existing) throw new ApiError(409, "provider_exists", "This account already operates a NaijaSend provider.");

  const providerType = driver.vehicleClass.toLowerCase().includes("motorcycle") ? "courier" : "car";
  return prisma.$transaction(async (tx) => {
    const provider = await tx.logisticsProvider.create({
      data: {
        ownerId: userId,
        name: `NaijaDrive driver ${driver.vehiclePlate}`,
        providerType,
        sourcePlatform: "naijadrive",
        operatingCities: driver.serviceZone ? [driver.serviceZone] : [],
        contactPhone: "on file with NaijaDrive",
        // The NaijaDrive profile is already verified, and the vehicle is linked.
        status: "verified",
        verifiedAt: new Date()
      }
    });
    await tx.providerVehicle.create({
      data: { providerId: provider.id, vehicleType: providerType, make: driver.vehicleMake, model: driver.vehicleModel, plate: driver.vehiclePlate, driverProfileId: driver.id, capacityKg: providerType === "courier" ? 20 : 150 }
    });
    return provider;
  });
}

/** Adds a vehicle or transport asset to an existing provider. */
export async function addVehicle(input: { ownerId: string; providerId: string; vehicleType: string; make?: string; model?: string; plate?: string; capacityKg: number }) {
  const provider = await prisma.logisticsProvider.findUnique({ where: { id: input.providerId }, select: { id: true, ownerId: true } });
  if (!provider) throw new ApiError(404, "provider_not_found", "Provider not found.");
  if (provider.ownerId !== input.ownerId) throw new ApiError(403, "forbidden", "This provider belongs to another account.");
  if (!Number.isInteger(input.capacityKg) || input.capacityKg < 1) throw new ApiError(400, "invalid_capacity", "Capacity must be a positive whole number of kilograms.");
  return prisma.providerVehicle.create({
    data: {
      providerId: provider.id,
      vehicleType: input.vehicleType.slice(0, 40),
      make: input.make?.trim().slice(0, 40) || null,
      model: input.model?.trim().slice(0, 40) || null,
      plate: input.plate?.trim().slice(0, 20) || null,
      capacityKg: input.capacityKg
    }
  });
}

export async function providerForOwner(ownerId: string) {
  return prisma.logisticsProvider.findFirst({
    where: { ownerId },
    include: { vehicles: { where: { active: true } }, quotes: { orderBy: { createdAt: "desc" }, take: 20, include: { shipment: { select: { reference: true, originLabel: true, destinationLabel: true, status: true, customerId: true } } } } }
  });
}
