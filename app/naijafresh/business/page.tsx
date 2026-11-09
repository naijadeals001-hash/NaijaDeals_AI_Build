import type { Metadata } from "next";
import { Store, Truck, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";
import { BulkQuoteForm, QuoteAnswer } from "@/components/fresh/bulk-quote";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Buy for your business — NaijaFresh", description: "Bulk and wholesale fresh produce for shops, restaurants, caterers and food vendors." };

export default async function FreshBusinessPage() {
  const session = await getSessionUser();
  const listings = await prisma.produceListing.findMany({
    where: { available: true, farm: { verified: true } },
    orderBy: { name: "asc" },
    take: 100,
    select: { id: true, name: true, unit: true, priceKobo: true, farm: { select: { name: true, slug: true } } }
  });
  const [mine, forMyFarms] = session
    ? await Promise.all([
        prisma.bulkQuoteRequest.findMany({
          where: { buyerId: session.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { listing: { select: { name: true, unit: true, farm: { select: { name: true } } } } }
        }),
        prisma.bulkQuoteRequest.findMany({
          where: { listing: { farm: { ownerId: session.id } } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { listing: { select: { name: true, unit: true } }, buyer: { select: { name: true } } }
        })
      ])
    : [[], []];

  return (
    <FreshPage>
      <FreshHeading
        eyebrow="Bulk Orders"
        title="Buy for your business"
        description="Bulk, fresh and cost-effective supplies for shops, restaurants and food vendors. Ask a farm for the quantity you need; the farm quotes its own price per unit."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-3">
            {[
              [Store, "Set quantities your kitchen needs", "Order by kilogram, bag, crate or tray."],
              [Wallet, "One NaijaPay wallet", "Pay per order; each farm is settled separately."],
              [Truck, "Collection and delivery", "NaijaDrive and NaijaSend carry larger loads in cars and vans."]
            ].map(([Icon, title, body]) => {
              const Glyph = Icon as typeof Store;
              return (
                <li key={String(title)} className="rounded-xl bg-white p-3 ring-1 ring-[#eef1ef]">
                  <Glyph className="h-5 w-5 text-[#0b5c33]" aria-hidden />
                  <p className="mt-1 text-[12px] font-extrabold">{String(title)}</p>
                  <p className="text-[10.5px] leading-4 text-[#5d6d64]">{String(body)}</p>
                </li>
              );
            })}
          </ul>

          {session && mine.length ? (
            <section aria-labelledby="my-quotes" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id="my-quotes" className="font-display text-[14px] font-extrabold">Your quote requests</h2>
              <ul className="mt-1 divide-y divide-[#f0f3f1] text-[11.5px]">
                {mine.map((quote) => (
                  <li key={quote.id} className="flex flex-wrap justify-between gap-1 py-1.5">
                    <span>{quote.quantity} {quote.listing.unit} {quote.listing.name} — {quote.listing.farm.name}</span>
                    <span className="font-extrabold text-[#0b5c33]">
                      {quote.status === "quoted" && quote.quotedPriceKobo ? `Quoted ₦${(Number(quote.quotedPriceKobo) / 100).toLocaleString("en-NG")} / ${quote.listing.unit}` : quote.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {session && forMyFarms.length ? (
            <section aria-labelledby="quote-requests" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <h2 id="quote-requests" className="font-display text-[14px] font-extrabold">Requests for your farm</h2>
              <ul className="mt-1 divide-y divide-[#f0f3f1]">
                {forMyFarms.map((quote) => (
                  <li key={quote.id} className="py-2 text-[11.5px]">
                    <p className="font-semibold">{quote.quantity} {quote.listing.unit} {quote.listing.name} — {quote.buyer.name}</p>
                    {quote.note ? <p className="text-[10.5px] text-[#5d6d64]">{quote.note}</p> : null}
                    {quote.status === "requested" ? <QuoteAnswer quoteId={quote.id} unit={quote.listing.unit} /> : <p className="text-[10.5px] font-extrabold text-[#0b5c33]">{quote.status}{quote.quotedPriceKobo ? ` · ₦${(Number(quote.quotedPriceKobo) / 100).toLocaleString("en-NG")} / ${quote.listing.unit}` : ""}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <BulkQuoteForm listings={listings.map((row) => ({ ...row, priceKobo: row.priceKobo.toString() }))} />
      </div>
    </FreshPage>
  );
}
