import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CreditCard, KeyRound, Search, UserPlus } from "lucide-react";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "How NaijaStay works", alternates: { canonical: "/naijastay/how-it-works" } };

const GUEST = [
  ["Create your account", "Sign in with your NaijaDeals account — one identity across every vertical.", UserPlus],
  ["Search & discover", "Filter by city, dates, guests and category. Only published properties appear.", Search],
  ["Choose your dates", "See the real total before you book: nightly rate, cleaning and service fee.", CalendarCheck],
  ["Pay securely", "Payment comes from your NaijaPay wallet and is held until check-in.", CreditCard],
  ["Stay", "The host is paid after your stay. You can review once it has ended.", KeyRound]
] as const;

const HOST = [
  ["Apply to host", "Tell us who you are and provide your ID or business registration reference.", UserPlus],
  ["Get verified", "The NaijaDeals Control Center reviews hosts before listings go live.", KeyRound],
  ["List your property", "Set the price, amenities and capacity. Your listing is moderated before publication.", CalendarCheck],
  ["Manage bookings", "Reservations appear in your host dashboard, restricted to your own properties.", Search],
  ["Get paid", "Guest funds are held by NaijaDeals and released to you after the stay.", CreditCard]
] as const;

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">How NaijaStay works</h1>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {[["For guests", GUEST], ["For hosts", HOST]].map(([title, steps]) => (
            <section key={title as string} aria-labelledby={`how-${String(title)}`} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id={`how-${String(title)}`} className="font-display text-[15px] font-extrabold">{title as string}</h2>
              <ol className="mt-2 space-y-2">
                {(steps as readonly (readonly [string, string, typeof UserPlus])[]).map(([stepTitle, body, Icon], index) => (
                  <li key={stepTitle} className="flex gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-white">{index + 1}</span>
                    <span>
                      <span className="flex items-center gap-1 text-[12px] font-extrabold"><Icon className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> {stepTitle}</span>
                      <span className="block text-[11px] leading-5 text-[#5d6d64]">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-[#fff3e8] p-3 text-[10.5px] leading-5 text-[#a3480f]">
          Taxes, deposit rules and cancellation terms beyond the standard policy are not yet approved for NaijaStay, so they are not shown or charged. The standard policy is stated on every property page and stored with each reservation.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/naijastay/stays" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Find a stay</Link>
          <Link href="/naijastay/host" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Become a host</Link>
        </div>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
