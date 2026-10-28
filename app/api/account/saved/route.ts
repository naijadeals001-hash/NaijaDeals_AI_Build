import { NextResponse } from "next/server";
import { listSavedItems, toggleSavedItem } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listSavedItems(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const result = await toggleSavedItem(user.id, requireString(body.productId, "Product", 100));
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
