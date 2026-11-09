import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Registers (or refreshes) this device for the signed-in user. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const platform = ["web", "android", "ios"].includes(String(body.platform)) ? String(body.platform) : "web";
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null;
    const capabilities = body.capabilities ? JSON.stringify(body.capabilities).slice(0, 2000) : null;

    const existing = await prisma.deviceRegistration.findFirst({ where: { userId: user.id, platform, revokedAt: null }, select: { id: true } });
    const device = existing
      ? await prisma.deviceRegistration.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), appVersion, capabilities } })
      : await prisma.deviceRegistration.create({ data: { userId: user.id, platform, appVersion, capabilities } });
    return NextResponse.json(jsonSafe({ deviceId: device.id, platform: device.platform }), { status: existing ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/** Revokes this device (used when a user signs out of a shared phone). */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request).catch(() => ({}) as Record<string, unknown>);
    const deviceId = String(body.deviceId ?? "");
    await prisma.deviceRegistration.updateMany({ where: { id: deviceId, userId: user.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return jsonError(error);
  }
}
