import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { STATE_LABELS } from "@/lib/services/send/state-machine";

export const dynamic = "force-dynamic";

/**
 * The transporter's job list. Jobs are resolved from shipment ASSIGNMENTS only:
 * a provider sees a shipment because the database says it was assigned that
 * shipment — not because it appears in a URL or the provider happens to be online.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const provider = await prisma.logisticsProvider.findFirst({ where: { ownerId: user.id }, select: { id: true, name: true, status: true, providerType: true } });
    if (!provider) throw new ApiError(404, "provider_missing", "You are not registered as a NaijaSend transporter.");

    const assignments = await prisma.shipmentAssignment.findMany({
      where: { providerId: provider.id, revokedAt: null },
      orderBy: { assignedAt: "desc" },
      take: 50,
      include: {
        shipment: {
          select: {
            id: true,
            reference: true,
            trackingNumber: true,
            originVertical: true,
            sourceReference: true,
            transportState: true,
            version: true,
            originLabel: true,
            destinationLabel: true,
            description: true,
            weightKg: true,
            quantity: true,
            recipientName: true,
            recipientPhone: true,
            pickupVerifiedAt: true,
            deliveryVerifiedAt: true,
            assignedAt: true
          }
        }
      }
    });

    const jobs = assignments.map((row) => ({
      ...row.shipment,
      stateLabel: STATE_LABELS[row.shipment.transportState] ?? row.shipment.transportState,
      assignmentId: row.id
    }));
    const active = jobs.filter((job) => !["delivered", "completed", "cancelled"].includes(job.transportState));
    return NextResponse.json(jsonSafe({ provider, active, history: jobs.filter((job) => !active.includes(job)) }));
  } catch (error) {
    return jsonError(error);
  }
}
