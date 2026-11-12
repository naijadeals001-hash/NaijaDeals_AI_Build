import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sell on NaijaShop — NaijaShop", description: "Open a verified seller account on NaijaShop." };

export default function SellersPage() {
  return (
    <>
      <div className="bg-white px-5 py-8 text-[#0f1111]">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-[30px] font-extrabold">Sell on NaijaShop</h1>
          <p className="mt-2 text-[13.5px] leading-7 text-[#565959]">
            NaijaShop lists products from verified sellers across the NaijaDeals ecosystem. Sellers complete identity and business verification before their
            listings go live.
          </p>
          <ol className="mt-5 space-y-3">
            {[
              ["Apply", "Tell us about your business and what you sell."],
              ["Get verified", "We check your identity and business details before your first listing."],
              ["List your products", "Add products, stock and prices in the seller dashboard."],
              ["Get paid", "Orders settle through the shared NaijaPay ledger."]
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0f1b2d] text-[12px] font-bold text-white">{index + 1}</span>
                <span>
                  <span className="block text-[13.5px] font-bold">{title}</span>
                  <span className="block text-[12px] leading-6 text-[#565959]">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/sell" className="rounded-full bg-[#ffd814] px-5 py-2 text-[12.5px] font-bold text-[#0f1111] hover:bg-[#f7ca00]">
              Start selling
            </Link>
            <Link href="/seller" className="rounded-full border border-[#d5d9d9] px-5 py-2 text-[12.5px] font-bold hover:bg-[#f7f8f8]">
              Seller dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
