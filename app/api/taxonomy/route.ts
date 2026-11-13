import { NextResponse } from "next/server";
import { getPublicTaxonomy } from "@/lib/services/taxonomy/public";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(jsonSafe(await getPublicTaxonomy()));
  } catch (error) {
    return jsonError(error);
  }
}
