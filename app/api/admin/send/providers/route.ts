import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Control Center: transporter applications and verification.
 * Only a verified provider may quote, so this is the gate that turns an
 * application into a working marketplace participant.
 */
export async function GET() {
  try {
    await requireAdminPermission("vendors:read");
    const providers = await prisma.logisticsProvider.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, name: true, providerType: true, sourcePlatform: true, country: true, operatingCities: true,
        status: true, licenceRef: true, insuranceRef: true, capacityKg: true, createdAt: true, verifiedAt: true,
        owner: { select: { email: true, name: true } },
        _count: { select: { vehicles: true, quotes: true } }
      }
    });
    return NextResponse.json(jsonSafe(providers));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    const body = await readJson<Record<string, unknown>>(request);
    const providerId = String(body.providerId ?? "");
    const action = String(body.action ?? "").toUpperCase();
    if (!["VERIFY", "REJECT", "SUSPEND"].includes(action)) throw new ApiError(400, "invalid_action", "action must be VERIFY, REJECT or SUSPEND.");
    const provider = await prisma.logisticsProvider.findUnique({ where: { id: providerId }, select: { id: true, name: true, status: true } });
    if (!provider) throw new ApiError(404, "provider_not_found", "Provider not found.");
    const next = action === "VERIFY" ? "verified" : action === "REJECT" ? "rejected" : "suspended";
    const updated = await prisma.logisticsProvider.update({
      where: { id: provider.id },
      data: { status: next, ...(action === "VERIFY" ? { verifiedAt: new Date() } : {}) }
    });
    await recordAudit({ actorId: admin.id, action: `logistics_provider.${next}`, entity: "LogisticsProvider", entityId: provider.id, metadata: { from: provider.status, to: next } });
    return NextResponse.json(jsonSafe({ id: updated.id, status: updated.status }));
  } catch (error) {
    return jsonError(error);
  }
}
