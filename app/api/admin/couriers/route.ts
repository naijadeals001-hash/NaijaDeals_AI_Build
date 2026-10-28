import { NextResponse } from "next/server";
import { listCouriers } from "@/lib/services/core/admin.service";
import { jsonError, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(jsonSafe(await listCouriers()));
  } catch (error) {
    return jsonError(error);
  }
}
