import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, readJson } from "@/lib/auth/guard";
import { requireAutomationConsumer } from "@/lib/services/core/automation-auth";
import { processIntents } from "@/lib/notifications/intent.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };

/**
 * Drain due notification intents.
 *
 * The n8n consumer calls this after an application event has been recorded in
 * the transactional outbox. Claiming, lease fencing, bounded retries and
 * dead-letter handling live in the shared intent service, so this route can be
 * called repeatedly and concurrently without duplicating a notification.
 */
export async function POST(request: NextRequest) {
  try {
    // Bearer-token authenticated server-to-server call: CSRF origin checks do
    // not apply, and n8n legitimately sends no Origin header.
    requireAutomationConsumer(request);
    const body = await readJson<{ limit?: unknown }>(request).catch(() => ({}) as { limit?: unknown });
    const raw = Number(body.limit ?? 10);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 50) : 10;
    const run = await processIntents(`automation:${process.pid}:${Date.now()}`, limit);
    return NextResponse.json({ ok: true, ...run }, { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
