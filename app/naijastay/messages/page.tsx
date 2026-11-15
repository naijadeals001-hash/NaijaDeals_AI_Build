import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";
import { mailtoFor } from "@/lib/data/contact-directory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages — NaijaStay" };

/**
 * Host ↔ guest messages, scoped to reservations the caller is party to.
 * Sending is not enabled yet, and the page says so rather than showing a dead form.
 */
export default async function MessagesPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/naijastay/messages");
  const host = await prisma.stayHost.findUnique({ where: { ownerId: session.id }, select: { id: true } });
  const reservations = await prisma.stayReservation.findMany({
    where: host ? { OR: [{ guestId: session.id }, { property: { hostId: host.id } }] } : { guestId: session.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, reference: true, property: { select: { title: true } } }
  });
  const messages = reservations.length
    ? await prisma.stayMessage.findMany({ where: { reservationId: { in: reservations.map((r) => r.id) } }, orderBy: { createdAt: "asc" }, take: 100 })
    : [];

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Messages</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Conversations are limited to reservations you are part of.</p>

        {reservations.length ? (
          <ul className="mt-3 divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] text-[11.5px]">
            {reservations.map((r) => {
              const thread = messages.filter((m) => m.reservationId === r.id);
              return (
                <li key={r.id} className="py-2">
                  <Link href={`/naijastay/bookings/${r.reference}`} className="font-extrabold hover:underline">{r.property.title}</Link>
                  <span className="ml-2 text-[#6b7a70]">{r.reference}</span>
                  <p className="mt-0.5 text-[10.5px] text-[#5d6d64]">{thread.length ? `${thread.length} message${thread.length === 1 ? "" : "s"}` : "No messages in this conversation yet."}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No conversations yet. <Link href="/naijastay/stays" className="font-bold text-[#0b5c33] underline">Find a stay</Link>.</p>
        )}

        <p className="mt-3 rounded-xl bg-[#fff3e8] p-3 text-[10.5px] leading-5 text-[#a3480f]">
          Sending messages inside NaijaStay is not enabled yet. Until it is, contact the NaijaDeals support team and they will reach the host for you —
          <a href={mailtoFor("support", { subject: "NaijaStay reservation help" })} className="ml-1 font-bold underline">email support</a> with your reservation reference.
        </p>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
