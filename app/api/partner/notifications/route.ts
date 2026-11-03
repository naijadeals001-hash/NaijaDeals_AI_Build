import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listNotifications, markNotificationsRead } from "@/lib/services/core/notification.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await listNotifications(user.id);
    return NextResponse.json(jsonSafe({ notifications: rows, unread: rows.filter((row) => !row.readAt).length }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (body.markAllRead === true) await markNotificationsRead(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
