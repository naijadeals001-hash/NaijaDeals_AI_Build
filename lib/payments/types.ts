export type PaymentStatusResult = "PENDING" | "COMPLETED" | "FAILED";

export type PaymentInitInput = {
  reference: string;
  amountMinor: bigint;
  currency: string;
  email: string;
  orderNumber: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
};

export type PaymentInitResult = {
  providerReference: string;
  redirectUrl?: string;
  instructions?: string;
  status: PaymentStatusResult;
  raw?: unknown;
};

export type PaymentVerifyResult = {
  status: PaymentStatusResult;
  amountMinor: bigint;
  currency: string;
  providerReference: string;
  failureReason?: string;
  raw?: unknown;
};

export type WebhookResult = {
  eventId: string;
  reference: string;
  status: PaymentStatusResult;
  amountMinor: bigint;
  currency: string;
  raw: unknown;
};

export type PaymentRefundResult = {
  status: PaymentStatusResult;
  providerReference?: string;
  raw?: unknown;
};

export type PaymentAdapter = {
  id: "wallet" | "paystack" | "flutterwave" | "test";
  label: string;
  description: string;
  /** Whether required credentials/flags are present right now. */
  isConfigured: () => boolean;
  supportsCountry: (countryCode: string) => boolean;
  initialize: (input: PaymentInitInput) => Promise<PaymentInitResult>;
  verify: (reference: string) => Promise<PaymentVerifyResult>;
  verifyWebhook?: (rawBody: string, headers: Headers) => Promise<WebhookResult | null>;
  refund?: (input: { reference: string; amountMinor: bigint; currency: string }) => Promise<PaymentRefundResult>;
};
