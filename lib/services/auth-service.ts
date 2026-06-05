import type { ServiceResult, SessionUser } from "@/lib/services/types";

export async function getCurrentSession(): ServiceResult<SessionUser | null> {
  // TODO(backend): Replace with NextAuth/Auth.js session lookup and role hydration from the users table.
  return {
    id: "usr_demo_001",
    email: "demo@naijadeals.com",
    name: "John Okafor",
    roles: ["customer", "verified_member"],
    trustScore: 94
  };
}

export async function requireRole(role: string): ServiceResult<boolean> {
  // TODO(backend): Enforce RBAC server-side before admin mutations and privileged API routes.
  const session = await getCurrentSession();
  return Boolean(session?.roles.includes(role));
}
