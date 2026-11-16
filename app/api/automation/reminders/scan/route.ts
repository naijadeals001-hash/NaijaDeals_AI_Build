import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { requireAutomationConsumer } from "@/lib/services/core/automation-auth";
import { runOperationalScan } from "@/lib/services/core/operations-automation.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };

/**
 * Runs the operations scans: onboarding reminders, the daily report and the
 * backup-staleness check.
 *
 * Bearer-token authenticated server-to-server call with no body and no Origin
 * requirement (same reason as the notification drain route). Every write is an
 * intent protected by its own dedupe key, so the scheduler may call this as
 * often as it likes; a second call on the same UTC day creates nothing.
 */
export async function POST(request: NextRequest) {
  try {
    requireAutomationConsumer(request);
    const result = await runOperationalScan();
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
