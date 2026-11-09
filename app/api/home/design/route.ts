import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { isVariantKey, resolveVariant, VISITOR_COOKIE, DESIGN_COOKIE } from "@/lib/home/assignment";

export const dynamic = "force-dynamic";

/** Records a manual design choice. A choice always overrides automatic assignment. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const variant = String(body.variant ?? "");
    if (!isVariantKey(variant)) return NextResponse.json({ error: "Choose one of the four designs." }, { status: 400 });
    const enabled = await prisma.homeVariant.findUnique({ where: { key: variant }, select: { enabled: true } });
    if (enabled && !enabled.enabled) return NextResponse.json({ error: "That design is not currently available." }, { status: 409 });

    const resolved = await resolveVariant();
    if (resolved.visitorId) {
      await prisma.homeAssignment.upsert({ where: { visitorId: resolved.visitorId }, update: { variantKey: variant, manual: true }, create: { visitorId: resolved.visitorId, variantKey: variant, manual: true } });
    }
    const response = NextResponse.json({ variant, manual: true });
    response.cookies.set(DESIGN_COOKIE, variant, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    if (resolved.visitorId) response.cookies.set(VISITOR_COOKIE, resolved.visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
