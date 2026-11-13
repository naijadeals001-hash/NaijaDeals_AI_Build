import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { resolveCategoryRequest } from "@/lib/services/taxonomy/admin";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(
      jsonSafe(await resolveCategoryRequest({ actor: admin, requestId: params.id, body }))
    );
  } catch (error) {
    return jsonError(error);
  }
}
