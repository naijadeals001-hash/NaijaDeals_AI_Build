/**
 * Background worker for the local development stack.
 *
 *   npx tsx scripts/infra-worker.ts
 *
 * Requires Valkey (see deploy/dev-infra). Runs until interrupted; Ctrl+C closes
 * the BullMQ workers and connections cleanly so no job is left half-claimed.
 */

import "dotenv/config";
import { QUEUE_NAMES, startWorker } from "../lib/infra/queue";
import { reindexCatalogue } from "../lib/infra/catalogue-index";
import { closeCache } from "../lib/infra/cache";
import { closeVectors } from "../lib/infra/vectors";

const searchWorker = startWorker(
  QUEUE_NAMES.searchIndex,
  async (job) => {
    if (job.name === "reindex") {
      const result = await reindexCatalogue();
      return result;
    }
    throw new Error(`unknown_job:${job.name}`);
  },
  { concurrency: 1 }
);

if (!searchWorker) {
  process.stderr.write("Valkey is not configured (VALKEY_URL); nothing to process.\n");
  process.exit(1);
}

process.stdout.write(`Worker listening on queues: ${Object.values(QUEUE_NAMES).join(", ")}\n`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  process.stdout.write(`\n${signal} received; closing workers.\n`);
  await searchWorker?.close().catch(() => undefined);
  await closeCache();
  await closeVectors();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
