import { NextResponse } from "next/server";
import type { SessionUser } from "./session";
import { getSessionUser, isAdmin, isCourier, isDriver, isSuperAdmin, isVendor } from "./session";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new ApiError(403, "forbidden", "Administrator access is required.");
  return user;
}

/**
 * Super-administrator check. This is deliberately stricter than requireAdmin:
 * it requires the `super_admin` role and cannot be satisfied by actorType alone.
 * Use it for platform-wide settings and other privileged operations.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    throw new ApiError(403, "super_admin_required", "Super-administrator access is required.");
  }
  return user;
}

export async function requireVendor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isVendor(user) || user.vendors.length === 0) {
    throw new ApiError(403, "forbidden", "A verified seller account is required.");
  }
  return user;
}

export async function requireCourier(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isCourier(user)) throw new ApiError(403, "forbidden", "Courier access is required.");
  return user;
}

export async function requireDriver(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isDriver(user)) throw new ApiError(403, "forbidden", "Driver access is required.");
  return user;
}

/**
 * Reject cross-site state-changing requests. Cookie auth is SameSite=Lax, and
 * this Origin check adds a second line of defence for form/fetch submissions.
 */
export function assertSameOrigin(request: Request) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients that already hold an HttpOnly cookie must opt in with Origin.
    throw new ApiError(403, "origin_required", "This request must include an Origin header.");
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    /* ignore malformed request URLs */
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      /* ignore malformed env value */
    }
  }
  if (!allowed.has(origin)) {
    throw new ApiError(403, "origin_rejected", "Cross-site requests are not allowed.");
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function requireString(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "validation_error", `${field} is required.`);
  }
  if (value.trim().length > max) {
    throw new ApiError(400, "validation_error", `${field} must be ${max} characters or fewer.`);
  }
  return value.trim();
}

export function optionalString(value: unknown, max = 1000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "Expected a string value.");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, "validation_error", `Value must be ${max} characters or fewer.`);
  return trimmed || null;
}

export function requireNumber(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, "validation_error", `${field} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  // Prisma "not found" errors are surfaced as 404 rather than leaking internals.
  if (/No .* found|not found/i.test(message) && /find|Record/i.test(message)) {
    return NextResponse.json({ error: "Resource not found.", code: "not_found" }, { status: 404 });
  }
  console.error("[api]", error);
  return NextResponse.json({ error: message, code: "server_error" }, { status: 500 });
}
