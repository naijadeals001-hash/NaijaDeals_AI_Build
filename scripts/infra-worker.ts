/**
 * Background worker for NaijaDeals.
 *
 *   npx tsx scripts/infra-worker.ts
 *
 * Responsibilities:
 *  - registers the durable schedules (drive expiry, notification recovery)
 *  - consumes the notification, search-index and drive-expiry queues
 *  - writes a heartbeat so /api/health can tell "queue up" from "worker alive"
 *  - moves permanently failed jobs to a dead-letter queue
 *
 * Every handler is idempotent: the drive sweep has a conditional update per
 * ride, notification delivery claims a row before sending, and an index rebuild
 * is a full upsert. Running two of these processes is safe.
 */

import "dotenv/config";
import type { Job } from "bullmq";
import { QUEUE_NAMES, enqueue, startWorker } from "../lib/infra/queue";
import { ensureSchedules } from "../lib/infra/schedules";
import { writeHeartbeat } from "../lib/infra/heartbeat";
import { log } from "../lib/infra/logger";
import { closeCache } from "../lib/infra/cache";
import { closeVectors } from "../lib/infra/vectors";
import { reindexCatalogue } from "../lib/infra/catalogue-index";
import { processPendingSync, pruneProcessedSync } from "../lib/infra/search-sync";
import { releaseExpiredAssignments } from "../lib/services/core/drive.service";
import {
  deliverNotification,
  flushDueNotifications,
  recoverStuckSending
} from "../lib/services/core/notification-delivery.service";

const PROCESSED: string[] = [];

function structured(handler: string, job: Job, extra: Record<string, unknown> = {}) {
  log.info("job.processed", { handler, queue: job.queueName, jobId: job.id ?? null, name: job.name, ...extra });
}

/** Final failure: copy the payload to the dead-letter queue for inspection. */
async function deadLetter(queueName: string, job: Job | undefined, error: Error) {
  if (!job) return;
  await enqueue(
    QUEUE_NAMES.deadLetter,
    `${queueName}:${job.name}`,
    {
      queue: queueName,
      jobId: job.id ?? null,
      name: job.name,
      data: job.data,
      failedReason: error.message.slice(0, 500),
      attempts: job.attemptsMade
    },
    { attempts: 1 }
  ).catch(() => undefined);
  log.error("job.dead_lettered", {
    queue: queueName,
    jobId: job.id ?? null,
    name: job.name,
    attempts: job.attemptsMade
  });
}

const driveWorker = startWorker(
  QUEUE_NAMES.driveExpiry,
  async (job) => {
    const released = await releaseExpiredAssignments();
    structured("drive.expiry", job, { released: released.length });
    return { released: released.length };
  },
  { concurrency: 1 }
);

const notificationWorker = startWorker(
  QUEUE_NAMES.notifications,
  async (job) => {
    if (job.name === "deliver") {
      const notificationId = String((job.data as { notificationId?: string }).notificationId ?? "");
      if (!notificationId) throw new Error("missing_notification_id");
      const outcome = await deliverNotification(notificationId);
      structured("notification.deliver", job, { status: outcome.status, provider: outcome.provider ?? null });
      return outcome;
    }
    if (job.name === "sweep") {
      const recovered = await recoverStuckSending();
      const delivered = await flushDueNotifications();
      structured("notification.sweep", job, { recovered, delivered });
      return { recovered, delivered };
    }
    throw new Error(`unknown_job:${job.name}`);
  },
  { concurrency: 4 }
);

const searchWorker = startWorker(
  QUEUE_NAMES.searchIndex,
  async (job) => {
    if (job.name === "reindex") {
      const result = await reindexCatalogue();
      structured("search.reindex", job, { indexed: result.indexed });
      return result;
    }
    if (job.name === "sync") {
      const result = await processPendingSync();
      structured("search.sync", job, result);
      return result;
    }
    throw new Error(`unknown_job:${job.name}`);
  },
  { concurrency: 1 }
);

const workers = [driveWorker, notificationWorker, searchWorker].filter(Boolean);

if (workers.length === 0) {
  process.stderr.write("Valkey is not configured (VALKEY_URL); the worker has nothing to do.\n");
  process.exit(1);
}

for (const worker of workers) {
  PROCESSED.push(String(worker!.name));
  worker!.on("completed", (job) => {
    log.debug("job.completed", { queue: worker!.name, jobId: job.id ?? null });
  });
  worker!.on("failed", (job, error) => {
    const attempts = job?.attemptsMade ?? 0;
    const max = job?.opts?.attempts ?? 1;
    log.warn("job.failed", {
      queue: worker!.name,
      jobId: job?.id ?? null,
      attempts,
      max,
      error: error.message.slice(0, 160)
    });
    if (attempts >= max) void deadLetter(String(worker!.name), job ?? undefined, error);
  });
  worker!.on("error", (error) => {
    log.error("worker.error", { queue: worker!.name, error: error.message.slice(0, 160) });
  });
}

void ensureSchedules().catch((error: unknown) => {
  log.error("schedule.registration_failed", {
    error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
  });
});

const heartbeat = setInterval(() => {
  void writeHeartbeat(PROCESSED).then((ok) => {
    if (!ok) log.warn("heartbeat.write_failed");
  });
}, 15_000);
heartbeat.unref();
void writeHeartbeat(PROCESSED);

log.info("worker.started", { queues: PROCESSED, pid: process.pid });

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info("worker.stopping", { signal });
  clearInterval(heartbeat);
  await Promise.all(workers.map((worker) => worker!.close().catch(() => undefined)));
  await closeCache();
  await closeVectors();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
