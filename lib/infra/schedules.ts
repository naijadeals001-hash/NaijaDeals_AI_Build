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

export const SCHEDULES = {
  driveSweep: { id: "drive-sweep", queue: QUEUE_NAMES.driveExpiry, every: 30_000, name: "sweep" },
  notificationSweep: { id: "notification-sweep", queue: QUEUE_NAMES.notifications, every: 60_000, name: "sweep" },
  searchSync: { id: "search-sync", queue: QUEUE_NAMES.searchIndex, every: 30_000, name: "sync" }
} as const;

export async function ensureSchedules(): Promise<{ id: string; ok: boolean }[]> {
  const results: { id: string; ok: boolean }[] = [];

  for (const schedule of Object.values(SCHEDULES)) {
    const queue = getQueue(schedule.queue);
    if (!queue) {
      results.push({ id: schedule.id, ok: false });
      continue;
    }
    try {
      await queue.upsertJobScheduler(
        schedule.id,
        { every: schedule.every },
        {
          name: schedule.name,
          data: { schedule: schedule.id },
          opts: { removeOnComplete: { age: 3600 }, removeOnFail: { age: 86_400 } }
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
