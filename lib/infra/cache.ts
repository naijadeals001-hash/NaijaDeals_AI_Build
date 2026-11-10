import Redis from "ioredis";
import { infraConfig } from "./config";
import { recordCache, recordOperation } from "./metrics";

/**
 * Valkey-backed cache.
 *
 * Design rule: a cache outage degrades performance, never correctness. Reads
 * return `null` and writes return `false` when the server is unreachable, and
 * the caller falls through to Postgres. Errors are recorded as metrics so the
 * degradation is visible rather than silent.
 */

const globalKey = "__naijadealsCacheClient" as const;
type GlobalWithCache = typeof globalThis & { [globalKey]?: Redis | null };

export function isCacheConfigured(): boolean {
  return Boolean(infraConfig().valkeyUrl);
}

function client(): Redis | null {
  const scope = globalThis as GlobalWithCache;
  if (scope[globalKey] !== undefined) return scope[globalKey];

  const url = infraConfig().valkeyUrl;
  if (!url) {
    scope[globalKey] = null;
    return null;
  }

  const instance = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000)
  });
  instance.on("error", () => {
    // Swallowed on purpose: the metric below is the signal, and an unhandled
    // listener here would crash the process during a container restart.
  });
  scope[globalKey] = instance;
  return instance;
}

async function run<T>(operation: string, work: (redis: Redis) => Promise<T>): Promise<T | null> {
  const redis = client();
  if (!redis) return null;

  const startedAt = Date.now();
  try {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    const value = await work(redis);
    recordOperation("valkey", operation, "ok", Date.now() - startedAt);
    return value;
  } catch {
    recordOperation("valkey", operation, "error", Date.now() - startedAt);
    return null;
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await run("get", (redis) => redis.get(key));
  if (raw === null) {
    recordCache("miss");
    return null;
  }
  try {
    recordCache("hit");
    return JSON.parse(raw) as T;
  } catch {
    recordCache("error");
    await cacheDelete(key);
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  const result = await run("set", (redis) =>
    redis.set(key, JSON.stringify(value), "EX", Math.max(1, Math.floor(ttlSeconds)))
  );
  return result === "OK";
}

/** Atomic counter, used for worker start/restart accounting. */
export async function cacheIncrement(key: string, ttlSeconds?: number): Promise<number | null> {
  const value = await run("incr", async (redis) => {
    const next = await redis.incr(key);
    if (ttlSeconds) await redis.expire(key, ttlSeconds);
    return next;
  });
  return value;
}

export async function cacheDelete(key: string): Promise<boolean> {
  const result = await run("del", (redis) => redis.del(key));
  return result !== null;
}

/** Deletes every key with the given prefix using a bounded SCAN, never KEYS. */
export async function cacheDeletePrefix(prefix: string): Promise<number> {
  const deleted = await run("scan-del", async (redis) => {
    let cursor = "0";
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length) removed += await redis.del(...keys);
    } while (cursor !== "0");
    return removed;
  });
  return deleted ?? 0;
}

/** Cached read-through helper: returns the cached value or computes and stores it. */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const hit = await cacheGetJson<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  await cacheSetJson(key, value, ttlSeconds);
  return value;
}

export async function cacheHealth(): Promise<boolean> {
  const pong = await run("health", (redis) => redis.ping());
  return pong === "PONG";
}

export async function closeCache(): Promise<void> {
  const scope = globalThis as GlobalWithCache;
  const instance = scope[globalKey];
  if (instance) {
    await instance.quit().catch(() => undefined);
    scope[globalKey] = undefined;
  }
}
