import { NextResponse } from "next/server";
import { processWebhook } from "@/lib/payments/service";
import { ApiError, jsonError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (params.provider !== "paystack" && params.provider !== "flutterwave") {
      throw new ApiError(404, "webhook_not_found", "No webhook handler for this provider.");
    }
    const rawBody = await request.text();
    if (!rawBody) throw new ApiError(400, "empty_body", "Webhook body is empty.");
    const result = await processWebhook(params.provider, rawBody, request.headers);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
