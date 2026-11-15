import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/support/contact-form";
import { supportVerticalOptions } from "@/lib/services/core/support.service";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Contact support — NaijaDeals",
  description: "Send a support enquiry for any NaijaDeals service and follow the conversation on site.",
  robots: { index: false, follow: true }
};

export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: { searchParams: { vertical?: string; topic?: string } }) {
  const user = await getSessionUser();
  const verticals = supportVerticalOptions();
  const initialVertical = verticals.some((option) => option.key === searchParams.vertical) ? (searchParams.vertical as string) : "general";

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-[#14241b]">
      <main className="mx-auto max-w-[980px] px-4 py-10 sm:px-6">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#0b5c33]">NaijaDeals support</p>
        <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-tight sm:text-[40px]">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#4b5b51]">
          Send us an enquiry and follow the whole conversation here. Staff replies appear in your ticket, and you can reply as many times as you need.
          {user ? " You are signed in, so this ticket will appear under Account → Support." : " No account is needed — we will show you a private access link at the end."}
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ContactForm initialVertical={initialVertical} verticals={verticals} signedIn={Boolean(user)} signedInEmail={user?.email ?? null} />
          <aside className="space-y-3">
            <section className="rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2]">
              <h2 className="text-[13px] font-extrabold">What we can help with</h2>
              <ul className="mt-2 space-y-1.5 text-[11.5px] leading-5 text-[#4b5b51]">
                <li>Orders, deliveries, returns and refunds</li>
                <li>Wallet, payments and payouts</li>
                <li>Rides, bookings, shipments and stays</li>
                <li>Account access and technical problems</li>
              </ul>
            </section>
            <section className="rounded-2xl bg-[#eef5ea] p-4">
              <h2 className="text-[13px] font-extrabold">Keeping your account safe</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[#3f4d45]">
                Never send passwords, one-time codes, full card numbers, PINs or API keys. NaijaDeals staff will never ask for them in a support ticket.
              </p>
            </section>
            <section className="rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2]">
              <h2 className="text-[13px] font-extrabold">Already have a ticket?</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[#4b5b51]">
                {user ? (
                  <Link href="/account/support" className="font-bold text-[#0b5c33] underline">Open Account → Support</Link>
                ) : (
                  "Use the private access link that was shown when you submitted your enquiry."
                )}
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
