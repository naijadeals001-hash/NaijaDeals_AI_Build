import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { NotificationCategory, NotificationChannel } from "@prisma/client";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { listPreferences, setNotificationPreference } from "@/lib/services/core/notification-delivery.service";

/**
 * Per-channel, per-category opt-outs.
 *
 * A missing row means enabled, so the list endpoint reports the effective state
 * rather than only the rows a user has changed. ACCOUNT and SYSTEM cannot be
 * switched off: those are verification and security messages.
 */

export const dynamic = "force-dynamic";

const CHANNELS: NotificationChannel[] = ["IN_APP", "EMAIL", "SMS", "PUSH"];
const CATEGORIES: NotificationCategory[] = [
  "ORDERS",
  "PAYMENTS",
  "DISPATCH",
  "BOOKINGS",
  "SHIPMENTS",
  "ACCOUNT",
  "MARKETING",
  "SYSTEM"
];
const MANDATORY: NotificationCategory[] = ["ACCOUNT", "SYSTEM"];

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await listPreferences(user.id);
    const stored = new Map(rows.map((row) => [`${row.channel}:${row.category}`, row.enabled]));

    return NextResponse.json({
      preferences: CHANNELS.flatMap((channel) =>
        CATEGORIES.map((category) => ({
          channel,
          category,
          enabled: MANDATORY.includes(category) ? true : (stored.get(`${channel}:${category}`) ?? true),
          mandatory: MANDATORY.includes(category)
        }))
      )
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      channel?: string;
      category?: string;
      enabled?: boolean;
    };

    if (!body.channel || !CHANNELS.includes(body.channel as NotificationChannel)) {
      return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
    }
    if (!body.category || !CATEGORIES.includes(body.category as NotificationCategory)) {
      return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "invalid_enabled" }, { status: 400 });
    }

    const outcome = await setNotificationPreference({
      userId: user.id,
      channel: body.channel as NotificationChannel,
      category: body.category as NotificationCategory,
      enabled: body.enabled
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.reason }, { status: 409 });
    }
    return NextResponse.json({ preference: outcome.preference });
  } catch (error) {
    return jsonError(error);
  }
}
