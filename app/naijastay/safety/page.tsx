import { supportHref } from "@/lib/support/contact-link";
import type { Metadata } from "next";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";


export const dynamic = "force-static";

export const metadata: Metadata = { title: "Trust & safety — NaijaStay", alternates: { canonical: "/naijastay/safety" } };

const ITEMS = [
  ["Verified hosts", "Hosts provide an ID or business registration reference that the Control Center reviews before listings go live."],
  ["Payment protection", "Guest payments are held by NaijaDeals until check-in. A host cancellation refunds in full."],
  ["Address privacy", "Exact addresses are shared only with the confirmed guest — not published on the listing page."],
  ["Reporting", "Any guest or host can report a listing or a reservation. Reports are reviewed with the reservation and payment record."],
  ["Not verified by inspection", "NaijaStay does not claim to have inspected every property. Amenity claims come from the host."]
];

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Trust &amp; safety</h1>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ITEMS.map(([title, body]) => (
            <li key={title} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <p className="text-[12.5px] font-extrabold">{title}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{body}</p>
            </li>
          ))}
        </ul>
        <a href={supportHref("support", { subject: "NaijaStay safety report" })} className="mt-3 inline-flex max-w-full break-words rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Report an issue</a>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
