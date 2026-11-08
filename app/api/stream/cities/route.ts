import { NextResponse } from "next/server";
import { listCities } from "@/lib/services/stream/cities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public city catalogue with per-city content counts. */
export async function GET() {
  const cities = await listCities();
  return NextResponse.json({ cities });
}
