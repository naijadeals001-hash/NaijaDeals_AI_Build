import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifications — NaijaStay" };

export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/naijastay/notifications");
  const events = await prisma.stayReservationEvent.findMany({
    where: { reservation: { guestId: session.id } },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { reservation: { select: { reference: true } } }
  });
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Notifications</h1>
        {events.length ? (
          <ul className="mt-3 divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] text-[11.5px]">
            {events.map((event) => (
              <li key={event.id} className="py-2">
                <Link href={`/naijastay/bookings/${event.reservation.reference}`} className="font-bold hover:underline">{event.reservation.reference}</Link>
                <span className="ml-1.5 capitalize">{event.status.replace(/_/g, " ")}</span>
                {event.note ? <span className="block text-[10.5px] text-[#5d6d64]">{event.note}</span> : null}
                <span className="block text-[9.5px] text-[#9aa59e]">{new Date(event.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No notifications yet.</p>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
