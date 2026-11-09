import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SendBottomNav, SendHeader } from "@/components/send/send-shell";
import { SendBenefits, SendCategories, SendFooter, SendHero, SendModes, SendNeedBand, SendNetwork, SendPromoBanners, SendSolutions, SendSteps, SendTransporterAndEnterprise } from "@/components/send/send-sections";
import { QuickQuote } from "@/components/send/quick-quote";
import { sendImage } from "@/lib/services/send/images";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaSend — Africa's All-in-One Logistics Marketplace",
  description: "Move goods, farm produce, business cargo and packages across cities, countries and continents with independent verified transporters.",
  alternates: { canonical: "/naijasend" }
};

const MODE_SLUGS = ["truck", "van", "car", "motorcycle", "air", "sea", "rail", "warehouse"];
const CATEGORY_SLUGS = ["farm-produce", "food-perishables", "market-retail", "industrial", "construction", "machinery", "ecommerce", "household"];
const SOLUTION_SLUGS = ["individuals", "businesses", "farmers", "manufacturers", "institutions"];
const STEP_SLUGS = ["request", "match", "pickup", "track", "delivered"];

function map(prefix: string, slugs: string[]): Record<string, string | null> {
  return Object.fromEntries(slugs.map((slug) => [slug, sendImage(`${prefix}${slug}`)]));
}

export default async function NaijaSendHomePage() {
  const [providers, quotes, shipments] = await Promise.all([
    prisma.logisticsProvider.count({ where: { status: "verified" } }),
    prisma.shipmentQuote.count({ where: { status: "offered" } }),
    prisma.logisticsShipment.count({ where: { status: { in: ["booked", "in_transit"] } } })
  ]);

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <SendHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
          <SendHero image={sendImage("send-hero")} />
          <div className="lg:mt-3">
            <QuickQuote />
            <p className="mt-1.5 px-1 text-[10px] leading-4 text-[#5d6d64]">
              {providers} verified {providers === 1 ? "provider" : "providers"} · {quotes} open {quotes === 1 ? "quote" : "quotes"} · {shipments} {shipments === 1 ? "shipment" : "shipments"} in transit
            </p>
          </div>
        </div>
        <SendBenefits />
        <SendModes images={map("send-mode-", MODE_SLUGS)} />
        <div className="mt-5">
          <SendNeedBand />
        </div>
        <SendCategories images={map("send-cat-", CATEGORY_SLUGS)} />
        <SendSteps images={map("send-step-", STEP_SLUGS)} />
        <SendSolutions images={map("send-sol-", SOLUTION_SLUGS)} />
        <SendPromoBanners business={sendImage("send-banner-business")} farm={sendImage("send-banner-farm")} />
        <SendTransporterAndEnterprise transporter={sendImage("send-banner-transporter")} enterprise={sendImage("send-banner-enterprise")} />
        <SendNetwork images={map("send-mode-", MODE_SLUGS)} app={sendImage("send-app-mockup")} />
      </main>
      <SendFooter />
      <SendBottomNav />
    </div>
  );
}
