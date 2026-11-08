import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listGigProfessionals } from "@/lib/services/gigs/service";
import { pageParams } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { params, page, pageSize } = pageParams(request.url);
    const result = await listGigProfessionals({
      q: params.get("q")?.slice(0, 120) || undefined,
      category: params.get("category") || undefined,
      countryCode: params.get("countryCode")?.slice(0, 2).toUpperCase() || undefined,
      city: params.get("city")?.slice(0, 80) || undefined,
      page,
      pageSize
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
