import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { assertRegion } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("countries:editorial:read");
    const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Country code is required.", code: "validation_error" }, { status: 400 });
    assertRegion(admin, { countryCode: code }, "country audit");
    const themes = await prisma.countryTheme.findMany({ where: { countryCode: code }, select: { id: true } });
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: "CountryProfile", entityId: code },
          { entity: "CountryTheme", entityId: { in: themes.map((theme) => theme.id) } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true } }
      }
    });
    return NextResponse.json(jsonSafe(logs));
  } catch (error) {
    return jsonError(error);
  }
}
