import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * One Prometheus registry for the whole process.
 *
 * Next.js re-evaluates modules on hot reload in development, and prom-client
 * throws when a metric name is registered twice. The registry therefore lives
 * on `globalThis`, guarded by a symbol-free key that survives module reloads.
 */

type InfraMetrics = {
  registry: Registry;
  operations: Counter<"component" | "operation" | "result">;
  operationDuration: Histogram<"component" | "operation">;
  up: Gauge<"component">;
  cacheRequests: Counter<"result">;
  cacheHits: Counter<string>;
  queueDepth: Gauge<"queue">;
  queueJobs: Counter<"queue" | "event">;
};

const globalKey = "__naijadealsInfraMetrics" as const;
type GlobalWithMetrics = typeof globalThis & { [globalKey]?: InfraMetrics };

function build(): InfraMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "naijadeals_process_" });

  const metrics: InfraMetrics = {
    registry,
    operations: new Counter({
      name: "naijadeals_infra_operations_total",
      help: "Infrastructure operations attempted, labelled by component, operation and result.",
      labelNames: ["component", "operation", "result"] as const,
      registers: [registry]
    }),
    operationDuration: new Histogram({
      name: "naijadeals_infra_operation_duration_seconds",
      help: "Latency of infrastructure operations.",
      labelNames: ["component", "operation"] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry]
    }),
    up: new Gauge({
      name: "naijadeals_infra_up",
      help: "1 when the last health probe for a component succeeded, 0 otherwise.",
      labelNames: ["component"] as const,
      registers: [registry]
    }),
    cacheRequests: new Counter({
      name: "naijadeals_cache_requests_total",
      help: "Cache lookups, labelled by result.",
      labelNames: ["result"] as const,
      registers: [registry]
    }),
    cacheHits: new Counter({
      name: "naijadeals_cache_hits_total",
      help: "Cache lookups that returned a stored value.",
      registers: [registry]
    }),
    queueDepth: new Gauge({
      name: "naijadeals_queue_depth",
      help: "Jobs waiting in a queue at the last sample.",
      labelNames: ["queue"] as const,
      registers: [registry]
    }),
    queueJobs: new Counter({
      name: "naijadeals_queue_jobs_total",
      help: "Queue job lifecycle events.",
      labelNames: ["queue", "event"] as const,
      registers: [registry]
    })
  };

  return metrics;
}

export function infraMetrics(): InfraMetrics {
  const scope = globalThis as GlobalWithMetrics;
  if (!scope[globalKey]) scope[globalKey] = build();
  return scope[globalKey]!;
}

/** Record one infrastructure operation, successful or not. */
export function recordOperation(
  component: string,
  operation: string,
  result: "ok" | "error",
  durationMs: number
): void {
  const m = infraMetrics();
  m.operations.inc({ component, operation, result });
  m.operationDuration.observe({ component, operation }, durationMs / 1000);
  if (operation === "health") m.up.set({ component }, result === "ok" ? 1 : 0);
}

export function recordCache(result: "hit" | "miss" | "error"): void {
  const m = infraMetrics();
  m.cacheRequests.inc({ result });
  if (result === "hit") m.cacheHits.inc();
}

export async function metricsText(): Promise<{ body: string; contentType: string }> {
  const m = infraMetrics();
  return { body: await m.registry.metrics(), contentType: m.registry.contentType };
}
