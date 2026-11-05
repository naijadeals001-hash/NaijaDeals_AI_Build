import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPaySecurityPage } from "@/components/pay/security-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay — Security",
  description: "Security on NaijaPay."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/security");
  return <NaijaPaySecurityPage />;
}
