import { NextResponse } from "next/server";
import { listDriverRides } from "@/lib/services/core/drive.service";
import { jsonError, requireDriver } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireDriver();
    return NextResponse.json(jsonSafe(await listDriverRides(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
