import type { Metadata } from "next";
import Link from "next/link";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";

export const metadata: Metadata = { title: "Help — NaijaEats" };

const TOPICS = [
  { title: "Delivery", body: "Delivery windows come from each kitchen's own preparation times. Tracking appears on your order once the kitchen dispatches." , href: "/naijaeats/orders" },
  { title: "Payments", body: "Checkout uses your NaijaPay wallet with escrow protection on eligible orders.", href: "/pay" },
  { title: "Refunds", body: "Refund requests are raised from the order page and reviewed by the kitchen and platform support.", href: "/naijaeats/orders" },
  { title: "Food safety", body: "Restaurants are verified before listing. Report an issue from the order page.", href: "/naijaeats/orders" }
];

export default function EatsHelpPage() {
  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <main className="mx-auto max-w-[900px] px-4 py-8">
        <h1 className="font-display text-[24px] font-extrabold text-[#14241b]">Help centre</h1>
        <p className="mt-1 text-[12px] text-[#6b7a70]">Delivery, payments, refunds and food safety.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {TOPICS.map((topic) => (
            <li key={topic.title} className="rounded-xl p-4 ring-1 ring-[#eef1ef]">
              <p className="text-[13px] font-extrabold text-[#14241b]">{topic.title}</p>
              <p className="mt-1 text-[11.5px] leading-6 text-[#6b7a70]">{topic.body}</p>
              <Link href={topic.href} className="mt-2 inline-block text-[11.5px] font-bold text-[#0b5c33] underline">Open</Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11px] leading-6 text-[#8a938d]">
          This page lists only the channels the platform operates today. Telephone numbers and response-time promises are published once approved.
        </p>
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
