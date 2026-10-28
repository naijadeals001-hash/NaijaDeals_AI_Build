import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountPage } from "@/components/functional/account-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your NaijaDeals addresses, saved items and seller application."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  return <AccountPage />;
}
