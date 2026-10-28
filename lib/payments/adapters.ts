import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentAdapter, PaymentInitInput, PaymentInitResult, PaymentVerifyResult, WebhookResult } from "./types";

const PAYSTACK_BASE = "https://api.paystack.co";
const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export function isTestPaymentsEnabled() {
  return process.env.ENABLE_TEST_PAYMENTS === "true" && process.env.NODE_ENV !== "production";
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message =
      (body as { message?: string })?.message || `Payment provider returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const walletAdapter: PaymentAdapter = {
  id: "wallet",
  label: "NaijaPay wallet",
  description: "Pay from your NaijaPay wallet balance. Funds are held in escrow until delivery.",
  isConfigured: () => true,
  supportsCountry: (countryCode) => countryCode === "NG",
  async initialize(input) {
    return {
      providerReference: input.reference,
      status: "PENDING",
      instructions: "Confirm to debit your NaijaPay wallet. The balance is verified on the server."
    };
  },
  async verify(reference) {
    // Wallet settlement happens inside the payment service transaction.
    return { status: "PENDING", amountMinor: BigInt(0), currency: "NGN", providerReference: reference };
  }
};

export const paystackAdapter: PaymentAdapter = {
  id: "paystack",
  label: "Paystack",
  description: "Card, bank transfer and USSD through Paystack. Verified server-side before fulfilment.",
  isConfigured: () => Boolean(process.env.PAYSTACK_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY.includes("REPLACE")),
  supportsCountry: (countryCode) => ["NG", "GH", "KE", "ZA"].includes(countryCode),
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    const body = await jsonRequest(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: input.email,
        amount: Number(input.amountMinor),
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: { ...input.metadata, orderNumber: input.orderNumber }
      })
    });
    const data = asRecord(body.data);
    return {
      providerReference: String(data.reference || input.reference),
      redirectUrl: typeof data.authorization_url === "string" ? data.authorization_url : undefined,
      status: "PENDING",
      raw: body
    };
  },
  async verify(reference: string): Promise<PaymentVerifyResult> {
    const body = await jsonRequest(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const data = asRecord(body.data);
    const status = data.status === "success" ? "COMPLETED" : data.status === "failed" ? "FAILED" : "PENDING";
    return {
      status,
      amountMinor: BigInt(Number(data.amount ?? 0)),
      currency: String(data.currency || "NGN"),
      providerReference: String(data.reference || reference),
      failureReason: status === "FAILED" ? String(data.gateway_response || "Payment failed.") : undefined,
      raw: body
    };
  },
  async refund(input) {
    const body = await jsonRequest(`${PAYSTACK_BASE}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transaction: input.reference,
        amount: Number(input.amountMinor),
        currency: input.currency
      })
    });
    const data = asRecord(body.data);
    const providerStatus = String(data.status || "").toLowerCase();
    return {
      status: providerStatus === "processed" || providerStatus === "completed" ? "COMPLETED" : "PENDING",
      providerReference: data.id ? String(data.id) : undefined,
      raw: body
    };
  },
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult | null> {
    const signature = headers.get("x-paystack-signature");
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!signature || !secret) return null;
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

    const payload = asRecord(JSON.parse(rawBody));
    if (payload.event !== "charge.success" && payload.event !== "charge.failed") return null;
    const data = asRecord(payload.data);
    const reference = String(data.reference || "");
    if (!reference) return null;
    return {
      eventId: `${String(payload.event)}:${String(data.id ?? reference)}`,
      reference,
      status: payload.event === "charge.success" ? "COMPLETED" : "FAILED",
      amountMinor: BigInt(Number(data.amount ?? 0)),
      currency: String(data.currency || "NGN"),
      raw: payload
    };
  }
};

export const flutterwaveAdapter: PaymentAdapter = {
  id: "flutterwave",
  label: "Flutterwave",
  description: "Card, bank transfer and mobile money through Flutterwave, verified before fulfilment.",
  isConfigured: () => Boolean(process.env.FLUTTERWAVE_SECRET_KEY && !process.env.FLUTTERWAVE_SECRET_KEY.includes("REPLACE")),
  supportsCountry: (countryCode) => ["NG", "GH", "KE", "ZA", "US", "GB"].includes(countryCode),
  async initialize(input: PaymentInitInput): Promise<PaymentInitResult> {
    const body = await jsonRequest(`${FLUTTERWAVE_BASE}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: Number(input.amountMinor) / 100,
        currency: input.currency,
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        meta: { ...input.metadata, orderNumber: input.orderNumber }
      })
    });
    const data = asRecord(body.data);
    return {
      providerReference: String(data.tx_ref || input.reference),
      redirectUrl: typeof data.link === "string" ? data.link : undefined,
      status: "PENDING",
      raw: body
    };
  },
  async verify(reference: string): Promise<PaymentVerifyResult> {
    const body = await jsonRequest(
      `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );
    const data = asRecord(body.data);
    const status = data.status === "successful" ? "COMPLETED" : data.status === "failed" ? "FAILED" : "PENDING";
    return {
      status,
      amountMinor: BigInt(Math.round(Number(data.amount ?? 0) * 100)),
      currency: String(data.currency || "NGN"),
      providerReference: String(data.tx_ref || reference),
      failureReason: status === "FAILED" ? String(data.processor_response || "Payment failed.") : undefined,
      raw: body
    };
  },
  async refund(input) {
    const verified = await jsonRequest(
      `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.reference)}`,
      { headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } }
    );
    const transaction = asRecord(verified.data);
    const transactionId = transaction.id;
    if (!transactionId) throw new Error("Flutterwave transaction id was not returned; refund was not submitted.");
    const body = await jsonRequest(`${FLUTTERWAVE_BASE}/transactions/${encodeURIComponent(String(transactionId))}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount: Number(input.amountMinor) / 100 })
    });
    const data = asRecord(body.data);
    const providerStatus = String(data.status || "").toLowerCase();
    return {
      status: providerStatus === "completed" || providerStatus === "successful" ? "COMPLETED" : "PENDING",
      providerReference: data.id ? String(data.id) : undefined,
      raw: body
    };
  },
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult | null> {
    const hash = headers.get("verif-hash");
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!hash || !expected) return null;
    const provided = Buffer.from(hash, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

    const payload = asRecord(JSON.parse(rawBody));
    const data = asRecord(payload.data);
    const reference = String(data.tx_ref || "");
    if (!reference) return null;
    return {
      eventId: `${String(payload.event || "charge")}:${String(data.id ?? reference)}`,
      reference,
      status: data.status === "successful" ? "COMPLETED" : data.status === "failed" ? "FAILED" : "PENDING",
      amountMinor: BigInt(Math.round(Number(data.amount ?? 0) * 100)),
      currency: String(data.currency || "NGN"),
      raw: payload
    };
  }
};

/**
 * Local-only simulator. It is deliberately unavailable in production and only
 * appears when ENABLE_TEST_PAYMENTS=true. It exists so the purchase flow can be
 * verified end-to-end without inventing a successful real payment.
 */
export const testAdapter: PaymentAdapter = {
  id: "test",
  label: "Local test provider",
  description: "Local verification only. Not a real payment. Disabled in production.",
  isConfigured: isTestPaymentsEnabled,
  supportsCountry: () => true,
  async initialize(input) {
    return {
      providerReference: input.reference,
      status: "PENDING",
      instructions: "Local test provider: confirm on this page to simulate a verified payment for testing only."
    };
  },
  async verify(reference) {
    return {
      status: "COMPLETED",
      amountMinor: BigInt(0),
      currency: "NGN",
      providerReference: reference,
      raw: { simulated: true }
    };
  },
  async refund(input) {
    if (!isTestPaymentsEnabled()) {
      return { status: "FAILED", raw: { simulated: false, note: "Local test provider is disabled." } };
    }
    return {
      status: "COMPLETED",
      providerReference: `TEST-REFUND-${input.reference}`,
      raw: { simulated: true, note: "Local test refund. No real money moved." }
    };
  }
};

export const adapters = {
  wallet: walletAdapter,
  paystack: paystackAdapter,
  flutterwave: flutterwaveAdapter,
  test: testAdapter
} as const;

export type AdapterId = keyof typeof adapters;
