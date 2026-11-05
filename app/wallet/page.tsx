import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPayWalletPage } from "@/components/pay/wallet-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay wallet",
  description: "Your ledger-backed NaijaPay wallet balance, escrow holds and transaction history."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wallet");
  return <NaijaPayWalletPage />;
}
