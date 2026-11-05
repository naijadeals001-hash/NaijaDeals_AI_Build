import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPayReceivePage } from "@/components/pay/receive-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay — Receive money",
  description: "Receive money on NaijaPay."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/receive");
  return <NaijaPayReceivePage />;
}
