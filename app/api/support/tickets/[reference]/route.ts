import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { jsonError } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { GUEST_ACCESS_COOKIE, getCustomerTicket } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: { reference: string } }) {
  try {
    const user = await getSessionUser();
    const guestToken = cookies().get(GUEST_ACCESS_COOKIE)?.value ?? null;
    const ticket = await getCustomerTicket(context.params.reference, { userId: user?.id ?? null, guestToken });
    return NextResponse.json(ticket);
  } catch (error) {
    return jsonError(error);
  }
}
