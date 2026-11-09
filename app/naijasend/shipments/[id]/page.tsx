import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, MapPin, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { SHIPMENT_STATUS_LABELS } from "@/lib/services/send/shipments";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { QuoteList } from "@/components/send/quote-list";
import { ConfirmDelivery } from "@/components/send/confirm-delivery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shipment — NaijaSend" };

export default async function ShipmentPage({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/naijasend/shipments/${params.id}`);
  const shipment = await prisma.logisticsShipment.findUnique({
    where: { id: params.id },
    include: {
      quotes: { where: { status: "offered" }, orderBy: { amountKobo: "asc" }, include: { provider: { select: { id: true, name: true, providerType: true, country: true, operatingCities: true, capacityKg: true, sourcePlatform: true } } } },
      legs: { orderBy: { sequence: "asc" } },
      events: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!shipment) notFound();
  if (shipment.customerId !== session.id) notFound();

  const accepted = await prisma.shipmentQuote.findFirst({ where: { shipmentId: shipment.id, status: "accepted" }, include: { provider: { select: { name: true, providerType: true } } } });
  const open = ["open", "quoting"].includes(shipment.status);

  return (
    <SendPage>
      <SendHeading
        eyebrow={shipment.reference}
        title={SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}
        description={`${shipment.originLabel} → ${shipment.destinationLabel} · ${shipment.weightKg} kg · ${shipment.cargoClass}`}
        action={<Link href="/naijasend/orders" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">All shipments</Link>}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-3">
          <section aria-labelledby="quotes" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="quotes" className="font-display text-[14px] font-extrabold">{open ? `Quotes (${shipment.quotes.length})` : "Booked provider"}</h2>
            {open ? (
              <div className="mt-2"><QuoteList shipmentId={shipment.id} quotes={shipment.quotes.map((q) => ({ ...q, amountKobo: q.amountKobo.toString(), expiresAt: q.expiresAt.toISOString() }))} canBook /></div>
            ) : accepted ? (
              <div className="mt-1.5 rounded-xl bg-[#f2f9f0] p-3 text-[12px]">
                <p className="font-extrabold">{accepted.provider.name} <span className="font-normal text-[#6b7a70]">· {accepted.provider.providerType}</span></p>
                <p className="mt-0.5">₦{(Number(accepted.amountKobo) / 100).toLocaleString("en-NG")} · {accepted.transitDays} day{accepted.transitDays === 1 ? "" : "s"} · {accepted.modes.join(" → ")}</p>
              </div>
            ) : (
              <p className="mt-1.5 text-[11.5px] text-[#5d6d64]">This shipment has no accepted quote.</p>
            )}
          </section>

          <section aria-labelledby="cargo-detail" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="cargo-detail" className="font-display text-[14px] font-extrabold">Cargo &amp; route</h2>
            <dl className="mt-1.5 grid gap-2 text-[11.5px] sm:grid-cols-2">
              <div><dt className="text-[#6b7a70]">Contents</dt><dd className="font-semibold">{shipment.description}</dd></div>
              <div><dt className="text-[#6b7a70]">Weight / quantity</dt><dd className="font-semibold">{shipment.weightKg} kg × {shipment.quantity}{shipment.dimensions ? ` · ${shipment.dimensions}` : ""}</dd></div>
              <div><dt className="text-[#6b7a70]">Pickup</dt><dd className="font-semibold">{shipment.originLabel}, {shipment.originCountry}</dd></div>
              <div><dt className="text-[#6b7a70]">Delivery</dt><dd className="font-semibold">{shipment.destinationLabel}, {shipment.destinationCountry}</dd></div>
              <div><dt className="text-[#6b7a70]">Sender</dt><dd className="font-semibold">{shipment.senderName} · {shipment.senderPhone}</dd></div>
              <div><dt className="text-[#6b7a70]">Recipient</dt><dd className="font-semibold">{shipment.recipientName} · {shipment.recipientPhone}</dd></div>
            </dl>
          </section>
        </div>

        <div className="space-y-3">
          <section aria-labelledby="legs" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="legs" className="font-display text-[14px] font-extrabold">Transport legs</h2>
            {shipment.legs.length ? (
              <ol className="mt-2 space-y-2">
                {shipment.legs.map((leg) => (
                  <li key={leg.id} className="flex gap-2 rounded-xl bg-[#f9fbf9] p-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-[10px] font-black text-white">{leg.sequence}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1"><span className="text-[12px] font-extrabold capitalize">{leg.mode}</span><span className="text-[10px] font-semibold text-[#0b5c33]">{leg.status.replace(/_/g, " ")}</span></span>
                      {leg.status === "assigned" && leg.pickupPin ? <span className="mt-0.5 block text-[10px] text-[#6b7a70]">Pickup PIN <b className="tracking-wider text-[#14241b]">{leg.pickupPin}</b></span> : null}
                      {leg.deliveryPin ? <span className="mt-0.5 block text-[10px] text-[#6b7a70]">Delivery PIN <b className="tracking-wider text-[#14241b]">{leg.deliveryPin}</b></span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[11.5px] text-[#5d6d64]">Legs are created when you book a quote.</p>
            )}
          </section>

          <section aria-labelledby="timeline" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="timeline" className="font-display text-[14px] font-extrabold">Timeline</h2>
            <ol className="mt-2 space-y-2">
              {shipment.events.map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span className="mt-0.5">{event.status === "completed" || event.status === "delivered" ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0b8f47]" aria-hidden /> : <Clock className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />}</span>
                  <span>
                    <span className="block text-[11.5px] font-bold">{event.label}{event.simulated ? <span className="ml-1 rounded bg-[#fff3e8] px-1 text-[8.5px] font-extrabold uppercase text-[#a3480f]">simulated carrier milestone</span> : null}</span>
                    {event.note ? <span className="block text-[10px] leading-4 text-[#5d6d64]">{event.note}</span> : null}
                    <span className="block text-[9px] text-[#9aa59e]">{new Date(event.createdAt).toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ol>
            {shipment.status === "delivered" ? <ConfirmDelivery shipmentId={shipment.id} /> : null}
          </section>

          <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[#6b7a70]"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Air, sea and rail milestones are recorded by the operator; NaijaSend does not claim live GPS for those modes.</p>
          <p className="flex items-start gap-1.5 text-[10px] leading-4 text-[#6b7a70]"><Package className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> NaijaSend is a marketplace. Transport is performed by the booked independent provider.</p>
        </div>
      </div>
    </SendPage>
  );
}
