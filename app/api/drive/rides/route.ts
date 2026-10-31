import { NextResponse } from "next/server";
import type { RidePaymentMethod } from "@prisma/client";
import { listRidesForRider, requestRide } from "@/lib/services/core/drive.service";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireString,
  requireUser
} from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listRidesForRider(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const paymentMethod = requireString(body.paymentMethod, "Payment method", 20) as RidePaymentMethod;
    const ride = await requestRide({
      riderId: user.id,
      pickupId: requireString(body.pickupId, "Pick-up point", 80),
      dropoffId: requireString(body.dropoffId, "Drop-off point", 80),
      vehicleClassId: requireString(body.vehicleClass, "Vehicle class", 20),
      paymentMethod
    });
    return NextResponse.json(jsonSafe(ride), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
