import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter, PropertyCard } from "@/components/stay/stay-home";
import { searchStay } from "@/lib/services/stay/discovery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Saved properties — NaijaStay" };

export default async function SavedPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/naijastay/saved");
  const favs = await prisma.eatsFavourite.findMany({ where: { userId: session.id, kind: "stay_property" }, select: { targetId: true } });
  const all = await searchStay({ take: 60 });
  const saved = all.filter((p) => favs.some((f) => f.targetId === p.id));

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1200px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Saved properties</h1>
        {saved.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {saved.map((property) => <PropertyCard key={property.id} property={property} />)}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
            You have not saved any properties yet. <Link href="/naijastay/stays" className="font-bold text-[#0b5c33] underline">Browse stays</Link>.
          </p>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
