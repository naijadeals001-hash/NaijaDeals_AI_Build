import { NextResponse } from "next/server";
import { getAccountSummary } from "@/lib/services/core/account.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
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
