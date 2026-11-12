import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { permissionsFor } from "@/lib/auth/permissions";
import { CatalogueWorkspace } from "@/components/admin/catalogue/catalogue-workspace";

export const metadata: Metadata = { title: "Catalogue Control Center" };
export const dynamic = "force-dynamic";

export default async function CatalogueAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/catalogue");
  if (!hasAdminConsoleAccess(user)) redirect("/");
  const permissions = permissionsFor(user);
  return (
    <CatalogueWorkspace
      canWrite={permissions.includes("products:moderate")}
      canRead={permissions.includes("products:read")}
    />
  );
}
