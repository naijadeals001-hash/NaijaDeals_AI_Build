import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/functional/admin-dashboard";
import { AdminShell } from "@/components/functional/admin-shell";
import { getSessionUser, isAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Control Center",
  description: "NaijaDeals super-admin Control Center."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/super-admin");
  if (!isAdmin(user)) redirect("/");

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, actorType: user.actorType, roles: user.roles }}
      pathname="/super-admin"
    >
      <AdminDashboard />
    </AdminShell>
  );
}