import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/auth/api-error";

/**
 * Narrowly scoped credential for the local automation consumer (n8n).
 *
 * The consumer never receives a database credential: it presents this bearer
 * token to the automation API. Only the sha256 digests are compared, in
 * constant time, and an unconfigured server fails closed.
 */
export function requireAutomationConsumer(request: Request): string {
  const configured = process.env.AUTOMATION_CONSUMER_TOKEN ?? "";
  if (configured.length < 32) {
    throw new ApiError(503, "automation_not_configured", "Automation consumer credentials are not configured.");
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) throw new ApiError(401, "unauthorized", "Missing automation credential.");
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(configured).digest();
  if (!timingSafeEqual(a, b)) throw new ApiError(401, "unauthorized", "Invalid automation credential.");
  return presented;
}
