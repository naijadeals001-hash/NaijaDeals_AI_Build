import { NextResponse } from "next/server";
import type { SessionUser } from "./session";
import { getSessionUser, isAdmin, isCourier, isDriver, isSuperAdmin, isVendor, roleNames } from "./session";
import { ApiError } from "./api-error";
import { hasPermission, isStaffRole, type Permission } from "./permissions";

export { ApiError } from "./api-error";

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return user;
}

/**
 * Control Center console access.
 *
 * Full administrators keep platform-wide access; scoped staff (ops, finance,
 * support, moderator) may enter the console but only reach what their explicit
 * permissions and region scope allow. Role administration remains super-admin
 * only and is not implied by this check.
 */
export function hasAdminConsoleAccess(user: SessionUser): boolean {
  return isAdmin(user) || roleNames(user).some((name) => isStaffRole(name));
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAdminConsoleAccess(user)) {
    throw new ApiError(403, "forbidden", "Administrator access is required.");
  }
  return user;
}

/**
 * Administrator check plus an explicit permission.
 *
 * `admin` and `super_admin` keep their existing platform-wide capabilities,
 * while scoped staff roles (ops, finance, support, moderator) only receive the
 * permissions listed in `lib/auth/permissions.ts`.
 */
export async function requireAdminPermission(permission: Permission): Promise<SessionUser> {
  const user = await requireAdmin();
  if (!hasPermission(user, permission)) {
    throw new ApiError(403, "permission_denied", `The "${permission}" permission is required for this action.`);
  }
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

/** Vendor writes are blocked while the seller account is suspended; reads stay available. */
export async function requireActiveVendor(): Promise<SessionUser> {
  const user = await requireVendor();
  const vendor = user.vendors[0];
  if (vendor?.status === "SUSPENDED") {
    throw new ApiError(
      403,
      "vendor_suspended",
      vendor.suspendedReason ? `Seller account suspended: ${vendor.suspendedReason}` : "Seller account suspended."
    );
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
