import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

/**
 * Admin verification of NaijaFresh farms.
 *
 * Farmer applications create farms with `verified: false`, and unverified farms
 * cannot publish listings or appear in the catalogue. Without this endpoint no
 * real farmer could ever go live, so it is the only path to verification.
 */
export async function GET() {
  try {
    await requireAdminPermission("vendors:read");
    const farms = await prisma.farm.findMany({
      orderBy: [{ verified: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, slug: true, name: true, farmerName: true, country: true, state: true, city: true, verified: true, isSample: true, createdAt: true, owner: { select: { email: true } }, _count: { select: { listings: true } } }
    });
    return NextResponse.json(jsonSafe(farms));
  } catch (error) {
    return jsonError(error);
  }
}

const ACTIONS = ["VERIFY", "REVOKE"] as const;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const farmId = String(body.farmId ?? "");
    const action = String(body.action ?? "").toUpperCase();
    if (!(ACTIONS as readonly string[]).includes(action)) throw new ApiError(400, "invalid_action", "action must be VERIFY or REVOKE.");
    await requireAdminPermission("vendors:review");
    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, name: true, verified: true, isSample: true } });
    if (!farm) throw new ApiError(404, "farm_not_found", "Farm not found.");
    if (farm.isSample && action === "VERIFY") throw new ApiError(400, "sample_farm", "Demonstration farms are not verified as real farmers.");

    const updated = await prisma.farm.update({
      where: { id: farm.id },
      data: action === "VERIFY" ? { verified: true, verifiedAt: new Date() } : { verified: false, verifiedAt: null }
    });
    await recordAudit({ actorId: admin.id, action: action === "VERIFY" ? "fresh_farm.verified" : "fresh_farm.verification_revoked", entity: "Farm", entityId: farm.id, metadata: { name: farm.name } });
    return NextResponse.json(jsonSafe({ id: updated.id, verified: updated.verified }));
  } catch (error) {
    return jsonError(error);
  }
}
