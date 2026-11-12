import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createProduct, publishProduct, unpublishProduct, updateProduct } from "@/lib/services/core/catalogue-admin.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const product = await createProduct({
      actorId: admin.id,
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      priceKobo: body.priceKobo,
      categoryId: String(body.categoryId ?? ""),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      isDemo: Boolean(body.isDemo)
    });
    return NextResponse.json(jsonSafe(product), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const id = String(body.id ?? "");
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "publish") return NextResponse.json(jsonSafe(await publishProduct({ actorId: admin.id, id })));
    if (action === "unpublish") return NextResponse.json(jsonSafe(await unpublishProduct({ actorId: admin.id, id })));
    if (action) return NextResponse.json({ error: "Unsupported action.", code: "invalid_action" }, { status: 400 });
    const product = await updateProduct({
      actorId: admin.id,
      id,
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      priceKobo: body.priceKobo,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      isDemo: typeof body.isDemo === "boolean" ? body.isDemo : undefined
    });
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    return jsonError(error);
  }
}
