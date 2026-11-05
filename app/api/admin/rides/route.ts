import { NextResponse } from "next/server";
import { listAllRides } from "@/lib/services/core/drive.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAdminPermission("rides:read");
    return NextResponse.json(jsonSafe({ rides: await listAllRides(), adminId: user.id }));
  } catch (error) {
    return jsonError(error);
  }
}
