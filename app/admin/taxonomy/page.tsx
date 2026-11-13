import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, roleNames } from "@/lib/auth/session";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { permissionsFor } from "@/lib/auth/permissions";
import { TaxonomyWorkspace } from "@/components/admin/taxonomy/taxonomy-workspace";

export const metadata: Metadata = { title: "Taxonomy Control Center" };
export const dynamic = "force-dynamic";

export default async function TaxonomyAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/taxonomy");
  if (!hasAdminConsoleAccess(user)) redirect("/");
  const permissions = permissionsFor(user);
  return (
    <TaxonomyWorkspace
      canRead={permissions.includes("products:read")}
      canWrite={permissions.includes("products:moderate")}
      // Read-only context from the signed-in session. The API enforces the same
      // restriction per request; this only lets the UI explain which nodes are
      // editable instead of letting an operator discover it through a 403.
      scopeCountryCode={user.scopeCountryCode ?? null}
      scopeCityCode={user.scopeCityCode ?? null}
      roles={roleNames(user)}
    />
  );
}
