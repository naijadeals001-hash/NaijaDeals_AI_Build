import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, Truck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getShipmentTracking } from "@/lib/services/send/fulfilment";
import { customerSentence, STATE_LABELS } from "@/lib/services/send/state-machine";
import { SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Track shipment — NaijaSend" };

const ORIGIN_LABEL: Record<string, { label: string; href: string }> = {
  naijashop: { label: "NaijaShop order", href: "/naijashop" },
  naijafresh: { label: "NaijaFresh order", href: "/naijafresh/orders" },
  naijaeats: { label: "NaijaEats order", href: "/naijaeats/orders" },
  naijasend: { label: "Direct NaijaSend booking", href: "/naijasend/orders" }
};

/**
 * The single customer tracking view. Whatever vertical the order came from, this
 * page resolves the same authoritative NaijaSend record — so there is one
 * timeline, not four.
 */
export default async function TrackNumberPage({ params }: { params: { trackingNumber: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/naijasend/track/${params.trackingNumber}`);
  const tracking = await getShipmentTracking({ trackingNumber: decodeURIComponent(params.trackingNumber), viewerId: session.id }).catch(() => null);
  if (!tracking) notFound();
  const origin = ORIGIN_LABEL[tracking.originVertical] ?? { label: tracking.originVertical, href: "/naijasend" };

  return (
    <SendPage>
      <SendHeading
        eyebrow={origin.label}
        title={tracking.trackingNumber ?? tracking.reference}
        description={customerSentence(tracking.transportState, tracking.transporter)}
        action={<Link href={origin.href} className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">{origin.label}</Link>}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <section aria-labelledby="tracking-timeline" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
          <h2 id="tracking-timeline" className="font-display text-[14px] font-extrabold">Shipment timeline</h2>
          <ol className="mt-2 space-y-2">
            {tracking.timeline.map((event, index) => (
              <li key={`${event.status}-${index}`} className="flex gap-2">
                <span className="mt-0.5">{index === tracking.timeline.length - 1 ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0b8f47]" aria-hidden /> : <Clock className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />}</span>
                <span>
                  <span className="block text-[11.5px] font-bold">{event.label}{event.simulated ? <span className="ml-1 rounded bg-[#fff3e8] px-1 text-[8px] font-extrabold uppercase text-[#a3480f]">carrier milestone</span> : null}</span>
                  {event.note ? <span className="block text-[10px] leading-4 text-[#5d6d64]">{event.note}</span> : null}
                  <span className="block text-[9px] text-[#9aa59e]">{new Date(event.at).toLocaleString()}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-3">
          <section aria-labelledby="who" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="who" className="font-display text-[14px] font-extrabold">Your transporter</h2>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold"><Truck className="h-4 w-4 text-[#0b5c33]" aria-hidden /> {tracking.transporter ?? "Not yet assigned"}</p>
            <p className="text-[10.5px] text-[#6b7a70]">{tracking.transporterType ?? "—"} · {tracking.vehicleType ?? "vehicle to be confirmed"}</p>
            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2"><dt className="text-[#6b7a70]">Pickup</dt><dd className="text-right font-semibold">{tracking.pickupLocation}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#6b7a70]">Delivery</dt><dd className="text-right font-semibold">{tracking.deliveryLocation}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#6b7a70]">Status</dt><dd className="text-right font-semibold">{STATE_LABELS[tracking.transportState] ?? tracking.transportState}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#6b7a70]">Picked up</dt><dd className="text-right font-semibold">{tracking.pickupVerifiedAt ? new Date(tracking.pickupVerifiedAt).toLocaleString() : "Not yet"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#6b7a70]">Delivered</dt><dd className="text-right font-semibold">{tracking.deliveryVerifiedAt ? new Date(tracking.deliveryVerifiedAt).toLocaleString() : "Not yet"}</dd></div>
            </dl>
          </section>
          <p className="rounded-xl bg-[#f2f9f0] p-2.5 text-[10px] leading-4 text-[#5d6d64]">
            This timeline is the authoritative logistics record for {origin.label.toLowerCase()}{tracking.originOrderId ? ` ${tracking.originOrderId}` : ""}. Your purchase itself stays with{" "}
            <Link href={origin.href} className="font-semibold text-[#0b5c33] underline">{origin.label}</Link>.
          </p>
        </aside>
      </div>
    </SendPage>
  );
}
