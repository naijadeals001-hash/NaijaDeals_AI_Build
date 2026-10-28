import { NextResponse } from "next/server";
import { deleteAddress } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";

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
