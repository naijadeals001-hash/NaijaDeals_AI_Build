import type { Metadata } from "next";
import { FarmerApplyForm } from "@/components/fresh/farmer-apply-form";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Register as a farmer — NaijaFresh", description: "Join NaijaFresh, list your harvest and reach homes and businesses across Africa." };

const BENEFITS = [
  ["Sell directly to buyers", "List your harvest and set your own price per unit — per kilogram, tuber, bunch or tray."],
  ["Get paid through NaijaPay", "Order value is collected up front and released to your farm wallet after delivery is confirmed."],
  ["Deliveries arranged for you", "NaijaDrive drivers and NaijaSend couriers collect from your farm once you mark an order ready."],
  ["Serve businesses too", "Shops, restaurants and caterers can request bulk quantities with your own quote."]
];

export default function FarmerApplyPage() {
  return (
    <FreshPage>
      <FreshHeading eyebrow="Farmers" title="Are you a farmer?" description="Join NaijaFresh, reach more buyers and grow your income. Registration is free; verification happens before your produce goes live." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {BENEFITS.map(([title, body]) => (
              <li key={title} className="rounded-xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <p className="text-[12.5px] font-extrabold">{title}</p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-white p-3 text-[11px] leading-5 text-[#5d6d64] ring-1 ring-[#eef1ef]">
            NaijaFresh does not publish a commission rate, delivery subsidy or guaranteed harvest volume on this page: those commercial terms are still to be approved. Your listings show only the price you set.
          </p>
        </div>
        <FarmerApplyForm />
      </div>
    </FreshPage>
  );
}
