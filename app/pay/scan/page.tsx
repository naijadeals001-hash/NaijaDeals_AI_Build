import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPayScanPage } from "@/components/pay/scan-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay — Scan & pay",
  description: "Scan & pay on NaijaPay."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/scan");
  return <NaijaPayScanPage />;
}
