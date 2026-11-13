import type { SessionUser } from "./session";
import { roleNames } from "./session";

/**
 * Explicit Control Center permissions.
 *
 * Each permission maps to a concrete server-side capability; routes ask for the
 * permission they actually need rather than testing a role name. Role names are
 * only used to look up the permission set below.
 */
export const PERMISSIONS = [
  "dashboard:read",
  /// Homepage design variants and hero slides (Control Center → Homepage).
  "homepage:write",
  "orders:read",
  "orders:write",
  "deliveries:read",
  "deliveries:write",
  "rides:read",
  "rides:write",
  "products:read",
  "products:moderate",
  "vendors:read",
  "vendors:review",
  "users:read",
  "finance:read",
  "finance:payouts:write",
  "finance:escrow:settle",
  "audit:read",
  "roles:write",
  "countries:write",
  "disputes:read",
  "disputes:write",
  "gigs:read",
  "gigs:moderate",
  "stream:read",
  "stream:write",
  "affiliates:read",
  "affiliates:manage",
  /// NaijaDeals Plus+ configuration. Read covers viewing cards, plans,
  /// benefits, promotions and the overview; write covers draft editing.
  "plus:content:read",
  "plus:content:write",
  /// Publication and archival are separate from drafting so a prepared card
  /// cannot be made public by the same role that wrote it.
  "plus:content:publish",
  /// Plan, country, term and staff membership administration. There is no
  /// customer purchase path behind this permission.
  "plus:membership:configure",
  /// Reviewing sponsored promotions. House promotions use content publish.
  "plus:advertiser:approve",
  /// Central service activation (GLOBAL / COUNTRY / CITY). This changes what
  /// customers can reach across the ecosystem, so it is super-admin only.
  "verticals:write"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Plus+ capabilities that ordinary administrators deliberately do not hold.
 *
 * Publication, membership/price administration and advertiser approval each
 * carry named accountability, so they belong to the dedicated Plus+ roles or
 * `super_admin` only. An ordinary `admin` may draft and edit Plus+ content but
 * cannot publish it, configure plan terms or approve a sponsor.
 */
const PLUS_WITHHELD_FROM_ADMIN: readonly Permission[] = [
  "plus:content:publish",
  "plus:membership:configure",
  "plus:advertiser:approve"
] as const;

/**
 * Service activation is a platform-wide switch. It is deliberately withheld
 * from the ordinary `admin` role: changing what every customer can reach must
 * be an attributable super-administrator action.
 */
const SUPER_ADMIN_ONLY: readonly Permission[] = ["verticals:write"] as const;

/**
 * Role to permission mapping.
 *
 * - `super_admin` holds every permission, including role administration.
 * - `admin` keeps the pre-existing operational surface (orders, deliveries,
 *   rides, catalogue, vendors, finance, audit) but deliberately cannot grant
 *   roles or exercise Plus+'s publication/membership/advertiser powers.
 * - `ops`, `finance`, `support` and `moderator` are narrow staff roles.
 * - The `plus_*` roles are single-capability editorial and commercial roles.
 */
const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  // Read-only affiliate review. Deliberately narrow: inspection without any
  // authority to resolve, approve or move money.
  affiliate_reviewer: ["affiliates:read"],
  // Plus+ draft editing. Cannot publish, configure commercial terms or approve
  // an advertiser.
  plus_editor: ["plus:content:read", "plus:content:write"],
  // Plus+ publication and archival. Cannot draft or edit new content.
  plus_publisher: ["plus:content:read", "plus:content:publish"],
  // Plan, country, term and staff membership administration.
  plus_membership_admin: ["plus:content:read", "plus:membership:configure"],
  // Sponsored-promotion review only.
  plus_advertiser_reviewer: ["plus:content:read", "plus:advertiser:approve"],
  admin: PERMISSIONS.filter(
    (permission) =>
      permission !== "roles:write" &&
      !PLUS_WITHHELD_FROM_ADMIN.includes(permission) &&
      !SUPER_ADMIN_ONLY.includes(permission)
  ),
  ops: [
    "dashboard:read",
    "disputes:read",
    "orders:read",
    "orders:write",
    "deliveries:read",
    "deliveries:write",
    "rides:read",
    "rides:write",
    "products:read",
    "vendors:read",
    "users:read",
    "gigs:read",
    "stream:read"
  ],
  finance: [
    "dashboard:read",
    "orders:read",
    "deliveries:read",
    "finance:read",
    "finance:payouts:write",
    "finance:escrow:settle",
    "audit:read",
    "gigs:read",
    "stream:read"
  ],
  support: [
    "dashboard:read",
    "orders:read",
    "deliveries:read",
    "rides:read",
    "vendors:read",
    "users:read",
    "disputes:read",
    "gigs:read",
    "stream:read"
  ],
  moderator: [
    "dashboard:read",
    "orders:read",
    "products:read",
    "products:moderate",
    "vendors:read",
    "vendors:review",
    "gigs:read",
    "gigs:moderate",
    "stream:read",
    "stream:write"
  ]
};

/** Roles that grant Control Center access at all. */
export const STAFF_ROLES = [
  "super_admin",
  "admin",
  "ops",
  "finance",
  "support",
  "moderator",
  "affiliate_reviewer",
  "plus_editor",
  "plus_publisher",
  "plus_membership_admin",
  "plus_advertiser_reviewer"
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(name: string): name is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(name);
}

/**
 * Permissions held by a session user.
 *
 * An ADMIN actor with no role rows at all keeps the legacy `admin` surface.
 * Any explicit role assignment is authoritative: an unknown role name grants
 * nothing, so a typo or a stale role cannot silently escalate its holder to
 * full administration. A mixture grants only what the recognised roles hold.
 */
export function permissionsFor(user: SessionUser): Permission[] {
  const names = roleNames(user);
  const granted = new Set<Permission>();

  for (const name of names) {
    const set = ROLE_PERMISSIONS[name];
    if (!set) continue;
    for (const permission of set) granted.add(permission);
  }

  if (names.length === 0 && user.actorType === "ADMIN") {
    for (const permission of ROLE_PERMISSIONS.admin) granted.add(permission);
  }

  return [...granted];
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  return permissionsFor(user).includes(permission);
}

/** Permissions the actor does not hold but `roles` would grant. */
export function unheldPermissions(actor: SessionUser, roles: string[]): Permission[] {
  const actorPermissions = new Set(permissionsFor(actor));
  const requested = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) requested.add(permission);
  }
  return [...requested].filter((permission) => !actorPermissions.has(permission));
}

/**
 * Region scope helpers.
 *
 * A null scope country means platform-wide. Because existing accounts have no
 * scope, their behaviour is unchanged; scoped staff are restricted to the
 * country (and optionally the city) recorded on their account.
 */
export type RegionTarget = {
  countryCode?: string | null;
  city?: string | null;
};

export function scopeOf(user: SessionUser) {
  return {
    countryCode: user.scopeCountryCode ?? null,
    cityCode: user.scopeCityCode ?? null
  };
}

export function isPlatformWide(user: SessionUser): boolean {
  return !user.scopeCountryCode;
}

function normalise(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Returns a human-readable reason when the target is outside the actor's scope,
 * or null when the action is allowed. Records without geography are allowed so
 * that missing data never silently blocks legitimate work.
 */
export function regionViolation(user: SessionUser, target: RegionTarget): string | null {
  const { countryCode, cityCode } = scopeOf(user);
  if (!countryCode) return null;

  if (target.countryCode && normalise(target.countryCode) !== normalise(countryCode)) {
    return `This record belongs to ${target.countryCode.toUpperCase()} and your scope is ${countryCode.toUpperCase()}.`;
  }

  if (cityCode && target.city && normalise(target.city) !== normalise(cityCode)) {
    return `This record belongs to ${target.city} and your scope is ${cityCode}.`;
  }

  return null;
}
