import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { isVariantKey, VISITOR_COOKIE } from "@/lib/home/assignment";

export const dynamic = "force-dynamic";

/**
 * Pins the visitor's assigned variant and issues the anonymous first-party id.
 * The id is a random string; no personal data is stored with it.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 64) : "";
    const variant = String(body.variant ?? "");
    if (!/^[a-f0-9]{32}$/.test(visitorId)) return NextResponse.json({ error: "invalid_visitor" }, { status: 400 });
    if (!isVariantKey(variant)) return NextResponse.json({ error: "invalid_variant" }, { status: 400 });
    await prisma.homeAssignment.upsert({ where: { visitorId }, update: {}, create: { visitorId, variantKey: variant } });
    const response = NextResponse.json({ pinned: true, variant });
    response.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
