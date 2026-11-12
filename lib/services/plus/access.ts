import { ApiError } from "@/lib/auth/api-error";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Service-layer permission checks.
 *
 * Routes use `requireAdminPermission` as the first gate. Services repeat the
 * check so an internal caller cannot bypass the route and, for kind-dependent
 * promotion actions, obtain the exact capability the operation requires.
 */
export function requirePlusPermission(actor: SessionUser, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw new ApiError(403, "permission_denied", `The "${permission}" permission is required for this action.`);
  }
}

export function requireAnyPlusPermission(actor: SessionUser, permissions: readonly Permission[]): void {
  if (!permissions.some((permission) => hasPermission(actor, permission))) {
    throw new ApiError(403, "permission_denied", `One of these permissions is required: ${permissions.join(", ")}.`);
  }
}
