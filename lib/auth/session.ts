import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { ActorType, Role, User, Vendor } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";
export const SESSION_TTL_DAYS = 30;

export type SessionUser = User & {
  roles: Array<{ role: Role }>;
  vendors: Vendor[];
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 500) ?? null
    }
  });
  return { token, expiresAt, maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 };
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Read the session from the request cookie jar (route handlers / server components). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: { include: { role: true } }, vendors: true } } }
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export function roleNames(user: SessionUser): string[] {
  return user.roles.map((entry) => entry.role.name);
}

export function isAdmin(user: SessionUser) {
  return user.actorType === "ADMIN" || roleNames(user).includes("admin") || roleNames(user).includes("super_admin");
}

export function isSuperAdmin(user: SessionUser) {
  return roleNames(user).includes("super_admin");
}

export function isVendor(user: SessionUser) {
  return user.actorType === "VENDOR" || roleNames(user).includes("vendor");
}

export function isCourier(user: SessionUser) {
  return user.actorType === "COURIER" || roleNames(user).includes("courier");
}

export function isDriver(user: SessionUser) {
  return user.actorType === "DRIVER" || roleNames(user).includes("driver");
}

export function primaryRole(user: SessionUser): "admin" | "vendor" | "courier" | "driver" | "customer" {
  if (isAdmin(user)) return "admin";
  if (isVendor(user)) return "vendor";
  if (isCourier(user)) return "courier";
  if (isDriver(user)) return "driver";
  return "customer";
}

export type PublicSessionUser = {
  id: string;
  name: string;
  email: string;
  actorType: ActorType;
  roles: string[];
  vendorIds: string[];
  walletBalanceKobo: string | null;
};

export async function toPublicSessionUser(user: SessionUser): Promise<PublicSessionUser> {
  const wallet = await prisma.wallet.findFirst({ where: { userId: user.id, ownerType: "CUSTOMER" } });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    actorType: user.actorType,
    roles: roleNames(user),
    vendorIds: user.vendors.map((vendor) => vendor.id),
    walletBalanceKobo: wallet ? wallet.availableKobo.toString() : null
  };
}
