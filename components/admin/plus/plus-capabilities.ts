import type { SessionUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import type { PlusCapabilities } from "./plus-api";

/**
 * Server-side capability resolution for the Plus+ Control Center.
 *
 * The Plus+ API enforces its own permissions; this only decides which controls
 * the UI may present. The permission names are part of the fixed Plus+ API
 * contract. They are compared as strings so that a backend rollout of the
 * permission list does not require a matching UI type change, and a name the
 * backend has not declared grants nothing here (the API remains the authority).
 *
 * A super administrator holds every permission by the existing role model, so
 * super admin receives the full set even before the permission constants are
 * visible in this build.
 */
export const PLUS_PERMISSION_NAMES = {
  contentRead: "plus:content:read",
  contentWrite: "plus:content:write",
  contentPublish: "plus:content:publish",
  membershipConfigure: "plus:membership:configure",
  advertiserApprove: "plus:advertiser:approve"
} as const;

export function plusCapabilitiesFor(user: SessionUser): PlusCapabilities {
  const held = new Set<string>(permissionsFor(user).map((permission) => String(permission)));
  const superAdmin = isSuperAdmin(user);
  const has = (permission: string) => superAdmin || held.has(permission);

  const writeContent = has(PLUS_PERMISSION_NAMES.contentWrite);
  const publishContent = has(PLUS_PERMISSION_NAMES.contentPublish);
  const configureMembership = has(PLUS_PERMISSION_NAMES.membershipConfigure);
  const approveAdvertiser = has(PLUS_PERMISSION_NAMES.advertiserApprove);

  return {
    // Reading the workspace requires the read permission or any authority that
    // necessarily implies it (a writer or publisher must be able to see the
    // records they act on). The API still decides what each request may return.
    read:
      has(PLUS_PERMISSION_NAMES.contentRead) ||
      writeContent ||
      publishContent ||
      configureMembership ||
      approveAdvertiser,
    writeContent,
    publishContent,
    configureMembership,
    approveAdvertiser
  };
}
