import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/functional/admin-shell";
import { getSessionUser, isSuperAdmin, toPublicSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Control Center",
  description: "NaijaDeals super-admin Control Center."
};

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login?next=/super-admin");
  if (!isSuperAdmin(sessionUser)) redirect("/admin");
  
  const user = await toPublicSessionUser(sessionUser);

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, actorType: user.actorType, roles: user.roles }}
      pathname="/super-admin"
    >
      {children}
    </AdminShell>
  );
}