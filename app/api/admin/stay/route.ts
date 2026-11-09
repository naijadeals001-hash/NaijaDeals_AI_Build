import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

/** Control Center view of stays: hosts awaiting review and listings awaiting moderation. */
export async function GET() {
  try {
    await requireAdminPermission("vendors:read");
    const [hosts, properties] = await Promise.all([
      prisma.stayHost.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, select: { id: true, displayName: true, country: true, status: true, documentRef: true, createdAt: true, owner: { select: { email: true } }, _count: { select: { properties: true } } } }),
      prisma.stayProperty.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, select: { id: true, title: true, slug: true, city: true, country: true, listingType: true, status: true, isDemo: true, createdAt: true } })
    ]);
    return NextResponse.json(jsonSafe({ hosts, properties }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Approve, reject or suspend a host or a listing. Every action is audited. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    const body = await readJson<Record<string, unknown>>(request);
    const target = String(body.target ?? "");
    const id = String(body.id ?? "");
    const action = String(body.action ?? "").toUpperCase();
    if (!["VERIFY", "REJECT", "SUSPEND"].includes(action)) throw new ApiError(400, "invalid_action", "action must be VERIFY, REJECT or SUSPEND.");
    const next = action === "VERIFY" ? "verified" : action === "REJECT" ? "rejected" : "suspended";

    if (target === "host") {
      const updated = await prisma.stayHost.update({ where: { id }, data: { status: next, ...(action === "VERIFY" ? { verifiedAt: new Date() } : {}) } });
      await recordAudit({ actorId: admin.id, action: `stay_host.${next}`, entity: "StayHost", entityId: id, metadata: { to: next } });
      return NextResponse.json(jsonSafe({ id: updated.id, status: updated.status }));
    }
    if (target === "property") {
      // A listing becomes bookable only on approval; suspension hides it immediately.
      const status = action === "VERIFY" ? "published" : action === "REJECT" ? "rejected" : "suspended";
      const updated = await prisma.stayProperty.update({ where: { id }, data: { status } });
      await recordAudit({ actorId: admin.id, action: `stay_property.${next}`, entity: "StayProperty", entityId: id, metadata: { to: status } });
      return NextResponse.json(jsonSafe({ id: updated.id, status: updated.status }));
    }
    throw new ApiError(400, "invalid_target", "target must be host or property.");
  } catch (error) {
    return jsonError(error);
  }
}
