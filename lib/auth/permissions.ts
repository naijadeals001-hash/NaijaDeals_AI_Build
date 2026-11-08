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
  "audit:read",
  "roles:write",
  "countries:write",
  "disputes:read",
  "disputes:write",
  "gigs:read",
  "gigs:moderate"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role to permission mapping.
 *
 * - `super_admin` holds every permission, including role administration.
 * - `admin` keeps the pre-existing operational surface (orders, deliveries,
 *   rides, catalogue, vendors, finance, audit) but deliberately cannot grant
 *   roles, so an administrator cannot promote themselves or anyone else.
 * - `ops`, `finance`, `support` and `moderator` are narrow staff roles.
 */
const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== "roles:write"),
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
    "gigs:read"
  ],
  finance: [
    "dashboard:read",
    "orders:read",
    "deliveries:read",
    "finance:read",
    "finance:payouts:write",
    "audit:read",
    "gigs:read"
  ],
  support: [
    "dashboard:read",
    "orders:read",
    "deliveries:read",
    "rides:read",
    "vendors:read",
    "users:read",
    "disputes:read",
    "gigs:read"
  ],
  moderator: [
    "dashboard:read",
    "orders:read",
    "products:read",
    "products:moderate",
    "vendors:read",
    "vendors:review",
    "gigs:read",
    "gigs:moderate"
  ]
};

/** Roles that grant Control Center access at all. */
export const STAFF_ROLES = ["super_admin", "admin", "ops", "finance", "support", "moderator"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(name: string): name is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(name);
}

/**
 * Permissions held by a session user. An ADMIN actor without any recognised
 * staff role keeps the legacy `admin` surface; every other actor gets exactly
 * what their roles grant.
 */
export function permissionsFor(user: SessionUser): Permission[] {
  const names = roleNames(user);
  const granted = new Set<Permission>();
  let recognised = false;

  for (const name of names) {
    const set = ROLE_PERMISSIONS[name];
    if (!set) continue;
    recognised = true;
    for (const permission of set) granted.add(permission);
  }

  if (!recognised && user.actorType === "ADMIN") {
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
