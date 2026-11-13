import { NextResponse } from "next/server";
import { requireVendor, jsonError } from "@/lib/auth/guard";
import { getVendorForUser } from "@/lib/services/core/seller.service";
import { listSellerCategories } from "@/lib/services/taxonomy/eligibility";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireVendor();
    const vendor = await getVendorForUser(user.id);
    return NextResponse.json(jsonSafe(await listSellerCategories(vendor.countryCode)));
  } catch (error) {
    return jsonError(error);
  }
}
