import { NextResponse } from "next/server";
import { listEatsRestaurants } from "@/lib/services/core/eats.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(jsonSafe(await listEatsRestaurants()));
  } catch (error) {
    return jsonError(error);
  }
}
