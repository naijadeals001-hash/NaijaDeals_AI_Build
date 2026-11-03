import { NextResponse } from "next/server";
import { getStorefrontConfig } from "@/lib/services/core/storefront.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(jsonSafe(await getStorefrontConfig()));
  } catch (error) {
    return jsonError(error);
  }
}
