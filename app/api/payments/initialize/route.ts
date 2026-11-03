import { NextResponse } from "next/server";
import { initializePayment } from "@/lib/payments/service";
import { assertProviderOperation } from "@/lib/payments/boundary";
import type { AdapterId } from "@/lib/payments/adapters";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const allowed: AdapterId[] = ["wallet", "paystack", "flutterwave", "test"];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const provider = requireString(body.provider, "Payment method", 30) as AdapterId;
    if (!allowed.includes(provider)) {
      return NextResponse.json({ error: "Unknown payment method.", code: "unknown_provider" }, { status: 400 });
    }
    if (provider === "paystack" || provider === "flutterwave") {
      await assertProviderOperation("Payment initialisation via " + provider, provider);
    }
    const origin = new URL(request.url).origin;
    const result = await initializePayment({
      orderId: requireString(body.orderId, "Order", 100),
      userId: user.id,
      provider,
      callbackUrl: `${origin}/orders?payment=return`
    });
    return NextResponse.json(jsonSafe(result), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
