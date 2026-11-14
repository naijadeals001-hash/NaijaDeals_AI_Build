import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CountryWorkspace } from "@/components/admin/countries/country-workspace";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { permissionsFor } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Discover Africa — Control Center" };
export const dynamic = "force-dynamic";

export default async function AdminCountriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/countries");
  if (!hasAdminConsoleAccess(user)) redirect("/");
  const permissions = permissionsFor(user);
  return (
    <CountryWorkspace
      canRead={permissions.includes("countries:editorial:read")}
      canWrite={permissions.includes("countries:editorial:write")}
      canPublish={permissions.includes("countries:editorial:publish")}
      canOrigin={permissions.includes("countries:origin:review")}
    />
  );
}
