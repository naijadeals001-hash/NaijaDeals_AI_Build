import { cacheGetJson, cacheSetJson } from "./cache";
import { infraConfig } from "./config";

/**
 * Worker liveness.
 *
 * A worker writes a short-lived key while it runs. The health endpoint reads it,
 * so "the queue is up" and "something is actually consuming the queue" are two
 * different answers instead of one optimistic one.
 */

const KEY = "worker:heartbeat";
const TTL_SECONDS = 90;

export type Heartbeat = { at: string; pid: number; host: string; queues: string[] };

export async function writeHeartbeat(queues: string[]): Promise<boolean> {
  if (!infraConfig().valkeyUrl) return false;
  const beat: Heartbeat = {
    at: new Date().toISOString(),
    pid: process.pid,
    host: process.env.COMPUTERNAME ?? "local",
    queues
  };
  return cacheSetJson(KEY, beat, TTL_SECONDS);
}

export async function readHeartbeat(): Promise<Heartbeat | null> {
  return cacheGetJson<Heartbeat>(KEY);
}

/** True only when a worker has written the key recently enough to be alive. */
export async function workerIsAlive(maxAgeSeconds = TTL_SECONDS): Promise<{ alive: boolean; ageSeconds: number | null }> {
  const beat = await readHeartbeat();
  if (!beat) return { alive: false, ageSeconds: null };
  const ageSeconds = Math.round((Date.now() - new Date(beat.at).getTime()) / 1000);
  return { alive: ageSeconds <= maxAgeSeconds, ageSeconds };
}
