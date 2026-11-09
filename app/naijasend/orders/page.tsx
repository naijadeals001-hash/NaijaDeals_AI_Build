import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { SHIPMENT_STATUS_LABELS, listCustomerShipments } from "@/lib/services/send/shipments";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your shipments — NaijaSend" };

export default async function SendOrdersPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <SendPage>
        <SendHeading eyebrow="Orders" title="Your shipments" />
        <SendEmpty title="Sign in to see your shipments" body="Track quotes, bookings and deliveries from your account." cta={{ href: "/login?next=/naijasend/orders", label: "Sign in" }} />
      </SendPage>
    );
  }
  const shipments = await listCustomerShipments(session.id);
  return (
    <SendPage>
      <SendHeading eyebrow="Orders" title="Your shipments" description="Every request, the quotes you received and where the goods currently are." action={<Link href="/naijasend/ship" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">New shipment</Link>} />
      {shipments.length ? (
        <ul className="space-y-2">
          {shipments.map((shipment) => (
            <li key={shipment.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <Link href={`/naijasend/shipments/${shipment.id}`} className="font-display text-[13.5px] font-extrabold hover:underline">{shipment.reference}</Link>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${shipment.status === "cancelled" ? "bg-[#fff3e8] text-[#a3480f]" : "bg-[#e8f3e4] text-[#0b5c33]"}`}>{SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}</span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-[#5d6d64]">{shipment.originLabel} → {shipment.destinationLabel} · {shipment.weightKg} kg · {shipment.description}</p>
              <p className="mt-1 text-[11px] font-semibold">
                {shipment.quotes.length ? `${shipment.quotes.length} quote${shipment.quotes.length === 1 ? "" : "s"} waiting` : shipment.legs.length ? `${shipment.legs.filter((l) => l.status === "arrived").length}/${shipment.legs.length} legs complete` : "Awaiting quotes"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <SendEmpty title="No shipments yet" body="Request a shipment and verified providers will respond with quotes." cta={{ href: "/naijasend/ship", label: "Ship something" }} />
      )}
    </SendPage>
  );
}
