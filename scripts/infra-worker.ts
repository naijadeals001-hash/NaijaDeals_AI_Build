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
 * Startup order matters. Everything with an operational side effect — worker
 * consumers, schedules, timers, the drive service that registers its sweeper —
 * is loaded dynamically *inside* the bootstrap, after the database guard has run.
 * A static import would execute before any check in this file, which is why the
 * guard cannot be a plain statement at the top.
 *
 * Every handler is idempotent: the drive sweep has a conditional update per ride,
 * notification delivery claims a row before sending, and an index rebuild is a
 * full upsert. Running two of these processes is safe.
 */

import "dotenv/config";
import type { Job } from "bullmq";

type Modules = Awaited<ReturnType<typeof loadModules>>;

async function loadModules() {
  const [{ QUEUE_NAMES, enqueue, startWorker }, { ensureSchedules }, heartbeat, logger, cache, vectors] =
    await Promise.all([
      import("../lib/infra/queue"),
      import("../lib/infra/schedules"),
      import("../lib/infra/heartbeat"),
      import("../lib/infra/logger"),
      import("../lib/infra/cache"),
      import("../lib/infra/vectors")
    ]);
  const [{ reindexCatalogue }, { processPendingSync }, { releaseExpiredAssignments }] = await Promise.all([
    import("../lib/infra/catalogue-index"),
    import("../lib/infra/search-sync"),
    import("../lib/services/core/drive.service")
  ]);
  const delivery = await import("../lib/services/core/notification-delivery.service");
  const { processIntents } = await import("../lib/notifications/intent.service");
  const { processReversalIntents } = await import("../lib/services/affiliate/reversal-processor");
  return {
    QUEUE_NAMES,
    enqueue,
    startWorker,
    ensureSchedules,
    recordWorkerStart: heartbeat.recordWorkerStart,
    writeHeartbeat: heartbeat.writeHeartbeat,
    log: logger.log,
    closeCache: cache.closeCache,
    closeVectors: vectors.closeVectors,
    reindexCatalogue,
    processPendingSync,
    releaseExpiredAssignments,
    deliverNotification: delivery.deliverNotification,
    flushDueNotifications: delivery.flushDueNotifications,
    recoverStuckSending: delivery.recoverStuckSending,
    processIntents,
    processReversalIntents
  };
}

/** In test mode the worker proves which database it is on before starting anything. */
async function assertTestDatabase(): Promise<void> {
  if (process.env.AFFILIATE_TEST_MODE !== "1") return;
  const { requireIsolatedDatabase } = await import("./lib/require-isolated-database");
  const { prisma } = await import("../lib/prisma");
  const rows = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  // Throws nothing: requireIsolatedDatabase exits 2 on a mismatch. Called before any
  // consumer, schedule or timer exists, so a refused start leaves nothing running.
  requireIsolatedDatabase(rows[0].db);
}

async function bootstrap() {
  await assertTestDatabase();
  const m: Modules = await loadModules();

  const PROCESSED: string[] = [];

  function structured(handler: string, job: Job, extra: Record<string, unknown> = {}) {
    m.log.info("job.processed", { handler, queue: job.queueName, jobId: job.id ?? null, name: job.name, ...extra });
  }

  async function deadLetter(queueName: string, job: Job | undefined, error: Error) {
    if (!job) return;
    await m
      .enqueue(
        m.QUEUE_NAMES.deadLetter,
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
      )
      .catch(() => undefined);
    m.log.error("job.dead_lettered", { queue: queueName, jobId: job.id ?? null, name: job.name });
  }

  const driveWorker = m.startWorker(
    m.QUEUE_NAMES.driveExpiry,
    async (job) => {
      const released = await m.releaseExpiredAssignments();
      structured("drive.expiry", job, { released: released.length });
      return { released: released.length };
    },
    { concurrency: 1 }
  );

  const notificationWorker = m.startWorker(
    m.QUEUE_NAMES.notifications,
    async (job) => {
      if (job.name === "deliver") {
        const notificationId = String((job.data as { notificationId?: string }).notificationId ?? "");
        if (!notificationId) throw new Error("missing_notification_id");
        const outcome = await m.deliverNotification(notificationId);
        structured("notification.deliver", job, { status: outcome.status, provider: outcome.provider ?? null });
        return outcome;
      }
      if (job.name === "sweep") {
        const recovered = await m.recoverStuckSending();
        const delivered = await m.flushDueNotifications();
        const intents = await m.processIntents(`worker:${process.pid}`, 25);
        const reversals = await m.processReversalIntents(`worker:${process.pid}`, 25);
        structured("notification.sweep", job, { recovered, delivered, intents, reversals });
        return { recovered, delivered, intents, reversals };
      }
      throw new Error(`unknown_job:${job.name}`);
    },
    { concurrency: 4 }
  );

  const searchWorker = m.startWorker(
    m.QUEUE_NAMES.searchIndex,
    async (job) => {
      if (job.name === "reindex") {
        const result = await m.reindexCatalogue();
        structured("search.reindex", job, { indexed: result.indexed });
        return result;
      }
      if (job.name === "sync") {
        const result = await m.processPendingSync();
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
    await m.closeCache();
    await m.closeVectors();
    process.exit(1);
  }

  for (const worker of workers) {
    PROCESSED.push(String(worker!.name));
    worker!.on("completed", (job) => {
      m.log.debug("job.completed", { queue: worker!.name, jobId: job.id ?? null });
    });
    worker!.on("failed", (job, error) => {
      const attempts = job?.attemptsMade ?? 0;
      const max = job?.opts?.attempts ?? 1;
      m.log.warn("job.failed", {
        queue: worker!.name,
        jobId: job?.id ?? null,
        attempts,
        max,
        error: error.message.slice(0, 160)
      });
      if (attempts >= max) void deadLetter(String(worker!.name), job ?? undefined, error);
    });
    worker!.on("error", (error) => {
      m.log.error("worker.error", { queue: worker!.name, error: error.message.slice(0, 160) });
    });
  }

  void m.ensureSchedules().catch((error: unknown) => {
    m.log.error("schedule.registration_failed", {
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
    });
  });

  const heartbeat = setInterval(() => {
    void m.writeHeartbeat(PROCESSED).then((ok) => {
      if (!ok) m.log.warn("heartbeat.write_failed");
    });
  }, 15_000);
  heartbeat.unref();
  void m.recordWorkerStart().then(() => m.writeHeartbeat(PROCESSED));

  m.log.info("worker.started", { queues: PROCESSED, pid: process.pid, testMode: process.env.AFFILIATE_TEST_MODE === "1" });

  let closing = false;
  async function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    m.log.info("worker.stopping", { signal });
    clearInterval(heartbeat);
    await Promise.all(workers.map((worker) => worker!.close().catch(() => undefined)));
    await m.closeCache();
    await m.closeVectors();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch(async (error) => {
  // A guard or dependency failure must exit nonzero without leaving handles open.
  process.stderr.write(`worker bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
