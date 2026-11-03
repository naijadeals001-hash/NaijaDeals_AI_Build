import { randomBytes, randomUUID } from "node:crypto";
import type { FreightServiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

export const FREIGHT_SERVICE_TYPES: FreightServiceType[] = ["bus", "air", "truck", "last_mile"];

export type FreightRow = {
  id: string;
  reference: string;
  customerId: string;
  serviceType: string;
  originCity: string;
  destinationCity: string;
  commodity: string;
  weightKg: number;
  dimensions: string | null;
  pickupRequired: boolean;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export const FREIGHT_STATUS_LABELS: Record<string, string> = {
  quote_requested: "Quote requested",
  quoted: "Quoted",
  carrier_assigned: "Carrier assigned",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function requireText(value: unknown, field: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) throw new ApiError(400, "validation_error", `${field} is required.`);
  if (text.length > max) throw new ApiError(400, "validation_error", `${field} must be at most ${max} characters.`);
  return text;
}

export async function createFreightRequest(input: {
  customerId: string;
  serviceType: string;
  originCity: string;
  destinationCity: string;
  commodity: string;
  weightKg: number;
  dimensions?: string;
  pickupRequired?: boolean;
  notes?: string;
}) {
  if (!FREIGHT_SERVICE_TYPES.includes(input.serviceType as FreightServiceType)) {
    throw new ApiError(400, "invalid_service_type", "Choose bus cargo, air freight, truck or last-mile pickup.");
  }
  if (!Number.isInteger(input.weightKg) || input.weightKg <= 0 || input.weightKg > 40000) {
    throw new ApiError(400, "invalid_weight", "Weight must be a whole number between 1 and 40000 kg.");
  }
  const originCity = requireText(input.originCity, "Origin city", 80);
  const destinationCity = requireText(input.destinationCity, "Destination city", 80);
  const commodity = requireText(input.commodity, "Commodity", 120);

  const reference = `NFS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  // Raw SQL keeps this working on a long-running dev server whose generated Prisma
  // client may predate the FreightRequest model.
  const rows = await prisma.$queryRaw<FreightRow[]>`
    INSERT INTO "FreightRequest" (id, reference, "customerId", "serviceType", "originCity", "destinationCity", commodity, "weightKg", dimensions, "pickupRequired", notes, status, "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${reference}, ${input.customerId}, ${input.serviceType}::"FreightServiceType", ${originCity}, ${destinationCity}, ${commodity}, ${input.weightKg}, ${input.dimensions?.trim() || null}, ${Boolean(input.pickupRequired)}, ${input.notes?.trim() || null}, 'quote_requested'::"FreightStatus", NOW(), NOW())
    RETURNING *`;
  const request = rows[0];
  await recordAudit({
    actorId: input.customerId,
    action: "freight.requested",
    entity: "FreightRequest",
    entityId: request.id,
    metadata: { reference, serviceType: request.serviceType, originCity, destinationCity, weightKg: request.weightKg }
  });
  return request;
}

export async function listFreightForCustomer(customerId: string) {
  return prisma.$queryRaw<FreightRow[]>`
    SELECT * FROM "FreightRequest" WHERE "customerId" = ${customerId} ORDER BY "createdAt" DESC LIMIT 50`;
}

export async function listFreightForAdmin() {
  return prisma.$queryRaw<Array<FreightRow & { customerName: string; customerEmail: string; customerPhone: string | null }>>`
    SELECT f.*, u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone"
    FROM "FreightRequest" f JOIN "User" u ON u.id = f."customerId"
    ORDER BY f."createdAt" DESC LIMIT 200`;
}
