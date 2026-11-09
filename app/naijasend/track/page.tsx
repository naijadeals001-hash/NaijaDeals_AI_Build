import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SHIPMENT_STATUS_LABELS } from "@/lib/services/send/shipments";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Track shipment — NaijaSend", alternates: { canonical: "/naijasend/track" } };

/** Tracking by reference. Only the shipment's own customer can see the detail. */
export default async function TrackPage({ searchParams }: { searchParams: { ref?: string } }) {
  const session = await getSessionUser();
  const ref = (searchParams.ref ?? "").trim().toUpperCase();
  const shipment = ref && session
    ? await prisma.logisticsShipment.findFirst({
        where: { reference: ref, customerId: session.id },
        include: { events: { orderBy: { createdAt: "asc" } }, legs: { orderBy: { sequence: "asc" } } }
      })
    : null;

  return (
    <SendPage>
      <SendHeading eyebrow="Track Shipment" title="Track your shipment" description="Enter the reference from your booking confirmation. Shipments are private to the account that booked them." />
      <form action="/naijasend/track" method="get" className="mb-4 flex max-w-md gap-2">
        <label htmlFor="ref" className="sr-only">Shipment reference</label>
        <input id="ref" name="ref" defaultValue={ref} placeholder="NSH-YYYYMMDD-XXXXXX" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-[12.5px] ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" />
        <button type="submit" className="rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Track</button>
      </form>
      {!session ? (
        <SendEmpty title="Sign in to track" body="Tracking shows your shipment's milestones and is restricted to your account." cta={{ href: `/login?next=/naijasend/track${ref ? `?ref=${ref}` : ""}`, label: "Sign in" }} />
      ) : !ref ? (
        <SendEmpty title="Enter your reference" body="Your reference looks like NSH-20261109-A1B2C3 and is shown on the booking confirmation." />
      ) : !shipment ? (
        <SendEmpty title="No shipment found for that reference" body="Check the reference, or this shipment belongs to another account." cta={{ href: "/naijasend/orders", label: "See your shipments" }} />
      ) : (
        <div className="max-w-2xl rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <p className="font-display text-[15px] font-extrabold">{shipment.reference}</p>
            <span className="rounded-full bg-[#e8f3e4] px-2 py-0.5 text-[10.5px] font-extrabold text-[#0b5c33]">{SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-[#5d6d64]">{shipment.originLabel} → {shipment.destinationLabel} · {shipment.weightKg} kg</p>
          <ol className="mt-3 space-y-2 border-l-2 border-[#e2e6e3] pl-3">
            {shipment.events.map((event) => (
              <li key={event.id}>
                <p className="text-[12px] font-bold">{event.label}{event.simulated ? <span className="ml-1 rounded bg-[#fff3e8] px-1 text-[8.5px] font-extrabold uppercase text-[#a3480f]">simulated carrier milestone</span> : null}</p>
                {event.note ? <p className="text-[10.5px] text-[#5d6d64]">{event.note}</p> : null}
                <p className="text-[9px] text-[#9aa59e]">{new Date(event.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ol>
          <Link href={`/naijasend/shipments/${shipment.id}`} className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Full shipment details</Link>
        </div>
      )}
    </SendPage>
  );
}
