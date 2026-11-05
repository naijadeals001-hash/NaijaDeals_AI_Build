import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPaySendPage } from "@/components/pay/send-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay — Send money",
  description: "Send money on NaijaPay."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/send");
  return <NaijaPaySendPage />;
}
