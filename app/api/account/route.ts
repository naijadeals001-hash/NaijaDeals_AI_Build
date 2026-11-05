import { NextResponse } from "next/server";
import { getAccountSummary, updateProfile } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getAccountSummary(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const updated = await updateProfile(user.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined
    });
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
