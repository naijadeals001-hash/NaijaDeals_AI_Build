import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { infraConfig } from "@/lib/infra/config";
import { metricsText } from "@/lib/infra/metrics";

/**
 * Prometheus exposition endpoint.
 *
 * Fails closed: with no `METRICS_TOKEN` configured the route does not exist, so
 * an unconfigured deployment cannot leak process, queue and cache telemetry.
 * Prometheus reads the token from a mounted file rather than the config.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(request: NextRequest, expected: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}

export async function GET(request: NextRequest) {
  const token = infraConfig().metricsToken;
  if (!token) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!authorised(request, token)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="metrics"' }
    });
  }

  const { body, contentType } = await metricsText();
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store" }
  });
}
