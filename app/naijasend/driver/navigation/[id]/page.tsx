import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, Package, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { STATE_LABELS } from "@/lib/services/send/state-machine";
import { searchPlaces } from "@/lib/config/drive";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { TransportMap } from "@/components/send/transport-map";
import { TransportActions } from "@/components/send/transport-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transport navigation — NaijaSend" };

/** Best-effort coordinates from the project's landmark table; never invented. */
function coordsFor(label: string) {
  const matches = searchPlaces(label);
  return matches[0] ? { lat: matches[0].lat, lng: matches[0].lng } : null;
}

export default async function NavigationPage({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/naijasend/driver/navigation/${params.id}`);

  const shipment = await prisma.logisticsShipment.findUnique({
    where: { id: params.id },
    include: { assignment: true, pickups: true, events: { orderBy: { createdAt: "asc" } }, quotes: { where: { status: "accepted" }, include: { provider: { select: { name: true } } } } }
  });
  if (!shipment || !shipment.assignment) notFound();

  // Authorisation is the assignment record, not the URL.
  const provider = await prisma.logisticsProvider.findUnique({ where: { id: shipment.assignment.providerId }, select: { ownerId: true, name: true } });
  if (!provider || provider.ownerId !== session.id) notFound();

  const pickup = coordsFor(shipment.originLabel);
  const dropoff = coordsFor(shipment.destinationLabel);
  const distance = pickup && dropoff ? Math.round(Math.hypot((pickup.lat - dropoff.lat) * 111_320, (pickup.lng - dropoff.lng) * 111_320 * Math.cos((pickup.lat * Math.PI) / 180))) : null;

  return (
    <SendPage>
      <SendHeading
        eyebrow={shipment.trackingNumber ?? shipment.reference}
        title={STATE_LABELS[shipment.transportState] ?? shipment.transportState}
        description={`${shipment.originLabel} → ${shipment.destinationLabel}`}
        action={<Link href="/naijasend/driver/jobs" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">All jobs</Link>}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="space-y-3">
          <TransportMap pickup={pickup} dropoff={dropoff} pickupLabel={shipment.originLabel} dropoffLabel={shipment.destinationLabel} distanceMeters={distance} />

          <section aria-labelledby="cargo" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="cargo" className="font-display text-[14px] font-extrabold">Cargo</h2>
            <p className="mt-1 text-[12px]">{shipment.description}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div><dt className="text-[#6b7a70]">Weight</dt><dd className="font-bold">{shipment.weightKg} kg</dd></div>
              <div><dt className="text-[#6b7a70]">Quantity</dt><dd className="font-bold">{shipment.quantity}</dd></div>
              <div><dt className="text-[#6b7a70]">Origin</dt><dd className="font-bold">{shipment.originVertical}{shipment.sourceReference ? ` · ${shipment.sourceReference}` : ""}</dd></div>
              <div><dt className="text-[#6b7a70]">Handling</dt><dd className="font-bold">{shipment.handling ?? "Standard"}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="timeline" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="timeline" className="font-display text-[14px] font-extrabold">Shipment history</h2>
            <ol className="mt-2 space-y-2">
              {shipment.events.map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span className="mt-0.5">{shipment.pickups.length && event.status === "picked_up" ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0b8f47]" aria-hidden /> : <Clock className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />}</span>
                  <span>
                    <span className="block text-[11.5px] font-bold">{event.label}</span>
                    {event.note ? <span className="block text-[10px] leading-4 text-[#5d6d64]">{event.note}</span> : null}
                    <span className="block text-[9px] text-[#9aa59e]">{new Date(event.createdAt).toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-3">
          <section aria-labelledby="actions" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="actions" className="mb-2 font-display text-[14px] font-extrabold">Navigation</h2>
            <TransportActions shipmentId={shipment.id} version={shipment.version} state={shipment.transportState} customerPhone={shipment.recipientPhone} />
          </section>
          <section aria-labelledby="contacts" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="contacts" className="font-display text-[14px] font-extrabold">Contacts</h2>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px]"><Package className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> Pickup: {shipment.senderName} · {shipment.senderPhone}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px]"><Phone className="h-3.5 w-3.5 text-[#0b5c33]" aria-hidden /> Recipient: {shipment.recipientName} · {shipment.recipientPhone}</p>
          </section>
          <p className="rounded-xl bg-[#f2f9f0] p-2.5 text-[10px] leading-4 text-[#5d6d64]">
            Assigned by NaijaSend booking {shipment.reference}. NaijaSend validates pickup and delivery from this assignment and the PIN records — not from a
            button press — so a shipment can never be marked collected twice or paid out twice.
          </p>
        </aside>
      </div>
    </SendPage>
  );
}
