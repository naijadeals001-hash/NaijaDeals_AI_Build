import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/guard";

/** @deprecated Use requireUser() from lib/auth/guard for all request-scoped access. */
export async function getCurrentUser() {
  return requireUser();
}

/** @deprecated Admin access must go through requireAdmin(). */
export async function getAdminUser() {
  const user = await requireUser();
  if (user.actorType !== "ADMIN") throw new ApiError(403, "forbidden", "Administrator access is required.");
  return user;
}
