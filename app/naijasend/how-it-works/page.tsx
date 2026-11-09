import type { Metadata } from "next";
import Link from "next/link";
import { SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "How NaijaSend works — NaijaSend", alternates: { canonical: "/naijasend/how-it-works" } };

const STEPS = [
  ["Request a shipment", "Say what you are moving, the weight, pickup and delivery locations and any handling needs. Each request gets a reference like NSH-20261109-A1B2C3."],
  ["Verified providers quote", "Only providers verified by the NaijaDeals Control Center can quote. Each quote states price, transit days and the modes it covers."],
  ["Book and pay with NaijaPay", "You choose one quote. The amount leaves your wallet and is held until delivery; every competing quote is declined automatically."],
  ["Pickup with a PIN", "The provider collects with a pickup PIN you hand over. For multimodal shipments each leg is recorded in order."],
  ["Track milestones", "Every leg records pickup, transit and arrival. Air, sea and rail milestones are carrier records, not live GPS."],
  ["Confirm delivery", "When the goods arrive you confirm with the delivery PIN. Only then is the provider paid and the platform fee taken."]
];

export default function HowItWorksPage() {
  return (
    <SendPage>
      <SendHeading eyebrow="How It Works" title="How NaijaSend works" description="A marketplace flow: you request, independent verified providers quote, you book one, and NaijaPay holds the money until delivery." />
      <ol className="space-y-2">
        {STEPS.map(([title, body], index) => (
          <li key={title} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-[12px] font-black text-white">{index + 1}</span>
            <span><span className="block text-[12.5px] font-extrabold">{title}</span><span className="block text-[11.5px] leading-5 text-[#5d6d64]">{body}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/naijasend/ship" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Ship something</Link>
        <Link href="/naijasend/transporter/apply" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Become a transporter</Link>
      </div>
    </SendPage>
  );
}
