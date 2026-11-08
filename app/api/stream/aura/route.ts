import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { askAura, catalogueSnapshot } from "@/lib/services/stream/aura";

export const dynamic = "force-dynamic";

/** Catalogue facts Aura can answer from (public). */
export async function GET() {
  try {
    return NextResponse.json(jsonSafe(await catalogueSnapshot()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(jsonSafe(await askAura(requireString(body.question, "Question", 300))));
  } catch (error) {
    return jsonError(error);
  }
}
