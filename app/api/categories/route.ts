import { NextResponse } from "next/server";
import { getCategories } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(jsonSafe(await getCategories()));
}
