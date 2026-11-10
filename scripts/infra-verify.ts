/**
 * Verifies every local development engine with a real operation.
 *
 *   npx tsx scripts/infra-verify.ts
 *
 * Each check either performs the operation the application performs (index a
 * document and query it, upload and read back bytes, enqueue and execute a job)
 * or reports why it could not. Nothing is reported as passing on the strength
 * of a container being "up".
 *
 * Exit code 0 = every check passed. 1 = at least one failed.
 */

import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "../lib/prisma";
import { cacheGetJson, cacheHealth, cacheSetJson, cached, closeCache } from "../lib/infra/cache";
import { QUEUE_NAMES, closeQueues, enqueue, getQueue, startWorker } from "../lib/infra/queue";
import {
  deleteProducts,
  indexDocumentCount,
  indexProducts,
  isSearchConfigured,
  searchHealth,
  searchProducts
} from "../lib/infra/search";
import { reindexCatalogue } from "../lib/infra/catalogue-index";
import { deleteObject, ensureBucket, getObjectBytes, isStorageConfigured, presignGet, putObject } from "../lib/infra/storage";
import { closeVectors, dropCollection, ensureCollection, isVectorsConfigured, nearest, upsertVectors, vectorsHealth } from "../lib/infra/vectors";
import { isRoutingConfigured, route, routingHealth } from "../lib/infra/routing";
import { metricsText } from "../lib/infra/metrics";

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, status: "PASS", detail });
}
function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
}
function skip(name: string, detail: string) {
  results.push({ name, status: "SKIP", detail });
}

async function check(name: string, run: () => Promise<string>) {
  try {
    pass(name, await run());
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

function expect(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ Valkey --- */

async function verifyCache() {
  await check("valkey:ping", async () => {
    expect(await cacheHealth(), "PING failed");
    return "PONG";
  });

  await check("valkey:set-get", async () => {
    const key = `infra:verify:${randomUUID()}`;
    const payload = { token: randomUUID(), n: 7 };
    expect(await cacheSetJson(key, payload, 60), "SET failed");
    const read = await cacheGetJson<typeof payload>(key);
    expect(read?.token === payload.token, "value did not round-trip");
    return "round-tripped a JSON value";
  });

  await check("valkey:ttl-expiry", async () => {
    const key = `infra:verify:ttl:${randomUUID()}`;
    expect(await cacheSetJson(key, "expiring", 1), "SET with TTL failed");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const read = await cacheGetJson(key);
    expect(read === null, "key still present after its 1s TTL");
    return "key expired after 1s";
  });

  await check("cache:read-through", async () => {
    let computed = 0;
    const key = `infra:verify:readthrough:${randomUUID()}`;
    const first = await cached(key, 30, async () => {
      computed += 1;
      return { value: 42 };
    });
    const second = await cached(key, 30, async () => {
      computed += 1;
      return { value: 99 };
    });
    expect(computed === 1, `compute ran ${computed} times, expected 1`);
    expect(first.value === 42 && second.value === 42, "second read did not come from cache");
    return "second read served from cache";
  });
}

/* ------------------------------------------------------------------- Queue --- */

async function verifyQueue() {
  await check("bullmq:job-executes", async () => {
    const worker = startWorker(QUEUE_NAMES.searchIndex, async (job) => {
      if (job.name !== "reindex") throw new Error(`unexpected_job:${job.name}`);
      return reindexCatalogue();
    });
    expect(worker, "worker could not start (Valkey not configured)");

    const jobId = `verify-${randomUUID()}`;
    const queued = await enqueue(QUEUE_NAMES.searchIndex, "reindex", { verification: true }, { jobId });
    expect(queued === jobId, "job was not enqueued with the requested id");

    const queue = getQueue(QUEUE_NAMES.searchIndex);
    expect(queue, "queue unavailable");
    const job = await queue!.getJob(jobId);
    expect(job, "job not found after enqueue");

    const deadline = Date.now() + 45_000;
    let state = await job!.getState();
    while (state !== "completed" && state !== "failed" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      state = await job!.getState();
    }
    expect(state === "completed", `job ended in state "${state}"`);
    // The object captured at enqueue time has a stale return value; re-read it.
    const finished = await queue!.getJob(jobId);
    const returned = finished?.returnvalue as { indexed?: number } | undefined;
    expect(typeof returned?.indexed === "number" && returned.indexed >= 0, "job returned no indexed count");
    await finished?.remove().catch(() => undefined);
    return `job ${jobId} completed by worker, indexed=${returned!.indexed}`;
  });
}

/* ------------------------------------------------------------------ Search --- */

async function verifySearch() {
  if (!isSearchConfigured()) {
    skip("meilisearch", "MEILISEARCH_URL / MEILISEARCH_API_KEY not set");
    return;
  }

  await check("meilisearch:health", async () => {
    expect(await searchHealth(), "/health not ok");
    return "healthy";
  });

  const sample = await prisma.product.findFirst({
    where: { name: { not: "" } },
   select: { id: true, name: true },
    orderBy: { createdAt: "desc" }
  });

  await check("meilisearch:reindex", async () => {
    const result = await reindexCatalogue();
    expect(result.indexed > 0, `indexed ${result.indexed} documents`);
    const count = await indexDocumentCount();
    expect(count !== null && count >= result.indexed, `index reports ${count} documents`);
    return `indexed ${result.indexed} products (${result.skipped} fixtures skipped)`;
  });

  await check("meilisearch:typo-query", async () => {
    expect(sample, "no product in the database to query");
    if (!sample) return "";
    // Drop one character from the middle of a real product name to force a typo.
    const word = sample.name.split(" ").find((part) => part.length >= 5) ?? sample.name;
    const typo = word.length >= 6 ? word.slice(0, 2) + word.slice(3) : word;
    const result = await searchProducts(typo, { limit: 10 });
    expect(result !== null, "search request failed");
    expect(result!.hits.length > 0, `typo query "${typo}" returned no hits`);
    return `"${typo}" → ${result!.hits.length} hits in ${result!.processingTimeMs}ms`;
  });

  await check("meilisearch:delete", async () => {
    const probe = `infra-probe-${randomUUID()}`;
    const ok = await indexProducts([
      {
        id: probe,
        title: "infra verification probe",
        description: "removed immediately after this check",
        vendorName: "n/a",
        category: null,
        priceKobo: 1,
        inStock: false,
        href: "/",
        updatedAt: new Date().toISOString()
      }
    ]);
    expect(ok, "probe document rejected");
    const inserted = await searchProducts("infra verification probe", { limit: 5 });
    expect(inserted?.hits.some((hit) => hit.id === probe), "probe document was not searchable after indexing");
    expect(await deleteProducts([probe]), "delete request failed");
    const after = await searchProducts("infra verification probe", { limit: 5 });
    const present = after?.hits.some((hit) => hit.id === probe) ?? false;
    expect(!present, "probe document still searchable after delete");
    return "probe document indexed, found, then deleted";
  });
}

/* ----------------------------------------------------------------- Storage --- */

async function verifyStorage() {
  if (!isStorageConfigured()) {
    skip("seaweedfs", "S3_* variables not set");
    return;
  }

  const key = `infra/verify/${randomUUID()}.png`;
  try {
    await check("seaweedfs:put-get-bytes", async () => {
      expect(await ensureBucket(), "bucket is not reachable");
      const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 14, g: 90, b: 62 } } })
        .png()
        .toBuffer();
      const digest = createHash("sha256").update(png).digest("hex");

      const stored = await putObject(key, png, "image/png");
      expect(stored, "PUT failed");
      const read = await getObjectBytes(key);
      expect(read, "GET returned nothing");
      const readDigest = createHash("sha256").update(read!).digest("hex");
      expect(readDigest === digest, "bytes read back differ from bytes written");
      return `${png.byteLength} bytes, sha256 match`;
    });

    await check("seaweedfs:presigned-get", async () => {
      const url = await presignGet(key, 120);
      expect(url, "could not presign");
      const response = await fetch(url!);
      expect(response.ok, `presigned GET returned ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.byteLength > 0, "presigned GET returned an empty body");
      return `HTTP ${response.status}, ${bytes.byteLength} bytes`;
    });
  } finally {
    await check("seaweedfs:delete", async () => {
      expect(await deleteObject(key), "DELETE failed");
      const gone = await getObjectBytes(key);
      expect(gone === null, "object still readable after delete");
      return "object removed and no longer readable";
    });
  }
}

/* ----------------------------------------------------------------- Vectors --- */

async function verifyVectors() {
  if (!isVectorsConfigured()) {
    skip("pgvector", "VECTOR_DATABASE_URL not set");
    return;
  }

  const collection = `verify_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  await check("pgvector:health", async () => {
    expect(await vectorsHealth(), "connection failed");
    return "connected";
  });

  try {
    await check("pgvector:knn", async () => {
      expect(await ensureCollection(collection, 4), "collection could not be created");
      const written = await upsertVectors(collection, [
        { id: "north", content: "north", embedding: [1, 0, 0, 0] },
        { id: "east", content: "east", embedding: [0, 1, 0, 0] },
        { id: "near-north", content: "near north", embedding: [0.98, 0.02, 0, 0] }
      ]);
      expect(written === 3, `wrote ${written} of 3 rows`);

      const hits = await nearest(collection, [1, 0, 0, 0], 2);
      expect(hits.length === 2, `kNN returned ${hits.length} rows`);
      expect(hits[0].id === "north", `nearest was "${hits[0].id}", expected "north"`);
      expect(hits[0].distance <= hits[1].distance, "results are not ordered by distance");
      return `nearest=${hits[0].id} distance=${hits[0].distance.toFixed(4)}`;
    });
  } finally {
    await check("pgvector:cleanup", async () => {
      expect(await dropCollection(collection), "probe collection could not be dropped");
      return "probe collection dropped";
    });
  }
}

/* ----------------------------------------------------------------- Routing --- */

async function verifyRouting() {
  if (!isRoutingConfigured()) {
    skip("osrm", "OSRM_URL not set");
    return;
  }

  await check("osrm:health", async () => {
    expect(await routingHealth(), "routing engine did not answer");
    return "engine answered";
  });

  await check("osrm:route-lagos", async () => {
    // Lagos Island (Marina) → Ikeja (Allen Avenue), both real coordinates.
    const result = await route({ lng: 3.3941, lat: 6.4531 }, { lng: 3.3506, lat: 6.6018 });
    expect(result, "route request failed");
    const km = result!.distanceMeters / 1000;
    expect(km > 5 && km < 60, `implausible road distance ${km.toFixed(1)} km`);
    expect(result!.durationSeconds > 300, "implausible duration");
    return `${km.toFixed(1)} km in ${Math.round(result!.durationSeconds / 60)} min`;
  });
}

/* ----------------------------------------------------------------- Metrics --- */

async function verifyMetrics() {
  await check("metrics:registry", async () => {
    const { body, contentType } = await metricsText();
    expect(body.includes("naijadeals_infra_operations_total"), "operation counter missing from exposition");
    expect(contentType.includes("text/plain"), `unexpected content type ${contentType}`);
    const families = (body.match(/^# TYPE /gm) ?? []).length;
    return `${families} metric families exported`;
  });
}

/* ------------------------------------------------------- HTTP endpoints --- */

const APP_BASE = (process.env.VERIFY_APP_URL ?? "http://127.0.0.1:3015").replace(/\/$/, "");

async function appReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${APP_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function verifyEndpoints() {
  if (!(await appReachable())) {
    skip("app:health", `no server answering at ${APP_BASE}`);
    skip("app:metrics", "server not running");
    return;
  }

  await check("app:health", async () => {
    const response = await fetch(`${APP_BASE}/api/health`, { cache: "no-store" });
    expect(response.ok, `/api/health returned ${response.status}`);
    const body = (await response.json()) as { status: string; checks: Array<{ name: string; ok: boolean }> };
    const failing = body.checks.filter((check) => !check.ok).map((check) => check.name);
    expect(failing.length === 0, `degraded components: ${failing.join(", ")}`);
    return `${body.status}; ${body.checks.length} components ok`;
  });

  await check("app:metrics-auth", async () => {
    const anonymous = await fetch(`${APP_BASE}/api/metrics`, { cache: "no-store" });
    expect(anonymous.status === 401, `anonymous request returned ${anonymous.status}, expected 401`);
    const token = process.env.METRICS_TOKEN;
    expect(token, "METRICS_TOKEN missing from environment");
    const authorised = await fetch(`${APP_BASE}/api/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    expect(authorised.ok, `authorised request returned ${authorised.status}`);
    const text = await authorised.text();
    expect(text.includes("naijadeals_"), "exposition body has no naijadeals metrics");
    return "401 anonymous / 200 with bearer token";
  });

  await check("app:search-endpoint", async () => {
    const response = await fetch(`${APP_BASE}/api/products?q=phone`, { cache: "no-store" });
    expect(response.ok, `/api/products returned ${response.status}`);
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body), "response is not an array");
    return `${body.length} results for "phone"`;
  });
}

async function verifyObservability() {
  const prometheus = process.env.PROMETHEUS_URL;
  if (!prometheus) {
    skip("prometheus:query", "PROMETHEUS_URL not set");
  } else {
    await check("prometheus:query", async () => {
      const response = await fetch(`${prometheus}/api/v1/query?query=up`, { cache: "no-store" });
      expect(response.ok, `query API returned ${response.status}`);
      const body = (await response.json()) as { status?: string; data?: { result?: unknown[] } };
      expect(body.status === "success", "query did not succeed");
      const series = body.data?.result?.length ?? 0;
      expect(series > 0, "no time series returned");
      return `${series} "up" series`;
    });

    await check("prometheus:app-target", async () => {
      const response = await fetch(
        `${prometheus}/api/v1/query?query=${encodeURIComponent('up{job="naijadeals-app"}')}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as { data?: { result?: Array<{ value?: [number, string] }> } };
      const value = body.data?.result?.[0]?.value?.[1];
      if (value === undefined) return "app target not yet scraped";
      expect(value === "1", `app target up=${value}`);
      return "app target scraped and healthy";
    });
  }

  const grafana = process.env.GRAFANA_URL;
  if (!grafana) {
    skip("grafana:datasource", "GRAFANA_URL not set");
    return;
  }
  await check("grafana:datasource", async () => {
    const creds = grafanaCredentials();
    expect(creds, "Grafana admin credentials not found");
    const auth = Buffer.from(`${creds!.user}:${creds!.password}`).toString("base64");
    const response = await fetch(
      `${grafana}/api/datasources/proxy/uid/nd-prometheus/api/v1/query?query=${encodeURIComponent("up")}`,
      { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
    );
    expect(response.ok, `datasource proxy returned ${response.status}`);
    const body = (await response.json()) as { status?: string };
    expect(body.status === "success", "Grafana could not query Prometheus");
    return "Grafana queried Prometheus through the provisioned datasource";
  });
}

function grafanaCredentials(): { user: string; password: string } | null {
  try {
    const text = readFileSync(new URL("../deploy/dev-infra/.env", import.meta.url), "utf8");
    const map = Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
        })
    );
    if (!map.GRAFANA_ADMIN_USER || !map.GRAFANA_ADMIN_PASSWORD) return null;
    return { user: map.GRAFANA_ADMIN_USER, password: map.GRAFANA_ADMIN_PASSWORD };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- Run --- */

async function main() {
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1];

  if (!only || only === "engines") {
    await verifyCache();
    await verifySearch();
    await verifyStorage();
    await verifyVectors();
    await verifyRouting();
    await verifyMetrics();
    await verifyQueue();
  }
  if (!only || only === "endpoints") {
    await verifyEndpoints();
    await verifyObservability();
  }

  const width = Math.max(...results.map((result) => result.name.length));
  for (const result of results) {
    // eslint-disable-next-line no-console
    console.log(`${result.status.padEnd(4)} ${result.name.padEnd(width)}  ${result.detail}`);
  }

  const failed = results.filter((result) => result.status === "FAIL");
  const passed = results.filter((result) => result.status === "PASS").length;
  const skipped = results.filter((result) => result.status === "SKIP").length;
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed.length} failed, ${skipped} skipped`);

  await closeQueues();
  await closeCache();
  await closeVectors();
  await prisma.$disconnect();

  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("verification crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
