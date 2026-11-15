import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { listCustomerTickets } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in to view your tickets." }, { status: 401 });
    const url = new URL(request.url);
    const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const pageSize = Math.max(Number(url.searchParams.get("pageSize") ?? 20) || 20, 1);
    return NextResponse.json(await listCustomerTickets(user.id, page, pageSize));
  } catch (error) {
    return jsonError(error);
  }
}
