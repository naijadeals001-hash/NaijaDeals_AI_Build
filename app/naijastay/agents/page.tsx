import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Real estate agents — NaijaStay", alternates: { canonical: "/naijastay/agents" } };

/** Agents are the verified hosts that publish sale and land listings. */
export default async function AgentsPage() {
  const hosts = await prisma.stayHost.findMany({
    where: { status: "verified", properties: { some: { status: "published", listingType: { in: ["sale", "land"] } } } },
    select: { id: true, displayName: true, country: true, bio: true, _count: { select: { properties: true } } }
  });
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1000px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Real estate agents</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Verified hosts with published sale or land listings.</p>
        {hosts.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {hosts.map((host) => (
              <li key={host.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <p className="text-[12.5px] font-extrabold">{host.displayName}</p>
                <p className="text-[10.5px] text-[#6b7a70]">{host.country} · {host._count.properties} listing{host._count.properties === 1 ? "" : "s"}</p>
                <p className="mt-1 text-[11px] text-[#5d6d64]">{host.bio ?? "Details on file with NaijaStay."}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
            No agent listings yet. <Link href="/naijastay/host" className="font-bold text-[#0b5c33] underline">List a property</Link>.
          </p>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
