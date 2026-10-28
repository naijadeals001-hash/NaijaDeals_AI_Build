import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { availablePaymentMethods, listPaymentMethods } from "@/lib/payments/service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const countryCode = (request.nextUrl.searchParams.get("country") || "NG").toUpperCase();
  const includeUnconfigured = request.nextUrl.searchParams.get("all") === "true";
  const methods = includeUnconfigured ? listPaymentMethods(countryCode) : availablePaymentMethods(countryCode);
  return NextResponse.json(jsonSafe({ countryCode, methods }));
}
