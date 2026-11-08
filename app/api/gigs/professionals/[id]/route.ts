import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getGigProfessional } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getGigProfessional(params.id);
    if (!result) return NextResponse.json({ error: "Professional not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
