import type { PlusPromotion } from "@prisma/client";
import { ApiError, requireAdmin } from "@/lib/auth/guard";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { getPromotion } from "@/lib/services/plus/promotion.service";

/**
 * Kind-dependent promotion guards.
 *
 * House content is editorial and uses `plus:content:publish`; sponsored content
 * is reviewed by the advertiser reviewer. The route resolves the row first so
 * the caller cannot choose which rule applies by supplying a kind.
 */
/** Route gate when the service will choose between two capabilities from the
 * stored row state (for example writer for DRAFT, publisher for PUBLISHED). */
export async function requireAnyAdminPermission(permissions: readonly Permission[]): Promise<SessionUser> {
  const actor = await requireAdmin();
  if (!permissions.some((permission) => hasPermission(actor, permission))) {
    throw new ApiError(403, "permission_denied", `One of these permissions is required: ${permissions.join(", ")}.`);
  }
  return actor;
}

export async function requirePromotionPermission(
  id: string,
  required: { house: Permission; sponsored: Permission }
): Promise<{ actor: SessionUser; promotion: PlusPromotion }> {
  const actor = await requireAdmin();
  if (!hasPermission(actor, "plus:content:read")) {
    throw new ApiError(403, "permission_denied", 'The "plus:content:read" permission is required for this action.');
  }
  const promotion = await getPromotion(id);
  const permission = promotion.kind === "HOUSE" ? required.house : required.sponsored;
  if (!hasPermission(actor, permission)) {
    throw new ApiError(403, "permission_denied", `The "${permission}" permission is required for this action.`);
  }
  return { actor, promotion };
}
