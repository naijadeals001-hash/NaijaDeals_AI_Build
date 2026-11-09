import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My bookings — NaijaStay" };

const naira = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;

export default async function BookingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/naijastay/bookings");
  const reservations = await prisma.stayReservation.findMany({
    where: { guestId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { property: { select: { title: true, slug: true, city: true } } }
  });
  const now = Date.now();
  const upcoming = reservations.filter((r) => ["hold", "awaiting_payment", "confirmed"].includes(r.status) && r.checkOut.getTime() >= now);
  const past = reservations.filter((r) => !upcoming.includes(r));

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1100px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">My bookings</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Upcoming stays, pending holds and past reservations.</p>

        <h2 className="mt-4 font-display text-[15px] font-extrabold">Upcoming &amp; pending ({upcoming.length})</h2>
        {upcoming.length ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {upcoming.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <Link href={`/naijastay/bookings/${r.reference}`} className="text-[12.5px] font-extrabold hover:underline">{r.property.title}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${r.status === "confirmed" ? "bg-[#e8f3e4] text-[#0b5c33]" : "bg-[#fff3e8] text-[#a3480f]"}`}>{r.status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-[11px] text-[#5d6d64]">{r.property.city} · {r.checkIn.toISOString().slice(0, 10)} → {r.checkOut.toISOString().slice(0, 10)} · {r.guests} guest{r.guests === 1 ? "" : "s"}</p>
                <p className="mt-0.5 text-[11.5px] font-extrabold">{naira(r.totalKobo)} <span className="font-normal text-[#6b7a70]">{r.currency}</span></p>
                {r.status === "hold" ? <Link href={`/naijastay/bookings/${r.reference}`} className="mt-1 inline-flex rounded-full bg-[#f26b21] px-3 py-1 text-[10.5px] font-extrabold text-white">Complete payment</Link> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl bg-white p-5 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
            No upcoming stays. <Link href="/naijastay/stays" className="font-bold text-[#0b5c33] underline">Find a place to stay</Link>.
          </p>
        )}

        <h2 className="mt-5 font-display text-[15px] font-extrabold">Past &amp; cancelled ({past.length})</h2>
        {past.length ? (
          <ul className="mt-2 divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] text-[11.5px]">
            {past.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-1 py-1.5">
                <Link href={`/naijastay/bookings/${r.reference}`} className="font-semibold hover:underline">{r.property.title}</Link>
                <span className="text-[#6b7a70]">{r.checkIn.toISOString().slice(0, 10)} · {r.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11.5px] text-[#6b7a70]">Nothing here yet.</p>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
