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
  carrierName: string | null;
  quoteKobo: bigint | null;
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

export const FREIGHT_ACTIONS = ["quote", "assign", "transit", "deliver", "cancel"] as const;
export type FreightAction = (typeof FREIGHT_ACTIONS)[number];

const ACTION_TARGET: Record<Exclude<FreightAction, "cancel">, string> = {
  quote: "quoted",
  assign: "carrier_assigned",
  transit: "in_transit",
  deliver: "delivered"
};

const ACTION_ALLOWED_FROM: Record<FreightAction, string[]> = {
  quote: ["quote_requested"],
  assign: ["quoted"],
  transit: ["carrier_assigned"],
  deliver: ["in_transit"],
  cancel: ["quote_requested", "quoted", "carrier_assigned", "in_transit"]
};

export async function updateFreightRequest(input: {
  adminId: string;
  requestId: string;
  action: FreightAction;
  quoteKobo?: string;
  carrierName?: string;
  note?: string;
}) {
  if (!FREIGHT_ACTIONS.includes(input.action)) {
    throw new ApiError(400, "invalid_action", "Unknown freight action.");
  }
  const rows = await prisma.$queryRaw<FreightRow[]>`SELECT * FROM "FreightRequest" WHERE id = ${input.requestId} LIMIT 1`;
  const current = rows[0];
  if (!current) throw new ApiError(404, "freight_not_found", "Freight request not found.");
  if (!ACTION_ALLOWED_FROM[input.action].includes(current.status)) {
    throw new ApiError(409, "invalid_transition", `Cannot ${input.action} a request in ${FREIGHT_STATUS_LABELS[current.status] ?? current.status}.`);
  }

  const note = input.note?.trim() || null;
  let status = input.action === "cancel" ? "cancelled" : ACTION_TARGET[input.action];
  let quoteKobo: bigint | null = null;
  let carrierName: string | null = current.carrierName ?? null;

  if (input.action === "quote") {
    const amount = BigInt(String(input.quoteKobo ?? "0"));
    if (amount <= BigInt(0)) throw new ApiError(400, "invalid_quote", "Quote amount must be greater than zero.");
    quoteKobo = amount;
    if (input.carrierName?.trim()) carrierName = input.carrierName.trim();
    if (!carrierName) throw new ApiError(400, "carrier_required", "Name the carrier or service for this quote.");
  }
  if (input.action === "assign") {
    if (!input.carrierName?.trim()) throw new ApiError(400, "carrier_required", "Name the carrier for this shipment.");
    carrierName = input.carrierName.trim();
  }

  const updatedRows = await prisma.$queryRaw<FreightRow[]>`
    UPDATE "FreightRequest"
    SET status = ${status}::"FreightStatus",
        "carrierName" = ${carrierName},
        "quoteKobo" = COALESCE(${quoteKobo}, "quoteKobo"),
        "updatedAt" = NOW()
    WHERE id = ${current.id}
    RETURNING *`;
  const updated = updatedRows[0];

  await prisma.$executeRaw`
    INSERT INTO "FreightEvent" (id, "requestId", status, note, "actorId", "createdAt")
    VALUES (${randomUUID()}, ${current.id}, ${status}::"FreightStatus", ${note}, ${input.adminId}, NOW())`;

  await recordAudit({
    actorId: input.adminId,
    action: "freight.status_changed",
    entity: "FreightRequest",
    entityId: current.id,
    metadata: {
      reference: current.reference,
      action: input.action,
      before: { status: current.status },
      after: { status: updated.status, carrierName: updated.carrierName, quoteKobo: updated.quoteKobo?.toString() ?? null },
      note
    }
  });
  return updated;
}

export async function listFreightForCustomer(customerId: string) {
  return prisma.$queryRaw<Array<FreightRow & { events: unknown }>>`
    SELECT f.*, COALESCE(
      json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt")
      FILTER (WHERE e.id IS NOT NULL), '[]'
    ) AS events
    FROM "FreightRequest" f
    LEFT JOIN "FreightEvent" e ON e."requestId" = f.id
    WHERE f."customerId" = ${customerId}
    GROUP BY f.id
    ORDER BY f."createdAt" DESC LIMIT 50`;
}

export async function listFreightForAdmin() {
  return prisma.$queryRaw<Array<FreightRow & { customerName: string; customerEmail: string; customerPhone: string | null; events: unknown }>>`
    SELECT f.*, u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone",
      COALESCE(json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt")
        FILTER (WHERE e.id IS NOT NULL), '[]') AS events
    FROM "FreightRequest" f
    JOIN "User" u ON u.id = f."customerId"
    LEFT JOIN "FreightEvent" e ON e."requestId" = f.id
    GROUP BY f.id, u.name, u.email, u.phone
    ORDER BY f."createdAt" DESC LIMIT 200`;
}
