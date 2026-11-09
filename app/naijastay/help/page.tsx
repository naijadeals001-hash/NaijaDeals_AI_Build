import type { Metadata } from "next";
import Link from "next/link";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Help & support — NaijaStay", alternates: { canonical: "/naijastay/help" } };

const FAQ = [
  ["When is my card or wallet charged?", "Your NaijaPay wallet is debited when you pay the hold. The funds are held by NaijaDeals and released to the host after the stay."],
  ["What if the host cancels?", "A host cancellation refunds you in full automatically."],
  ["Can I cancel?", "Yes. The standard policy gives a 100% refund up to 48 hours before check-in, and 0% after that. The exact terms are shown on the property page and stored with your reservation."],
  ["Are images of the property real?", "Real listings use host-supplied photographs. Demonstration listings are labelled and their images are AI-generated illustrations."],
  ["Are amenities verified?", "Amenities and practical details such as power backup and water are supplied by the host. NaijaStay does not independently inspect them."]
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Help &amp; support</h1>
        <dl className="mt-3 space-y-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <dt className="text-[12.5px] font-extrabold">{q}</dt>
              <dd className="mt-0.5 text-[11.5px] leading-5 text-[#5d6d64]">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 rounded-xl bg-[#f2f9f0] p-3 text-[11px] leading-5 text-[#3f4d45]">
          Disputes and damage claims are handled by the NaijaDeals support team with your reservation reference.
          <Link href="/support" className="ml-1 font-bold text-[#0b5c33] underline">Open a support case</Link>
        </p>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
