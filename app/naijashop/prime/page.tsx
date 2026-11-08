import type { Metadata } from "next";
import Link from "next/link";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const metadata: Metadata = { title: "NaijaShop Prime — NaijaShop", description: "What the Prime membership delivers on NaijaShop." };

/**
 * Prime is advertised in the approved mockup. Membership pricing and billing
 * are not yet approved, so this page states the benefits under development and
 * says plainly that subscriptions are not open rather than inventing a price.
 */
export default function PrimePage() {
  return (
    <>
      <main className="bg-white px-5 py-8 text-[#0f1111]">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0b5c3b]">NaijaShop</p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold">Prime</h1>
          <p className="mt-2 text-[13.5px] leading-7 text-[#565959]">
            Prime is the paid membership tier planned for NaijaShop. The benefits below are built and are being tested; subscription billing is
            <strong className="text-[#0f1111]"> not open yet</strong>, and no price has been approved.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Faster delivery", "Priority dispatch on eligible orders."],
              ["Prime-only deals", "Members-only pricing on selected listings."],
              ["Early access", "See sale events before general release."],
              ["Escrow protection", "Every Prime order keeps the standard escrow protection."]
            ].map(([title, body]) => (
              <li key={title} className="rounded-lg p-4 ring-1 ring-[#e3e6e6]">
                <p className="text-[13.5px] font-bold">{title}</p>
                <p className="mt-1 text-[12px] leading-6 text-[#565959]">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-lg bg-[#f7f8f8] p-4 text-[12.5px] leading-6 text-[#565959]">
            Want to hear when membership opens?{" "}
            <Link href="/account" className="font-semibold text-[#007185] hover:underline">Create or open your NaijaShop account</Link> and we will show the
            announcement here and on your account page.
          </p>
        </div>
      </main>
      <ShopFooter />
    </>
  );
}
