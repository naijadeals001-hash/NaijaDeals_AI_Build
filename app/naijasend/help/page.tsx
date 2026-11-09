import type { Metadata } from "next";
import Link from "next/link";
import { SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Help & support — NaijaSend", alternates: { canonical: "/naijasend/help" } };

const FAQ = [
  ["How is my shipping price set?", "Verified providers quote your shipment. NaijaSend never sets a price on a provider's behalf, and you are only charged when you book a quote you accept."],
  ["When is money taken?", "The accepted quote is paid from your NaijaPay wallet at booking. The provider is paid only after you confirm delivery with the delivery PIN."],
  ["Who moves my goods?", "An independent verified provider. NaijaSend is the marketplace; it does not own trucks, aircraft, ships, rail or warehouses."],
  ["Can I cancel?", "Before any leg is collected you can cancel without charge. A booked shipment in transit needs support."],
  ["Is tracking live GPS?", "Ground vouchers record real milestones. Air, sea and rail milestones come from the operator and are labelled as carrier milestones, not live GPS."]
];

export default function HelpPage() {
  return (
    <SendPage>
      <SendHeading eyebrow="Help & Support" title="How can we help?" description="Answers to the questions customers and transporters ask most." />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <dl className="space-y-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <dt className="text-[12.5px] font-extrabold">{q}</dt>
              <dd className="mt-0.5 text-[11.5px] leading-5 text-[#5d6d64]">{a}</dd>
            </div>
          ))}
        </dl>
        <aside className="rounded-2xl bg-[#f2f9f0] p-4">
          <h2 className="font-display text-[14px] font-extrabold">Still stuck?</h2>
          <p className="mt-1 text-[11.5px] leading-5 text-[#5d6d64]">Disputes and claims are handled by the NaijaDeals support team. Open a case with your shipment reference and the team responds there.</p>
          <Link href="/support" className="mt-2 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Open a support case</Link>
          <Link href="/naijasend/track" className="mt-2 block text-[11.5px] font-semibold text-[#0b5c33] underline">Track a shipment</Link>
        </aside>
      </div>
    </SendPage>
  );
}
