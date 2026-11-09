import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Host dashboard — NaijaStay" };

const naira = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;

/** A host sees only their own properties and the reservations on them. */
export default async function HostDashboardPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/naijastay/host/dashboard");
  const host = await prisma.stayHost.findUnique({
    where: { ownerId: session.id },
    include: {
      properties: {
        orderBy: { createdAt: "desc" },
        include: { reservations: { orderBy: { createdAt: "desc" }, take: 20, include: { guest: { select: { name: true } } } }, images: { take: 1, orderBy: { sortOrder: "asc" } } }
      }
    }
  });

  if (!host) {
    return (
      <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
        <StayHeader />
        <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-24 sm:px-6 lg:pb-6">
          <h1 className="mt-3 font-display text-[22px] font-extrabold">Host dashboard</h1>
          <div className="mt-3 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="font-display text-[15px] font-extrabold">You are not hosting on NaijaStay yet</p>
            <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-5 text-[#5d6d64]">Apply as a host to list a property. Applications are reviewed before your listing goes live.</p>
            <Link href="/naijastay/host" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Become a host</Link>
          </div>
        </main>
        <StayFooter />
        <StayBottomNav />
      </div>
    );
  }

  const reservations = host.properties.flatMap((p) => p.reservations);
  const confirmed = reservations.filter((r) => r.status === "confirmed");
  const earned = confirmed.reduce((sum, r) => sum + r.subtotalKobo, BigInt(0));

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1200px] px-3 pb-24 sm:px-6 lg:pb-6">
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-[22px] font-extrabold">{host.displayName}</h1>
            <p className="text-[11.5px] text-[#5d6d64]">Host status: <b className="capitalize">{host.status}</b></p>
          </div>
          <Link href="/naijastay/host" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Add a property</Link>
        </div>

        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          <li className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]"><p className="text-[10.5px] text-[#6b7a70]">Properties</p><p className="font-display text-[20px] font-extrabold">{host.properties.length}</p></li>
          <li className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]"><p className="text-[10.5px] text-[#6b7a70]">Confirmed reservations</p><p className="font-display text-[20px] font-extrabold">{confirmed.length}</p></li>
          <li className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]"><p className="text-[10.5px] text-[#6b7a70]">Booked value (before fees)</p><p className="font-display text-[20px] font-extrabold">{naira(earned)}</p></li>
        </ul>

        <h2 className="mt-4 font-display text-[15px] font-extrabold">Your properties</h2>
        {host.properties.length ? (
          <ul className="mt-2 space-y-2">
            {host.properties.map((property) => (
              <li key={property.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f2f9f0]">{property.images[0] ? <img src={property.images[0].url} alt="" className="h-full w-full object-cover" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/naijastay/stays/${property.slug}`} className="block text-[12.5px] font-extrabold hover:underline">{property.title}</Link>
                    <span className="block text-[10.5px] text-[#6b7a70]">{property.city}, {property.country} · {property.status}{property.isDemo ? " · demo listing" : ""}</span>
                  </span>
                  <span className="text-[11px] font-extrabold text-[#0b5c33]">{property.listingType === "stay" ? `${naira(property.nightlyKobo)} / night` : naira(property.salePriceKobo ?? BigInt(0))}</span>
                </div>
                {property.reservations.length ? (
                  <ul className="mt-2 divide-y divide-[#f0f3f1] text-[11px]">
                    {property.reservations.map((r) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-1 py-1">
                        <span>{r.checkIn.toISOString().slice(0, 10)} → {r.checkOut.toISOString().slice(0, 10)} · {r.guest.name}</span>
                        <span className="font-semibold capitalize">{r.status.replace(/_/g, " ")} · {naira(r.totalKobo)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[10.5px] text-[#6b7a70]">No reservations yet.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl bg-white p-5 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No properties listed yet.</p>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
