import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { STATE_LABELS } from "@/lib/services/send/state-machine";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";
import { DriverTrackingPanel } from "@/components/platform/driver-tracking-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transporter jobs — NaijaSend" };

const ORIGIN_LABEL: Record<string, string> = {
  naijashop: "NaijaShop order",
  naijafresh: "NaijaFresh order",
  naijaeats: "NaijaEats order",
  naijasend: "Direct NaijaSend booking"
};

export default async function DriverJobsPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <SendPage>
        <SendHeading eyebrow="Transporter" title="My jobs" />
        <SendEmpty title="Sign in to see your jobs" body="Jobs appear only when NaijaSend has assigned a shipment to your provider." cta={{ href: "/login?next=/naijasend/driver/jobs", label: "Sign in" }} />
      </SendPage>
    );
  }
  const provider = await prisma.logisticsProvider.findFirst({ where: { ownerId: session.id }, select: { id: true, name: true, status: true } });
  if (!provider) {
    return (
      <SendPage>
        <SendHeading eyebrow="Transporter" title="My jobs" />
        <SendEmpty title="No transporter profile on this account" body="Register your transport business first; jobs are assigned after a customer books your quote." cta={{ href: "/naijasend/transporter/apply", label: "Register as a transporter" }} />
      </SendPage>
    );
  }
  // Jobs come from assignment records only — never from a URL or online status.
  const assignments = await prisma.shipmentAssignment.findMany({
    where: { providerId: provider.id, revokedAt: null },
    orderBy: { assignedAt: "desc" },
    take: 60,
    include: { shipment: { select: { id: true, trackingNumber: true, originVertical: true, sourceReference: true, transportState: true, originLabel: true, destinationLabel: true, description: true, weightKg: true, pickupVerifiedAt: true } } }
  });
  const active = assignments.filter((row) => !["delivered", "completed", "cancelled", "failed_pickup"].includes(row.shipment.transportState));

  return (
    <SendPage>
      <SendHeading eyebrow="Transporter" title="My jobs" description={`Assigned to ${provider.name}. A job appears here only because NaijaSend recorded an assignment from a paid booking.`} action={<Link href="/naijasend/transporter/dashboard" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Quote queue</Link>} />
      {active[0] ? (
        <div className="mb-3">
          {/* Bound to the first live assignment: tracking cannot run without work. */}
          <DriverTrackingPanel sessionRef={`send:${active[0].shipment.id}`} label={`shipment ${active[0].shipment.trackingNumber ?? active[0].shipment.id.slice(-6)}`} />
        </div>
      ) : null}
      {active.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((row) => (
            <li key={row.id} data-job={row.shipment.trackingNumber ?? row.shipment.id}>
              <Link href={`/naijasend/driver/navigation/${row.shipment.id}`} className="block rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] hover:shadow-md">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <p className="text-[12.5px] font-extrabold">{row.shipment.trackingNumber ?? row.shipment.id.slice(-8)}</p>
                  <span className="rounded-full bg-[#e8f3e4] px-2 py-0.5 text-[10px] font-extrabold text-[#0b5c33]">{STATE_LABELS[row.shipment.transportState] ?? row.shipment.transportState}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] font-semibold text-[#0b5c33]">{ORIGIN_LABEL[row.shipment.originVertical] ?? row.shipment.originVertical}{row.shipment.sourceReference ? ` · ${row.shipment.sourceReference}` : ""}</p>
                <p className="text-[11px] text-[#5d6d64]">{row.shipment.originLabel} → {row.shipment.destinationLabel}</p>
                <p className="text-[10.5px] text-[#6b7a70] line-clamp-1">{row.shipment.description} · {row.shipment.weightKg} kg</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <SendEmpty title="No active jobs" body="Jobs appear when a customer books one of your quotes. You cannot start a job by pressing a button — the assignment has to come from the booking." cta={{ href: "/naijasend/transporter/dashboard", label: "See shipments you can quote" }} />
      )}
      {assignments.length > active.length ? (
        <section aria-labelledby="job-history" className="mt-4">
          <h2 id="job-history" className="mb-2 font-display text-[15px] font-extrabold">Completed jobs</h2>
          <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 text-[11.5px] ring-1 ring-[#eef1ef]">
            {assignments.filter((row) => !active.includes(row)).map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-1 py-1.5">
                <span className="font-semibold">{row.shipment.trackingNumber ?? row.shipment.id.slice(-8)}</span>
                <span className="text-[#6b7a70]">{STATE_LABELS[row.shipment.transportState] ?? row.shipment.transportState}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SendPage>
  );
}
