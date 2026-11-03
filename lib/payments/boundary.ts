import { ApiError } from "@/lib/auth/guard";

/**
 * Live financial operations are only allowed when the deployment explicitly
 * identifies itself as live. The shared development database must never send
 * money to a provider or settle a vendor payout, regardless of credentials.
 */
export function isLiveFinancialEnvironment() {
  return process.env.NODE_ENV === "production"
    && process.env.FINANCIAL_ENV === "live"
    && process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS === "true";
}

export function assertLiveFinancialOperations(operation: string) {
  if (!isLiveFinancialEnvironment()) {
    throw new ApiError(403, "test_funds_boundary", operation + " is blocked in the shared development environment. No live payment or payout operation may run here.");
  }
}
