import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { acceptOffer, declineOffer } from "@/lib/services/eats/dispatch";

export const dynamic = "force-dynamic";

/** Accept or decline a delivery offer. Acceptance is atomic across providers. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "").toLowerCase();
    if (action !== "accept" && action !== "decline") throw new ApiError(400, "invalid_action", "action must be accept or decline.");

    const [courier, driver] = await Promise.all([
      prisma.courier.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.driverProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    ]);
    const identity = courier ? { providerType: "courier" as const, providerId: courier.id } : driver ? { providerType: "driver" as const, providerId: driver.id } : null;
    if (!identity) throw new ApiError(403, "not_a_provider", "This account is not a delivery provider.");

    const result = action === "accept" ? await acceptOffer(identity.providerType, identity.providerId, params.id, user.id) : await declineOffer(identity.providerType, identity.providerId, params.id);
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
