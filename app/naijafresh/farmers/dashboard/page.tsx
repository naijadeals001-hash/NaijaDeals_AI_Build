import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { listFarmOrders } from "@/lib/services/fresh/orders";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";
import { FarmerSignInPrompt, FarmOrderActions, FarmOrderStatusLabel, ListingForm } from "@/components/fresh/farmer-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Farmer workspace — NaijaFresh" };

export default async function FarmerDashboardPage() {
  const session = await getSessionUser();
  if (!session) {
    return <FreshPage><FreshHeading eyebrow="Farmers" title="Farmer workspace" /><FarmerSignInPrompt /></FreshPage>;
  }
  const farm = await prisma.farm.findFirst({
    where: { ownerId: session.id },
    include: { listings: { orderBy: { createdAt: "desc" } } }
  });

  if (!farm) {
    return (
      <FreshPage>
        <FreshHeading eyebrow="Farmers" title="Farmer workspace" />
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
          <p className="font-display text-[16px] font-extrabold">No farm registered to this account</p>
          <p className="mt-1 text-[12px] text-[#5d6d64]">Register your farm to start listing your harvest.</p>
          <Link href="/naijafresh/farmers/apply" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Register a farm</Link>
        </div>
      </FreshPage>
    );
  }

  const orders = await listFarmOrders(farm.id);
  const open = orders.filter((order) => !["delivered", "completed", "cancelled"].includes(order.status));

  return (
    <FreshPage>
      <FreshHeading
        eyebrow="Farmers"
        title={farm.name}
        description={`${farm.city}, ${farm.state} · ${farm.isSample ? "Demonstration farm record" : farm.verified ? "Verified farm" : "Awaiting verification"}`}
        action={
          farm.verified ? (
            <span className="flex items-center gap-1 rounded-full bg-[#e8f3e4] px-3 py-1 text-[11px] font-extrabold text-[#0b5c33]"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified</span>
          ) : (
            <span className="rounded-full bg-[#fff3e8] px-3 py-1 text-[11px] font-extrabold text-[#a3480f]">Awaiting verification</span>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-3">
          <section aria-labelledby="incoming" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="incoming" className="font-display text-[14px] font-extrabold">Orders to fulfil ({open.length})</h2>
            {open.length ? (
              <ul className="mt-2 space-y-2">
                {open.map((order) => (
                  <li key={order.id} data-order={order.orderNumber} className="rounded-xl bg-[#f9fbf9] p-2.5 ring-1 ring-[#eef1ef]">
                    <div className="flex flex-wrap justify-between gap-1">
                      <p className="text-[12px] font-extrabold">{order.orderNumber}</p>
                      <FarmOrderStatusLabel status={order.status} />
                    </div>
                    <ul className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[#5d6d64]">
                      {order.items.map((item) => <li key={item.id}>{item.quantity} {item.unit} {item.name}</li>)}
                    </ul>
                    <p className="mt-0.5 text-[11px]">₦{(Number(order.totalKobo) / 100).toLocaleString("en-NG")} · {order.contactName} · {order.deliveryAddress}</p>
                    <FarmOrderActions orderId={order.id} status={order.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11.5px] text-[#5d6d64]">No orders waiting. New orders appear here as soon as a customer pays.</p>
            )}
          </section>

          <section aria-labelledby="past" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="past" className="font-display text-[14px] font-extrabold">Completed &amp; cancelled</h2>
            {orders.filter((order) => !open.includes(order)).length ? (
              <ul className="mt-2 divide-y divide-[#f0f3f1] text-[11.5px]">
                {orders.filter((order) => !open.includes(order)).map((order) => (
                  <li key={order.id} className="flex flex-wrap justify-between gap-1 py-1.5">
                    <span className="font-semibold">{order.orderNumber}</span>
                    <FarmOrderStatusLabel status={order.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11.5px] text-[#5d6d64]">Nothing yet.</p>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <ListingForm disabled={!farm.verified} />
          <section aria-labelledby="my-listings" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="my-listings" className="font-display text-[14px] font-extrabold">Your listings ({farm.listings.length})</h2>
            <ul className="mt-2 divide-y divide-[#f0f3f1] text-[11.5px]">
              {farm.listings.map((listing) => (
                <li key={listing.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/naijafresh/shop/${listing.slug}`} className="min-w-0 truncate font-semibold hover:underline">{listing.name}</Link>
                  <span className="shrink-0 text-[#5d6d64]">₦{(Number(listing.priceKobo) / 100).toLocaleString("en-NG")} / {listing.unit} · {listing.quantity} left</span>
                </li>
              ))}
              {!farm.listings.length ? <li className="py-1.5 text-[#5d6d64]">No listings published yet.</li> : null}
            </ul>
          </section>
        </div>
      </div>
    </FreshPage>
  );
}
