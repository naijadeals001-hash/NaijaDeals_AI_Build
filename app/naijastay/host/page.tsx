import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";
import { HostApplyForm } from "@/components/stay/host-apply-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Host on NaijaStay", alternates: { canonical: "/naijastay/host" } };

export default async function HostPage() {
  const session = await getSessionUser();
  const host = session ? await prisma.stayHost.findUnique({ where: { ownerId: session.id }, select: { status: true, displayName: true } }) : null;
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1000px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">List your property on NaijaStay</h1>
        <p className="mt-0.5 max-w-2xl text-[12px] leading-6 text-[#5d6d64]">Reach thousands of guests, renters and buyers across Africa. Hosts are reviewed before a listing goes live.</p>

        {host ? (
          <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
            <p className="text-[12.5px] font-extrabold">{host.displayName}</p>
            <p className="text-[11.5px] text-[#5d6d64]">Host status: <b className="capitalize">{host.status}</b>{host.status !== "verified" ? " — the Control Center is reviewing your details." : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/naijastay/host/dashboard" className="rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Open host dashboard</Link>
              {host.status === "verified" ? <Link href="/naijastay/host/dashboard#add" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Add a property</Link> : null}
            </div>
          </div>
        ) : (
          <HostApplyForm />
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
