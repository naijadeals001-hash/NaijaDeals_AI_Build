import type { PaymentIntent, ServiceResult } from "@/lib/services/types";

export async function createPaymentIntent(orderId: string, amountKobo: number, provider: PaymentIntent["provider"]): ServiceResult<PaymentIntent> {
  // TODO(backend): Create Paystack/Flutterwave/wallet intent and persist provider reference + idempotency key.
  return { id: "pay_demo_2843", orderId, provider, amountKobo, status: "pending" };
}

export async function verifyPaymentWebhook(signature: string, payload: unknown): ServiceResult<boolean> {
  // TODO(backend): Verify provider signature with PAYMENT_WEBHOOK_SECRET before mutating order or ledger state.
  void signature;
  void payload;
  return false;
}
