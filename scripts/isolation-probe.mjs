#!/usr/bin/env node
/**
 * Proves the two BullMQ namespaces are disjoint without touching business data.
 *
 *   node scripts/isolation-probe.mjs
 *
 * Enqueues one job under nd and one under nd-test, then confirms each is visible
 * only in its own namespace. Nothing consumes these jobs, so no worker runs.
 */
import { Queue } from "bullmq";
import { config } from "dotenv";

config();

const base = new URL(process.env.VALKEY_URL);
const connection = {
  host: base.hostname,
  port: Number(base.port || 6379),
  password: decodeURIComponent(base.password || "")
};

const marker = `probe-${Date.now()}`;

async function queueFor(prefix) {
  const queue = new Queue("isolation-probe", { prefix, connection });
  await queue.add("probe", { marker, prefix }, { jobId: `${prefix}-${marker}` });
  const jobs = await queue.getJobs(["waiting", "delayed", "active"]);
  const found = jobs.filter((job) => job.data?.marker === marker).map((job) => job.id);
  await queue.close();
  return found;
}

const dev = await queueFor("nd");
const test = await queueFor("nd-test");

console.log(JSON.stringify({ marker, dev: dev.length, test: test.length, devIds: dev, testIds: test }, null, 2));

if (dev.length === 1 && test.length === 1 && dev[0] !== test[0]) {
  console.log("PASS namespaces are disjoint");
  process.exit(0);
}
console.log("FAIL namespace isolation is not proven");
process.exit(1);
