import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { capabilitiesForUi } from "@/lib/aura/chat";

export const dynamic = "force-dynamic";

/**
 * What Aura can do in this environment.
 *
 * Public: a visitor should be able to see the assistant's real scope before
 * signing in. It exposes only counts, capability states and whether a provider is
 * configured — never a key or a record.
 */
export async function GET() {
  try {
    const data = await capabilitiesForUi();
    return NextResponse.json(jsonSafe(data));
  } catch (error) {
    return jsonError(error);
  }
}
