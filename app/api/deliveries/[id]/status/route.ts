import type { DeliveryStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDeliveryStatus } from "@/lib/services/core/delivery.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 40) as DeliveryStatus;
    const delivery = await prisma.$transaction((tx) =>
      updateDeliveryStatus({
        tx,
        actorId: admin.id,
        deliveryId: params.id,
        status,
        note: typeof body.note === "string" ? body.note : undefined,
        proofCode: typeof body.proofCode === "string" ? body.proofCode : undefined
      })
    );
    return NextResponse.json(jsonSafe(delivery));
  } catch (error) {
    return jsonError(error);
  }
}
