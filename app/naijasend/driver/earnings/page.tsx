import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { SendEmpty, SendHeading, SendPage } from "@/components/send/send-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Earnings — NaijaSend" };

/**
 * Provider earnings. A shipment counts as earned only when it is delivered AND
 * its settlement transaction exists — the same guard that prevents duplicate
 * payouts. Nothing here is projected or estimated.
 */
export default async function DriverEarningsPage() {
  const session = await getSessionUser();
  if (!session) {
    return <SendPage><SendHeading eyebrow="Transporter" title="Earnings" /><SendEmpty title="Sign in to see your earnings" body="Earnings are linked to your transporter account." cta={{ href: "/login?next=/naijasend/driver/earnings", label: "Sign in" }} /></SendPage>;
  }
  const provider = await prisma.logisticsProvider.findFirst({ where: { ownerId: session.id }, select: { id: true, name: true, ownerId: true } });
  if (!provider) {
    return <SendPage><SendHeading eyebrow="Transporter" title="Earnings" /><SendEmpty title="No transporter profile" body="Register as a transporter to earn on NaijaSend." cta={{ href: "/naijasend/transporter/apply", label: "Register" }} /></SendPage>;
  }

  const assignments = await prisma.shipmentAssignment.findMany({
    where: { providerId: provider.id },
    orderBy: { assignedAt: "desc" },
    take: 100,
    include: { shipment: { select: { id: true, trackingNumber: true, transportState: true, deliveryVerifiedAt: true, originVertical: true } } }
  });
  const settlements = await prisma.walletTransaction.findMany({
    where: { reference: { startsWith: "SEND-SETTLE-" }, ledger: { some: { wallet: { userId: provider.ownerId }, direction: "CREDIT" } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, amountKobo: true, createdAt: true }
  });
  const earnedByShipment = new Map<string, bigint>();
  for (const settlement of settlements) {
    const credit = await prisma.ledgerEntry.findFirst({
      where: { transactionId: settlement.id, direction: "CREDIT", wallet: { userId: provider.ownerId } },
      select: { amountKobo: true }
    });
    earnedByShipment.set(settlement.reference.replace("SEND-SETTLE-", ""), credit?.amountKobo ?? BigInt(0));
  }
  const total = [...earnedByShipment.values()].reduce((sum, value) => sum + value, BigInt(0));

  return (
    <SendPage>
      <SendHeading eyebrow="Transporter" title="Earnings" description={`Settled earnings for ${provider.name}. Payment is released only after the customer confirms delivery with the delivery PIN and the shipment settles once.`} action={<Link href="/wallet" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Open wallet</Link>} />
      <p className="mb-3 rounded-2xl bg-[#0b5c33] p-4 text-white">
        <span className="block text-[11px] font-semibold text-white/80">Total settled</span>
        <span className="font-display text-[24px] font-extrabold">₦{(Number(total) / 100).toLocaleString("en-NG")}</span>
        <span className="mt-0.5 block text-[10.5px] text-white/75">{settlements.length} settled {settlements.length === 1 ? "shipment" : "shipments"}</span>
      </p>
      <h2 className="mb-2 font-display text-[15px] font-extrabold">Jobs</h2>
      {assignments.length ? (
        <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] text-[11.5px]">
          {assignments.map((row) => {
            const earned = earnedByShipment.get(row.shipment.id);
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-1 py-2">
                <Link href={`/naijasend/driver/navigation/${row.shipment.id}`} className="font-semibold hover:underline">{row.shipment.trackingNumber ?? row.shipment.id.slice(-8)}</Link>
                <span className="text-[#6b7a70]">{row.shipment.originVertical} · {row.shipment.transportState.replace(/_/g, " ")}</span>
                <span className={`font-extrabold ${earned ? "text-[#0b5c33]" : "text-[#9aa59e]"}`}>{earned ? `₦${(Number(earned) / 100).toLocaleString("en-NG")}` : "Not settled"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <SendEmpty title="No jobs yet" body="Jobs and earnings appear once a customer books one of your quotes." cta={{ href: "/naijasend/transporter/dashboard", label: "See shipments to quote" }} />
      )}
    </SendPage>
  );
}
