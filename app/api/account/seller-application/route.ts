import { NextResponse } from "next/server";
import { getSellerApplication, submitSellerApplication } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getSellerApplication(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const application = await submitSellerApplication(user.id, {
      businessName: requireString(body.businessName, "Business name", 120),
      market: requireString(body.market, "Market", 120),
      countryCode: (requireString(body.countryCode, "Country", 2) || "NG").toUpperCase(),
      pickupAddress: requireString(body.pickupAddress, "Pickup address", 300),
      phone: requireString(body.phone, "Phone", 40),
      category: requireString(body.category, "Category", 100)
    });
    return NextResponse.json(jsonSafe(application), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
