import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/functional/admin-shell";
import { getSessionUser, isAdmin, toPublicSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Control Center",
  description: "NaijaDeals administration for orders, sellers, payments, deliveries and payouts."
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login?next=/admin");
  if (!isAdmin(sessionUser)) redirect("/");
  
  const user = await toPublicSessionUser(sessionUser);

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, actorType: user.actorType, roles: user.roles }}
      pathname="/admin"
    >
      {children}
    </AdminShell>
  );
}