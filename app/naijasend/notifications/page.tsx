import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SHIPMENT_STATUS_LABELS } from "@/lib/services/send/shipments";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifications — NaijaSend" };

export default async function SendNotificationsPage() {
  const session = await getSessionUser();
  const events = session
    ? await prisma.shipmentEvent.findMany({
        where: { shipment: { customerId: session.id } },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { shipment: { select: { id: true, reference: true } } }
      })
    : [];
  return (
    <SendPage>
      <SendHeading eyebrow="Notifications" title="Shipment updates" description="Milestones from your shipments, newest first." />
      {!session ? (
        <SendEmpty title="Sign in to see notifications" body="Shipment updates are private to your account." cta={{ href: "/login?next=/naijasend/notifications", label: "Sign in" }} />
      ) : events.length ? (
        <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
          {events.map((event) => (
            <li key={event.id} className="py-2 text-[11.5px]">
              <Link href={`/naijasend/shipments/${event.shipment.id}`} className="font-bold hover:underline">{event.shipment.reference}</Link>
              <span className="ml-1.5">{SHIPMENT_STATUS_LABELS[event.status] ?? event.label}</span>
              <span className="block text-[10px] text-[#9aa59e]">{new Date(event.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <SendEmpty title="Nothing yet" body="Updates appear here as providers move your shipments." cta={{ href: "/naijasend/ship", label: "Request a shipment" }} />
      )}
    </SendPage>
  );
}
