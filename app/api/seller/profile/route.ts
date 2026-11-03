import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getVendorForUser, updateSellerProfile } from "@/lib/services/core/seller.service";
import { assertSameOrigin, jsonError, readJson, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireVendor();
    return NextResponse.json(jsonSafe(await getVendorForUser(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireVendor();
    const patch = await readJson<Record<string, unknown>>(request);
    const updated = await updateSellerProfile({ userId: user.id, actorId: user.id, patch });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
