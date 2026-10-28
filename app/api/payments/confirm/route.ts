import { NextResponse } from "next/server";
import { confirmPayment, getPaymentByReference } from "@/lib/payments/service";
import type { AdapterId } from "@/lib/payments/adapters";
import { ApiError, assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const allowed: AdapterId[] = ["wallet", "paystack", "flutterwave", "test"];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const reference = requireString(body.reference, "Payment reference", 200);
    const provider = requireString(body.provider, "Payment method", 30) as AdapterId;
    if (!allowed.includes(provider)) throw new ApiError(400, "unknown_provider", "Unknown payment method.");

    const payment = await getPaymentByReference(reference);
    if (payment.order.customerId !== user.id) {
      throw new ApiError(403, "forbidden", "This payment belongs to another account.");
    }

    const result = await confirmPayment({ reference, provider });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
