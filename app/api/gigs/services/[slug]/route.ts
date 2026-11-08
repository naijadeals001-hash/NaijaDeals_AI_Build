import { NextResponse } from "next/server";
import type { ServiceMode, ServicePricingType } from "@prisma/client";
import { assertSameOrigin, jsonError, optionalString, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getGigServiceBySlug, updateServiceListing } from "@/lib/services/gigs/service";
import { oneOf, optionalMoney } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

const MODES: readonly ServiceMode[] = ["LOCAL", "REMOTE", "PROJECT"];
const PRICING: readonly ServicePricingType[] = ["HOURLY", "FIXED", "QUOTE"];

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const result = await getGigServiceBySlug(params.slug);
    if (!result) return NextResponse.json({ error: "Service not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const updated = await updateServiceListing(user.id, params.slug, {
      title: optionalString(body.title) ?? undefined,
      summary: optionalString(body.summary) ?? undefined,
      description: optionalString(body.description, 4000) ?? undefined,
      mode: body.mode === undefined ? undefined : oneOf(body.mode, MODES, "Service mode"),
      pricingType: body.pricingType === undefined ? undefined : oneOf(body.pricingType, PRICING, "Pricing type"),
      priceKobo: body.priceKobo === undefined ? undefined : optionalMoney(body.priceKobo, "Price"),
      status: body.status === undefined ? undefined : oneOf(body.status, ["DRAFT", "ACTIVE", "PAUSED"] as const, "Status"),
      imageUrl: body.imageUrl === undefined ? undefined : optionalString(body.imageUrl, 500)
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
