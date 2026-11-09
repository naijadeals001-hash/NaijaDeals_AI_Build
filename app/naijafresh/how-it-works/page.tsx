import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Bike, Leaf, PackageCheck, Sprout, Truck, Wallet } from "lucide-react";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "How NaijaFresh works — NaijaFresh", alternates: { canonical: "/naijafresh/how-it-works" } };

const CUSTOMER_STEPS = [
  ["Choose fresh produce", "Browse by category, farm or season, and pick the unit you need — kilogram, tuber, bunch, tray or bag."],
  ["Pay securely with NaijaPay", "Your wallet pays the order up front. The farm is notified immediately and starts packing."],
  ["Track packing and delivery", "The farm accepts, packs and marks your order ready. NaijaDrive or NaijaSend collects it."],
  ["Confirm with your PIN", "Give the delivery PIN to your rider. Only then are funds settled to the farm."]
];

const FARMER_STEPS = [
  ["Register your farm", "Submit your farm, location and what you grow. NaijaFresh verifies farms before produce is listed."],
  ["List your harvest", "Set your own price per agricultural unit and the quantity you have ready."],
  ["Accept and pack orders", "Orders arrive in your farmer workspace. Accept, pack, then mark ready for pickup."],
  ["Get paid", "Once the buyer confirms delivery with their PIN, your share reaches your farm wallet."]
];

export default function HowItWorksPage() {
  return (
    <FreshPage>
      <FreshHeading eyebrow="How It Works" title="How NaijaFresh Works" description="A direct farm-to-buyer chain with escrowed payment, PIN-verified delivery and the same NaijaDrive and NaijaSend fleet used across NaijaDeals." />
      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-labelledby="for-buyers" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <h2 id="for-buyers" className="flex items-center gap-1.5 font-display text-[16px] font-extrabold"><Leaf className="h-4 w-4 text-[#0b5c33]" aria-hidden /> For buyers</h2>
          <ol className="mt-2 space-y-2">
            {CUSTOMER_STEPS.map(([title, body], index) => (
              <li key={title} className="flex gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-white">{index + 1}</span>
                <span><span className="block text-[12.5px] font-extrabold">{title}</span><span className="block text-[11px] leading-5 text-[#5d6d64]">{body}</span></span>
              </li>
            ))}
          </ol>
          <Link href="/naijafresh/shop" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Shop fresh produce</Link>
        </section>
        <section aria-labelledby="for-farmers" className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <h2 id="for-farmers" className="flex items-center gap-1.5 font-display text-[16px] font-extrabold"><Sprout className="h-4 w-4 text-[#0b5c33]" aria-hidden /> For farmers</h2>
          <ol className="mt-2 space-y-2">
            {FARMER_STEPS.map(([title, body], index) => (
              <li key={title} className="flex gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f26b21] text-[11px] font-black text-white">{index + 1}</span>
                <span><span className="block text-[12.5px] font-extrabold">{title}</span><span className="block text-[11px] leading-5 text-[#5d6d64]">{body}</span></span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/naijafresh/farmers/apply" className="rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Register as a farmer</Link>
            <Link href="/naijafresh/farmers/dashboard" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Farmer dashboard</Link>
          </div>
        </section>
      </div>
      <section aria-labelledby="chain" className="mt-3 rounded-2xl bg-[#f2f9f0] p-4">
        <h2 id="chain" className="font-display text-[15px] font-extrabold">What protects each order</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Wallet, "Escrowed payment", "Order value is held on the platform until delivery is confirmed."],
            [BadgeCheck, "Verified farms", "Farms are checked before their produce appears."],
            [PackageCheck, "PIN handover", "Separate pickup and delivery PINs stop mis-delivery."],
            [Truck, "NaijaDrive & NaijaSend", "Motorcycles for daily produce, cars and vans for bulk loads."]
          ].map(([Icon, title, body]) => {
            const Glyph = Icon as typeof Wallet;
            return (
              <li key={String(title)} className="flex gap-2 rounded-xl bg-white p-2.5">
                <Glyph className="h-5 w-5 shrink-0 text-[#0b5c33]" aria-hidden />
                <span><span className="block text-[11.5px] font-extrabold">{String(title)}</span><span className="block text-[10.5px] leading-4 text-[#5d6d64]">{String(body)}</span></span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-[#6b7a70]">
          <Bike className="h-3.5 w-3.5" aria-hidden /> Commission, delivery subsidy and refund policy for NaijaFresh are still to be approved; this page does not publish invented commercial terms.
        </p>
      </section>
    </FreshPage>
  );
}
