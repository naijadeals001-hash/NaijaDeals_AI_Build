import { cacheGetJson, cacheIncrement, cacheSetJson } from "./cache";
import { queuePrefix } from "./queue";
import { infraConfig } from "./config";

/**
 * Worker liveness.
 *
 * A worker writes a short-lived key while it runs. The health endpoint reads it,
 * so "the queue is up" and "something is actually consuming the queue" are two
 * different answers instead of one optimistic one.
 */

const LEGACY_KEY = "worker:heartbeat";
const TTL_SECONDS = 90;

/**
 * Heartbeat key is namespaced by the queue prefix, so a test worker running as
 * `nd-test` cannot make the development health endpoint report a live worker.
 * The unprefixed key is still written on the default namespace and still read
 * as a fallback, so a worker started before this change keeps reporting.
 */
export function heartbeatKey(): string {
  return `${queuePrefix()}:worker:heartbeat`;
}

export type Heartbeat = { at: string; pid: number; host: string; queues: string[]; starts: number };

const STARTS_KEY = "worker:starts";

/** Counts worker boots. A restart is visible as a higher value, not as a gap. */
export async function recordWorkerStart(): Promise<number> {
  return (await cacheIncrement(STARTS_KEY)) ?? 0;
}

export async function workerStartCount(): Promise<number> {
  const value = await cacheGetJson<number>(STARTS_KEY);
  return typeof value === "number" ? value : 0;
}

export async function writeHeartbeat(queues: string[]): Promise<boolean> {
  if (!infraConfig().valkeyUrl) return false;
  const beat: Heartbeat = {
    at: new Date().toISOString(),
    pid: process.pid,
    host: process.env.COMPUTERNAME ?? "local",
    queues,
    starts: await workerStartCount()
  };
  const written = await cacheSetJson(heartbeatKey(), beat, TTL_SECONDS);
  if (queuePrefix() === "nd") await cacheSetJson(LEGACY_KEY, beat, TTL_SECONDS);
  return written;
}

export async function readHeartbeat(): Promise<Heartbeat | null> {
  const namespaced = await cacheGetJson<Heartbeat>(heartbeatKey());
  if (namespaced) return namespaced;
  return cacheGetJson<Heartbeat>(LEGACY_KEY);
}

/** True only when a worker has written the key recently enough to be alive. */
export async function workerIsAlive(maxAgeSeconds = TTL_SECONDS): Promise<{ alive: boolean; ageSeconds: number | null }> {
  const beat = await readHeartbeat();
  if (!beat) return { alive: false, ageSeconds: null };
  const ageSeconds = Math.round((Date.now() - new Date(beat.at).getTime()) / 1000);
  return { alive: ageSeconds <= maxAgeSeconds, ageSeconds };
}
