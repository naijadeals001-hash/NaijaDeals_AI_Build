import { Queue, Worker, type Job, type Processor } from "bullmq";
import { infraConfig } from "./config";
import { infraMetrics, recordOperation } from "./metrics";

/**
 * Durable background jobs on BullMQ + Valkey.
 *
 * This replaces process-local timers: a job survives a restart, retries with
 * exponential backoff, and is claimed by exactly one worker when two app
 * instances are running.
 *
 * The connection must set `maxRetriesPerRequest: null`; BullMQ requires it for
 * blocking commands.
 */

/**
 * BullMQ key namespace. Development keeps `nd`; an isolated test environment
 * sets QUEUE_PREFIX=nd-test so its worker cannot see or claim development jobs
 * (and vice versa). Every Queue, Worker and scheduler must use this value.
 */
export function queuePrefix(): string {
  const value = process.env.QUEUE_PREFIX?.trim();
  return value ? value : "nd";
}

export const ENQUEUE_TIMEOUT_MS = 2_500;

export const QUEUE_NAMES = {
  driveExpiry: "drive-expiry",
  checkoutExpiry: "checkout-expiry",
  searchIndex: "search-index",
  notifications: "notifications",
  deadLetter: "dead-letter"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

type Connection = { host: string; port: number; password?: string; username?: string; db?: number };

const globalKey = "__naijadealsQueues" as const;
type GlobalWithQueues = typeof globalThis & {
  [globalKey]?: { queues: Map<string, Queue>; workers: Map<string, Worker> };
};

export function isQueueConfigured(): boolean {
  return Boolean(infraConfig().valkeyUrl);
}

export function queueConnection(): Connection | null {
  const url = infraConfig().valkeyUrl;
  if (!url) return null;
  const parsed = new URL(url);
  const dbPath = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    db: dbPath ? Number(dbPath) : 0
  };
}

function scope() {
  const store = globalThis as GlobalWithQueues;
  if (!store[globalKey]) {
    store[globalKey] = { queues: new Map(), workers: new Map() };
  }
  return store[globalKey]!;
}

export function getQueue(name: QueueName): Queue | null {
  const connection = queueConnection();
  if (!connection) return null;
  const existing = scope().queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    // Producers must fail fast when the optional Valkey backend is down.
    // Workers still use maxRetriesPerRequest:null below. A producer with an
    // unbounded retry loop can keep a financial request open and leak a client.
    connection: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      retryStrategy: () => null
    },
    prefix: queuePrefix()
  });
  scope().queues.set(name, queue);
  return queue;
}

export async function enqueue(
  name: QueueName,
  jobName: string,
  payload: Record<string, unknown>,
  options: { jobId?: string; delayMs?: number; attempts?: number } = {}
): Promise<string | null> {
  const queue = getQueue(name);
  if (!queue) return null;

  const startedAt = Date.now();
  try {
    // A producer must never hold a financial response open while an optional
    // Valkey is unavailable. BullMQ's required null retry setting can keep a
    // queue.add() pending indefinitely, so bound only the producer's wait and
    // disconnect the unusable queue; the durable Notification row remains.
    const added = queue.add(jobName, payload, {
      jobId: options.jobId,
      delay: options.delayMs,
      attempts: options.attempts ?? 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 60 * 60 * 24 },
      removeOnFail: { age: 60 * 60 * 24 * 7 }
    });
    void added.catch(() => undefined);
    const job = await Promise.race([
      added,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ENQUEUE_TIMEOUT_MS))
    ]);
    if (!job) {
      recordOperation("valkey", "enqueue", "error", Date.now() - startedAt);
      infraMetrics().queueJobs.inc({ queue: name, event: "enqueue_timeout" });
      scope().queues.delete(name);
      // Disconnect the producer and drop the cached reference. With finite
      // retries and the offline queue disabled, the abandoned add cannot keep
      // reconnecting after this returns.
      queue.disconnect();
      return null;
    }
    recordOperation("valkey", "enqueue", "ok", Date.now() - startedAt);
    infraMetrics().queueJobs.inc({ queue: name, event: "enqueued" });
    return job.id ?? null;
  } catch {
    recordOperation("valkey", "enqueue", "error", Date.now() - startedAt);
    return null;
  }
}

/** Registers a worker for a queue. Returns null when no queue backend exists. */
export function startWorker(
  name: QueueName,
  processor: Processor,
  options: { concurrency?: number } = {}
): Worker | null {
  const connection = queueConnection();
  if (!connection) return null;

  const store = scope();
  const existing = store.workers.get(name);
  if (existing) return existing;

  const worker = new Worker(name, processor, {
    connection: { ...connection, maxRetriesPerRequest: null },
    prefix: queuePrefix(),
    concurrency: options.concurrency ?? 2
  });

  worker.on("completed", (job: Job) => {
    infraMetrics().queueJobs.inc({ queue: name, event: "completed" });
    void job;
  });
  worker.on("failed", () => {
    infraMetrics().queueJobs.inc({ queue: name, event: "failed" });
  });
  worker.on("error", () => {
    // Surfaces through metrics; the listener prevents an unhandled rejection
    // while Valkey is restarting.
  });

  store.workers.set(name, worker);
  return worker;
}

export async function queueDepth(name: QueueName): Promise<number | null> {
  const queue = getQueue(name);
  if (!queue) return null;
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed");
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    infraMetrics().queueDepth.set({ queue: name }, total);
    return total;
  } catch {
    recordOperation("valkey", "queue-depth", "error", 0);
    return null;
  }
}

export async function closeQueues(): Promise<void> {
  const store = scope();
  await Promise.all([...store.workers.values()].map((worker) => worker.close().catch(() => undefined)));
  await Promise.all([...store.queues.values()].map((queue) => queue.close().catch(() => undefined)));
  store.workers.clear();
  store.queues.clear();
}
