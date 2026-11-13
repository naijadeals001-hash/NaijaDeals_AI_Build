import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireVendor, jsonError } from "@/lib/auth/guard";
import { getVendorForUser } from "@/lib/services/core/seller.service";
import { suggestSellerCategories } from "@/lib/services/taxonomy/eligibility";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireVendor();
    const vendor = await getVendorForUser(user.id);
    const query = request.nextUrl.searchParams.get("q") ?? "";
    // Model assistance is opt-in. Without `assist=aura` this route stays the
    // deterministic alias/name search documented in the taxonomy contract.
    const assist = request.nextUrl.searchParams.get("assist") === "aura" ? "aura" : undefined;
    return NextResponse.json(
      jsonSafe(
        await suggestSellerCategories({
          countryCode: vendor.countryCode,
          query,
          userId: user.id,
          ...(assist ? { assist } : {})
        })
      )
    );
  } catch (error) {
    return jsonError(error);
  }
}
