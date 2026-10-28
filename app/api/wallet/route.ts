import { NextResponse } from "next/server";
import { getWalletForUser } from "@/lib/services/core/wallet.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getWalletForUser(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
