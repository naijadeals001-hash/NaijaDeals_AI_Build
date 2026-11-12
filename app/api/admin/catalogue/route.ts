import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listCatalogue } from "@/lib/services/core/catalogue-admin.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("products:read");
    return NextResponse.json(jsonSafe(await listCatalogue(admin)));
  } catch (error) {
    return jsonError(error);
  }
}
