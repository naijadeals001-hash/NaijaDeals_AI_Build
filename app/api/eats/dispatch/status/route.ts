import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { confirmDelivery, confirmPickup } from "@/lib/services/eats/dispatch";

export const dynamic = "force-dynamic";

/** Provider confirms pickup or delivery with the PIN issued for that order. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const step = String(body.step ?? "");
    const dispatchId = String(body.dispatchId ?? "");
    const pin = String(body.pin ?? "");
    if (step !== "pickup" && step !== "delivery") throw new ApiError(400, "invalid_step", "step must be pickup or delivery.");

    const [courier, driver] = await Promise.all([
      prisma.courier.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.driverProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    ]);
    const identity = courier ? { providerType: "courier" as const, providerId: courier.id } : driver ? { providerType: "driver" as const, providerId: driver.id } : null;
    if (!identity) throw new ApiError(403, "not_a_provider", "This account is not a delivery provider.");

    const result =
      step === "pickup"
        ? await confirmPickup({ ...identity, dispatchId, pin, actorId: user.id })
        : await confirmDelivery({ ...identity, dispatchId, pin, actorId: user.id });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
