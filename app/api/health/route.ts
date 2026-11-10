import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { infraConfig } from "@/lib/infra/config";
import { cacheHealth } from "@/lib/infra/cache";
import { searchHealth } from "@/lib/infra/search";
import { storageHealth } from "@/lib/infra/storage";
import { vectorsHealth } from "@/lib/infra/vectors";
import { routingHealth } from "@/lib/infra/routing";
import { workerIsAlive } from "@/lib/infra/heartbeat";

/**
 * Liveness and readiness for the application and its optional infrastructure.
 *
 * `database` is the only critical dependency: without it nothing in the
 * marketplace works, so a database failure returns 503. A missing or unreachable
 * auxiliary engine returns `degraded` with 200, because the product still
 * serves catalogue, cart and wallet traffic without it.
 *
 * No secret, DSN, host or driver error text is returned.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Check = { name: string; ok: boolean; critical: boolean };

async function databaseCheck(): Promise<Check> {
  try {
    await prisma.$queryRawUnsafe("select 1 as ok");
    return { name: "database", ok: true, critical: true };
  } catch {
    return { name: "database", ok: false, critical: true };
  }
}

async function prometheusCheck(url: string): Promise<Check> {
  try {
    const response = await fetch(`${url}/-/ready`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return { name: "prometheus", ok: response.ok, critical: false };
  } catch {
    return { name: "prometheus", ok: false, critical: false };
  }
}

async function grafanaCheck(url: string): Promise<Check> {
  try {
    const response = await fetch(`${url}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return { name: "grafana", ok: response.ok, critical: false };
  } catch {
    return { name: "grafana", ok: false, critical: false };
  }
}

export async function GET() {
  const config = infraConfig();

  const configured: Array<Promise<Check>> = [databaseCheck()];
  if (config.valkeyUrl) configured.push(cacheHealth().then((ok) => ({ name: "valkey", ok, critical: false })));
  if (config.valkeyUrl) {
    // A healthy queue backend says nothing about whether anything consumes it.
    configured.push(
      workerIsAlive().then(({ alive }) => ({ name: "worker", ok: alive, critical: false }))
    );
  }
  if (config.meilisearch) configured.push(searchHealth().then((ok) => ({ name: "meilisearch", ok, critical: false })));
  if (config.s3) configured.push(storageHealth().then((ok) => ({ name: "seaweedfs", ok, critical: false })));
  if (config.vectors) configured.push(vectorsHealth().then((ok) => ({ name: "pgvector", ok, critical: false })));
  if (config.osrm) configured.push(routingHealth().then((ok) => ({ name: "osrm", ok, critical: false })));
  if (config.prometheus) configured.push(prometheusCheck(config.prometheus.url));
  if (process.env.GRAFANA_URL) configured.push(grafanaCheck(process.env.GRAFANA_URL));

  const checks = await Promise.all(configured);
  const criticalFailure = checks.some((check) => check.critical && !check.ok);
  const degraded = checks.some((check) => !check.ok);

  const status = criticalFailure ? "error" : degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      checks,
      checkedAt: new Date().toISOString()
    },
    { status: criticalFailure ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
