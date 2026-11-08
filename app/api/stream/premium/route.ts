import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { currentSubscription, billingHistory, subscribeWithWallet, cancelSubscription } from "@/lib/services/stream/subscriptions";
import { availablePaymentMethods } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/** The listener's current subscription, billing history and provider readiness. */
export async function GET() {
  try {
    const user = await requireUser();
    const [subscription, history] = await Promise.all([currentSubscription(user.id), billingHistory(user.id)]);
    const providers = availablePaymentMethods("NG").map((m) => m.id);
    return NextResponse.json(jsonSafe({ subscription, history, providers, cardBillingEnabled: providers.some((p) => p !== "wallet") }));
  } catch (error) {
    return jsonError(error);
  }
}

/** action: "subscribe" (paid from the NaijaPay wallet) | "cancel". */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (body.action === "cancel") {
      return NextResponse.json(jsonSafe(await cancelSubscription(user.id)));
    }
    const planCode = requireString(body.planCode, "Plan", 20).toUpperCase();
    return NextResponse.json(jsonSafe(await subscribeWithWallet(user.id, planCode)), { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
