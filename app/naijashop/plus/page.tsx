import type { Metadata } from "next";
import Link from "next/link";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const metadata: Metadata = {
  title: "NaijaShop Plus — NaijaShop",
  description: "What the NaijaShop Plus membership delivers."
};

/**
 * NaijaShop Plus is the storefront's own membership tier. Pricing and billing
 * are not yet approved, so this page states the benefits under development and
 * says plainly that subscriptions are not open rather than inventing a price.
 * The membership applies to NaijaShop only — it is not an ecosystem-wide plan.
 */
export default function PlusPage() {
  return (
    <>
      <main className="bg-white px-5 py-8 text-[#0f1111]">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0b5c3b]">NaijaShop</p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold">Plus</h1>
          <p className="mt-2 text-[13.5px] leading-7 text-[#565959]">
            Plus is the paid membership tier planned for NaijaShop. The benefits below are built and are being tested; subscription billing is
            <strong className="text-[#0f1111]"> not open yet</strong>, and no price has been approved.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Faster delivery", "Priority dispatch on eligible orders."],
              ["Plus-only deals", "Members-only pricing on selected listings."],
              ["Early access", "See sale events before general release."],
              ["Escrow protection", "Every Plus order keeps the standard escrow protection."]
            ].map(([title, body]) => (
              <li key={title} className="rounded-lg p-4 ring-1 ring-[#e3e6e6]">
                <p className="text-[13.5px] font-bold">{title}</p>
                <p className="mt-1 text-[12px] leading-6 text-[#565959]">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-[#f7f8f8] p-3 text-[11.5px] leading-6 text-[#565959]">
            Your Plus membership covers NaijaShop. Other NaijaDeals services — rides, delivery bookings, streaming and payments — keep their own plans
            and are not included.
          </p>
          <p className="mt-4 rounded-lg bg-[#f7f8f8] p-4 text-[12.5px] leading-6 text-[#565959]">
            Want to hear when membership opens?{" "}
            <Link href="/account" className="font-semibold text-[#007185] hover:underline">
              Create or open your NaijaShop account
            </Link>{" "}
            and we will show the announcement here and on your account page.
          </p>
        </div>
      </main>
      <ShopFooter />
    </>
  );
}
