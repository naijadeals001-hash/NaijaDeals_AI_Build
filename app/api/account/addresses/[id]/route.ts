import { NextResponse } from "next/server";
import { deleteAddress, updateAddress } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json(await deleteAddress(user.id, params.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const address = await updateAddress(user.id, params.id, {
      label: typeof body.label === "string" ? body.label : undefined,
      city: typeof body.city === "string" ? body.city : undefined,
      state: typeof body.state === "string" ? body.state : undefined,
      line1: typeof body.line1 === "string" ? body.line1 : undefined,
      line2: typeof body.line2 === "string" ? body.line2 : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined
    });
    return NextResponse.json(address);
  } catch (error) {
    return jsonError(error);
  }
}
