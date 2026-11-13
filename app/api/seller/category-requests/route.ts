import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireActiveVendor, requireVendor } from "@/lib/auth/guard";
import { getVendorForUser } from "@/lib/services/core/seller.service";
import { createSellerCategoryRequest, listSellerCategoryRequests } from "@/lib/services/taxonomy/requests";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireVendor();
    const vendor = await getVendorForUser(user.id);
    return NextResponse.json(jsonSafe(await listSellerCategoryRequests(vendor.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveVendor();
    const vendor = await getVendorForUser(user.id);
    const body = await readJson<Record<string, unknown>>(request);
    const created = await createSellerCategoryRequest({ sellerId: vendor.id, actorId: user.id, body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
