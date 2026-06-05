export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const serviceConfig = {
  databaseUrl: optionalEnv("DATABASE_URL"),
  authSecret: optionalEnv("NEXTAUTH_SECRET"),
  paymentWebhookSecret: optionalEnv("PAYMENT_WEBHOOK_SECRET"),
  ledgerApiUrl: optionalEnv("WALLET_LEDGER_API_URL"),
  escrowWebhookSecret: optionalEnv("ESCROW_RELEASE_WEBHOOK_SECRET"),
  aiProvider: optionalEnv("AI_PROVIDER", "openai"),
  storageBucket: optionalEnv("S3_BUCKET")
};
