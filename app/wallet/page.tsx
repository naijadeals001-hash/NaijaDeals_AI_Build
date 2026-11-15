import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPayWalletPage } from "@/components/pay/wallet-page";
import { getSessionUser } from "@/lib/auth/session";
import { contactAddress, mailtoFor } from "@/lib/data/contact-directory";

export const metadata: Metadata = {
  title: "NaijaPay wallet",
  description: "Your ledger-backed NaijaPay wallet balance, escrow holds and transaction history."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wallet");
  return (
    <>
      <NaijaPayWalletPage currentUserId={user.id} />
      {/* Contact line for the wallet surface. The addresses come from the
          shared contact directory, never from a literal in the page. */}
      <section
        aria-label="Wallet help"
        className="mx-auto mt-5 max-w-5xl rounded-2xl border border-black/5 bg-white p-4 text-sm text-pay-ink-muted shadow-soft sm:p-5"
      >
        <p className="space-y-1.5">
          <span className="block">
            Wallet payment or refund issue:{" "}
            <a href={mailtoFor("payments")} className="font-bold text-pay-green underline-offset-2 hover:underline">
              {contactAddress("payments")}
            </a>
          </span>
          <span className="block">
            Customer support:{" "}
            <a href={mailtoFor("support")} className="font-bold text-pay-green underline-offset-2 hover:underline">
              {contactAddress("support")}
            </a>
          </span>
        </p>
      </section>
    </>
  );
}
