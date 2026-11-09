import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";
import { PayStay } from "@/components/stay/pay-stay";
import { CancelButton } from "@/components/stay/cancel-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reservation — NaijaStay" };

const naira = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export default async function ReservationPage({ params }: { params: { reference: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/naijastay/bookings/${params.reference}`);
  const reservation = await prisma.stayReservation.findUnique({
    where: { reference: params.reference },
    include: { property: { select: { title: true, slug: true, city: true, country: true } }, events: { orderBy: { createdAt: "asc" } } }
  });
  if (!reservation) notFound();
  // Guests see their own reservation; hosts see reservations on their properties.
  const hostOfProperty = await prisma.stayHost.findFirst({ where: { ownerId: session.id, properties: { some: { id: reservation.propertyId } } }, select: { id: true } });
  if (reservation.guestId !== session.id && !hostOfProperty) notFound();

  const isGuest = reservation.guestId === session.id;
  const policy = JSON.parse(reservation.policySnapshot) as { name: string; freeCancellationUntilHoursBeforeCheckIn: number; refundPercentBeforeDeadline: number };
  const expired = reservation.status === "hold" && reservation.holdExpiresAt !== null && reservation.holdExpiresAt.getTime() < Date.now();

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <nav aria-label="Breadcrumb" className="mt-3 text-[11px] text-[#6b7a70]">
          <Link href="/naijastay/bookings" className="hover:underline">My bookings</Link> <span aria-hidden>/</span> <span className="font-semibold text-[#14241b]">{reservation.reference}</span>
        </nav>

        <h1 className="mt-1 font-display text-[22px] font-extrabold">
          {reservation.status === "confirmed" ? "Your stay is confirmed" : reservation.status === "cancelled" ? "Reservation cancelled" : reservation.status === "completed" ? "Stay completed" : "Reservation held — complete payment"}
        </h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">
          <Link href={`/naijastay/stays/${reservation.property.slug}`} className="font-semibold text-[#0b5c33] underline">{reservation.property.title}</Link>
          {" · "}{reservation.property.city}, {reservation.property.country}
        </p>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="details" className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <h2 id="details" className="font-display text-[15px] font-extrabold">Stay details</h2>
            <dl className="mt-1.5 grid grid-cols-2 gap-2 text-[11.5px]">
              <div><dt className="text-[#6b7a70]">Check-in</dt><dd className="font-bold">{dateKey(reservation.checkIn)}</dd></div>
              <div><dt className="text-[#6b7a70]">Check-out</dt><dd className="font-bold">{dateKey(reservation.checkOut)}</dd></div>
              <div><dt className="text-[#6b7a70]">Nights</dt><dd className="font-bold">{reservation.nights}</dd></div>
              <div><dt className="text-[#6b7a70]">Guests</dt><dd className="font-bold">{reservation.guests}</dd></div>
              <div><dt className="text-[#6b7a70]">Guest</dt><dd className="font-bold">{reservation.guestName}</dd></div>
              <div><dt className="text-[#6b7a70]">Status</dt><dd className="font-bold capitalize">{reservation.status.replace(/_/g, " ")} · {reservation.paymentStatus}</dd></div>
            </dl>

            <h3 className="mt-3 text-[12px] font-extrabold">Price (stored at booking)</h3>
            <dl className="mt-1 space-y-0.5 text-[11.5px]">
              <div className="flex justify-between"><dt className="text-[#5d6d64]">{naira(reservation.nightlyKobo)} × {reservation.nights} night{reservation.nights === 1 ? "" : "s"}</dt><dd>{naira(reservation.subtotalKobo)}</dd></div>
              <div className="flex justify-between"><dt className="text-[#5d6d64]">Cleaning</dt><dd>{naira(reservation.cleaningKobo)}</dd></div>
              <div className="flex justify-between"><dt className="text-[#5d6d64]">Service fee</dt><dd>{naira(reservation.serviceKobo)}</dd></div>
              <div className="flex justify-between border-t border-[#eef1ef] pt-1 text-[13px] font-extrabold"><dt>Total ({reservation.currency})</dt><dd>{naira(reservation.totalKobo)}</dd></div>
            </dl>

            <h3 className="mt-3 text-[12px] font-extrabold">Cancellation policy</h3>
            <p className="text-[11px] leading-5 text-[#5d6d64]">
              Free cancellation up to {policy.freeCancellationUntilHoursBeforeCheckIn} hours before check-in ({policy.refundPercentBeforeDeadline}% refund). After that the refund is 0%. A host cancellation always refunds in full.
            </p>

            <h3 className="mt-3 text-[12px] font-extrabold">History</h3>
            <ol className="mt-1 space-y-1 text-[11px]">
              {reservation.events.map((event) => (
                <li key={event.id}><span className="font-semibold capitalize">{event.status.replace(/_/g, " ")}</span> — {event.note ?? ""} <span className="text-[#9aa59e]">({new Date(event.createdAt).toLocaleString()})</span></li>
              ))}
            </ol>
          </section>

          <aside className="space-y-2">
            {isGuest && expired ? (
              <p className="rounded-2xl bg-[#fff3e8] p-3 text-[11px] leading-5 text-[#a3480f]">Your hold expired and the dates were released. <Link href={`/naijastay/stays/${reservation.property.slug}`} className="font-bold underline">Book again</Link>.</p>
            ) : isGuest && reservation.status === "hold" ? (
              <PayStay reservationId={reservation.id} totalLabel={naira(reservation.totalKobo)} expiresAt={reservation.holdExpiresAt?.toISOString() ?? null} />
            ) : null}
            {reservation.status === "confirmed" || reservation.status === "hold" ? (
              <CancelButton reservationId={reservation.id} />
            ) : null}
            <Link href="/naijastay/bookings" className="block rounded-full px-4 py-2 text-center text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">All my bookings</Link>
          </aside>
        </div>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
