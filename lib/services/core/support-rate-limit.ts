import { createHash } from "node:crypto";

/**
 * In-process fixed-window limiter for public support endpoints.
 *
 * Scope and honesty: this counts per application process. It is the right
 * defence for a single staging instance and for burst/duplicate protection, but
 * it is not shared across replicas. The Valkey limiter in `lib/aura/rate-limit`
 * is used where a paid model call must never run unlimited; support submissions
 * run on instances without Valkey, so a limiter that fails closed on a Redis
 * outage would block all contact submissions. Redis-backed counting is the
 * documented next step when support runs on more than one instance.
 *
 * Keys are hashed so an IP address or email is never held in memory verbatim.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type SupportRateLimit = { limit: number; windowMs: number };

export const SUPPORT_RATE_LIMITS = {
  submit: { limit: 5, windowMs: 10 * 60 * 1000 },
  guestAccess: { limit: 10, windowMs: 10 * 60 * 1000 },
  reply: { limit: 30, windowMs: 10 * 60 * 1000 }
} as const satisfies Record<string, SupportRateLimit>;

function keyFor(scope: string, identity: string): string {
  return `${scope}:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

export function supportRateLimit(
  scope: keyof typeof SUPPORT_RATE_LIMITS,
  identity: string
): { allowed: boolean; retryAfterSeconds: number; limit: number } {
  const config = SUPPORT_RATE_LIMITS[scope];
  const key = keyFor(scope, identity || "anonymous");
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [candidate, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(candidate);
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSeconds: 0, limit: config.limit };
  }
  current.count += 1;
  if (current.count > config.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)), limit: config.limit };
  }
  return { allowed: true, retryAfterSeconds: 0, limit: config.limit };
}

/** Best-effort client identity for unauthenticated endpoints. */
export function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
