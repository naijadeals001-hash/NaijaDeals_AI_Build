import { QUEUE_NAMES, getQueue } from "./queue";
import { log } from "./logger";

/**
 * Durable schedules.
 *
 * BullMQ job schedulers live in Valkey, so the schedule survives a restart and
 * is registered once no matter how many web or worker processes call this.
 * `upsertJobScheduler` is idempotent per id: two processes converge on the same
 * definition instead of creating two repeat streams.
 */

export const CHECKOUT_EXPIRY_INTERVAL_ENV = "CHECKOUT_EXPIRY_INTERVAL_MS";
const CHECKOUT_EXPIRY_MIN_INTERVAL_MS = 30_000;
const CHECKOUT_EXPIRY_DEFAULT_INTERVAL_MS = 60_000;

/**
 * Production value: one bounded sweep per minute. The sweep itself only looks at
 * checkouts older than 30 minutes, so the interval controls recovery latency,
 * not what counts as abandoned. The environment override exists for isolated
 * scheduler acceptance runs and is clamped to a sane minimum.
 */
export function checkoutExpiryIntervalMs(): number {
  const raw = Number(process.env[CHECKOUT_EXPIRY_INTERVAL_ENV] ?? CHECKOUT_EXPIRY_DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) return CHECKOUT_EXPIRY_DEFAULT_INTERVAL_MS;
  return Math.max(Math.trunc(raw), CHECKOUT_EXPIRY_MIN_INTERVAL_MS);
}

/**
 * Optional bounded scope for an isolated scheduler acceptance run.
 *
 * Production leaves this unset, so the sweep is global. The service already
 * accepts an `orderIds` scope; this environment only forwards it to the job so
 * a test worker cannot expire unrelated checkouts in the shared acceptance
 * database. It is never read from a request.
 */
export function checkoutExpiryOrderIds(): string[] | undefined {
  const raw = process.env.CHECKOUT_EXPIRY_ACCEPTANCE_ORDER_IDS;
  if (!raw) return undefined;
  const ids = raw.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 100);
  return ids.length ? ids : undefined;
}

export const SCHEDULES = {
  driveSweep: { id: "drive-sweep", queue: QUEUE_NAMES.driveExpiry, every: 30_000, name: "sweep" },
  checkoutExpiry: {
    id: "checkout-expiry",
    queue: QUEUE_NAMES.checkoutExpiry,
    every: checkoutExpiryIntervalMs(),
    name: "expire"
  },
  notificationSweep: { id: "notification-sweep", queue: QUEUE_NAMES.notifications, every: 60_000, name: "sweep" },
  searchSync: { id: "search-sync", queue: QUEUE_NAMES.searchIndex, every: 30_000, name: "sync" }
} as const;

export async function ensureSchedules(): Promise<{ id: string; ok: boolean }[]> {
  const results: { id: string; ok: boolean }[] = [];

  // Production registers every schedule. An isolated acceptance worker can name
  // the schedules it wants, so its 30-second drive/search ticks cannot mutate the
  // shared acceptance fixtures while only checkout expiry is under test.
  const requested = process.env.INFRA_WORKER_SCHEDULES
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const schedules = requested?.length
    ? Object.values(SCHEDULES).filter((schedule) => requested.includes(schedule.id))
    : Object.values(SCHEDULES);

  for (const schedule of schedules) {
    const queue = getQueue(schedule.queue);
    if (!queue) {
      results.push({ id: schedule.id, ok: false });
      continue;
    }
    try {
      const scope = schedule.id === "checkout-expiry" ? checkoutExpiryOrderIds() : undefined;
      await queue.upsertJobScheduler(
        schedule.id,
        { every: schedule.every },
        {
          name: schedule.name,
          data: scope ? { schedule: schedule.id, orderIds: scope } : { schedule: schedule.id },
          opts: {
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86_400 },
            // A failed sweep is retried. Every handler is idempotent, so a
            // retried job cannot duplicate stock releases or expiries.
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 }
          }
        }
      );
      results.push({ id: schedule.id, ok: true });
    } catch (error) {
      log.error("schedule.register_failed", {
        schedule: schedule.id,
        error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
      });
      results.push({ id: schedule.id, ok: false });
    }
  }

  log.info("schedule.registered", { schedules: results.map((row) => `${row.id}:${row.ok ? "ok" : "failed"}`) });
  return results;
}
