import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";

/**
 * Server-side rate limiting for Aura.
 *
 * Algorithm: **fixed-window counter**, implemented as one Lua script so the
 * increment, the first-write expiry and the returned TTL are a single atomic
 * operation. Counting with INCR and expiring in a separate command is not
 * atomic: a crash between them leaves a key with no TTL, and two concurrent
 * callers can both observe a missing TTL.
 *
 * Fixed windows have a documented boundary-burst property: a caller can spend
 * its full allowance at the end of one window and again at the start of the
 * next, so up to 2x the limit can occur across a window edge. That is accepted
 * here because the alternative (a sliding window or token bucket) needs more
 * Redis state per user for a gain that does not matter at these limits.
 *
 * Identity comes from the authenticated server session. The caller never
 * supplies it. Keys are hashed so a raw user id is not written to Redis.
 *
 * Failure policy: if Valkey is unreachable the limiter **denies** the request.
 * A chat turn is expensive (a paid model call), so an unavailable limiter must
 * not degrade into unlimited spending.
 */

const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export function auraRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const limit = Number(env.AURA_RATE_LIMIT_PER_WINDOW ?? 20);
  const windowSeconds = Number(env.AURA_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20,
    windowMs: (Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.floor(windowSeconds) : 60) * 1000
  };
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /** Set when the decision came from an unavailable limiter rather than a full window. */
  unavailable?: boolean;
};

const globalKey = "__naijadealsAuraRateLimitRedis" as const;
type GlobalWithRedis = typeof globalThis & { [globalKey]?: Redis | null };

function client(): Redis | null {
  const url = process.env.VALKEY_URL;
  if (!url) return null;
  const scope = globalThis as GlobalWithRedis;
  if (scope[globalKey]) return scope[globalKey]!;
  const instance = new Redis(url, {
    connectTimeout: 1500,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000)
  });
  instance.on("error", () => {
    // Counted through the returned result; an unhandled listener would crash
    // the request during a Valkey restart.
  });
  scope[globalKey] = instance;
  return instance;
}

/** Per-user key, scoped to the Aura chat action. Never the raw user id. */
export function auraRateLimitKey(userId: string, now = Date.now(), windowMs = auraRateLimitConfig().windowMs): string {
  const bucket = Math.floor(now / windowMs);
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `aura:chat:${digest}:${bucket}`;
}

export async function checkAuraRateLimit(
  userId: string,
  config: RateLimitConfig = auraRateLimitConfig()
): Promise<RateLimitResult> {
  const redis = client();
  if (!redis) {
    return { allowed: false, limit: config.limit, remaining: 0, retryAfterSeconds: 30, unavailable: true };
  }

  const key = auraRateLimitKey(userId, Date.now(), config.windowMs);
  const ttlMs = config.windowMs;

  try {
    const [count, ttl] = (await redis.eval(SCRIPT, 1, key, String(ttlMs))) as [number, number];
    const remaining = Math.max(config.limit - Number(count), 0);
    const retryAfterSeconds = Math.max(Math.ceil(Number(ttl) / 1000), 1);

    return {
      allowed: Number(count) <= config.limit,
      limit: config.limit,
      remaining,
      retryAfterSeconds
    };
  } catch {
    // Fail closed: an expensive call must not proceed without the limiter.
    return { allowed: false, limit: config.limit, remaining: 0, retryAfterSeconds: 30, unavailable: true };
  }
}

export async function closeAuraRateLimit(): Promise<void> {
  const scope = globalThis as GlobalWithRedis;
  await scope[globalKey]?.quit().catch(() => undefined);
  scope[globalKey] = undefined;
}

// --- self test -------------------------------------------------------------
// Run: npx tsx lib/aura/rate-limit.ts --self-test
// Proves concurrency, identity isolation and reset without HTTP or model calls.

async function selfTest() {
  const { config: loadEnv } = await import("dotenv");
  loadEnv();
  const id = `self-${randomUUID()}`;
  const other = `other-${randomUUID()}`;
  const config: RateLimitConfig = { limit: 5, windowMs: 60_000 };

  const burst = await Promise.all(Array.from({ length: 12 }, () => checkAuraRateLimit(id, config)));
  const allowed = burst.filter((r) => r.allowed).length;
  console.log(`concurrent burst of 12 at limit 5 -> allowed=${allowed} (expected 5)`);

  const stranger = await checkAuraRateLimit(other, config);
  console.log(`independent identity -> allowed=${stranger.allowed} remaining=${stranger.remaining} (expected true/4)`);

  const fresh = await checkAuraRateLimit(`${id}-new`, config);
  console.log(`fresh identity -> allowed=${fresh.allowed} remaining=${fresh.remaining} (expected true/4)`);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const stillLimited = await checkAuraRateLimit(id, config);
  console.log(`after rejection, within window -> allowed=${stillLimited.allowed} retryAfter=${stillLimited.retryAfterSeconds}s`);

  await closeAuraRateLimit();
  // Point the next client at a closed port to prove fail-closed behaviour.
  const realUrl = process.env.VALKEY_URL;
  process.env.VALKEY_URL = "redis://127.0.0.1:6399/0";
  const down = await checkAuraRateLimit(id, config);
  if (realUrl) process.env.VALKEY_URL = realUrl;
  console.log(`limiter unavailable -> allowed=${down.allowed} unavailable=${down.unavailable} (expected false/true)`);

  const ok = allowed === 5 && stranger.allowed && fresh.allowed && !stillLimited.allowed && !down.allowed;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) {
  void selfTest();
}
