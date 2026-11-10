import { infraConfig } from "./config";
import { recordOperation } from "./metrics";

/**
 * Road routing via OSRM.
 *
 * NaijaDrive quotes and NaijaSend delivery estimates need a road distance, not
 * a straight line. Coordinates are (longitude, latitude) — the order OSRM uses
 * and the reverse of how maps usually display them.
 */

export type Coordinate = { lng: number; lat: number };

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  profile: "driving";
  provider: "osrm";
};

function endpoint(): string | null {
  return infraConfig().osrm?.url ?? null;
}

function valid(point: Coordinate): boolean {
  return (
    Number.isFinite(point.lng) &&
    Number.isFinite(point.lat) &&
    point.lng >= -180 &&
    point.lng <= 180 &&
    point.lat >= -85 &&
    point.lat <= 85
  );
}

export function isRoutingConfigured(): boolean {
  return Boolean(endpoint());
}

export async function route(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
  const base = endpoint();
  if (!base || !valid(from) || !valid(to)) return null;

  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(
      `${base}/route/v1/driving/${path}?overview=false&alternatives=false&steps=false`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) {
      recordOperation("osrm", "route", "error", Date.now() - startedAt);
      return null;
    }
    const body = (await response.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number }>;
    };
    const best = body.routes?.[0];
    if (body.code !== "Ok" || !best || typeof best.distance !== "number" || typeof best.duration !== "number") {
      recordOperation("osrm", "route", "error", Date.now() - startedAt);
      return null;
    }
    recordOperation("osrm", "route", "ok", Date.now() - startedAt);
    return {
      distanceMeters: Math.round(best.distance),
      durationSeconds: Math.round(best.duration),
      profile: "driving",
      provider: "osrm"
    };
  } catch {
    recordOperation("osrm", "route", "error", Date.now() - startedAt);
    return null;
  }
}

export async function routingHealth(): Promise<boolean> {
  const base = endpoint();
  if (!base) return false;
  const startedAt = Date.now();
  try {
    const response = await fetch(`${base}/nearest/v1/driving/3.3792,6.5244?number=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    const ok = response.ok;
    recordOperation("osrm", "health", ok ? "ok" : "error", Date.now() - startedAt);
    return ok;
  } catch {
    recordOperation("osrm", "health", "error", Date.now() - startedAt);
    return false;
  }
}
