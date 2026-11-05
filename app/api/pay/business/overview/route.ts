import { NextResponse } from "next/server";
import { jsonError, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { businessOverview } from "@/lib/services/core/business-finance.service";

export const dynamic = "force-dynamic";

/** NaijaPay Business overview, scoped to the session user's own vendor account. */
export async function GET() {
  try {
    const user = await requireVendor();
    return NextResponse.json(jsonSafe(await businessOverview(user.vendors[0].id)));
  } catch (error) {
    return jsonError(error);
  }
}
