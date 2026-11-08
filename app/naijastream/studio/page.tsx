import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { artistEarnings } from "@/lib/services/stream/service";
import { koboToNaira } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["Overview", "/naijastream/studio"],
  ["My music", "/naijastream/studio/music"],
  ["Upload", "/naijastream/studio/upload"],
  ["Royalties", "/naijastream/studio/royalties"],
  ["Payouts", "/naijastream/studio/payouts"],
  ["Settings", "/naijastream/studio/settings"]
] as const;

export default async function StudioPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijastream/studio");
  const earnings = await artistEarnings(user.id);

  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map(([label, href], index) => (
          <Link
            key={href}
            href={href}
            aria-current={index === 0 ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-[11.5px] font-bold ${index === 0 ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/5 text-white/70 hover:text-emerald-300"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {!earnings ? (
        <section className="mt-6 rounded-xl border border-white/10 bg-[#101613] p-6">
          <h1 className="font-display text-xl font-extrabold">Become a NaijaStream creator</h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-6 text-white/60">
            Creator accounts are provisioned with your NaijaDeals account. Artist profiles open once this environment&apos;s
            creator onboarding is enabled by the platform team — there is no self-serve artist signup here yet, and we
            will not fake one.
          </p>
          <Link href="/naijastream/artists" className="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
            Browse artists
          </Link>
        </section>
      ) : (
        <>
          <header className="mt-6">
            <h1 className="font-display text-[26px] font-extrabold">Creator studio</h1>
            <p className="mt-1 text-[12px] text-white/50">{earnings.artist.name} · verified artist account</p>
          </header>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Total plays", earnings.metrics.totalPlays],
              ["Pending royalties", koboToNaira(earnings.metrics.pendingRoyaltyKobo)],
              ["Settled royalties", koboToNaira(earnings.metrics.settledRoyaltyKobo)],
              ["Wallet available", koboToNaira(earnings.metrics.availableKobo)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-[#101613] p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</p>
                <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-xl border border-white/10 bg-[#101613] p-5">
            <h2 className="font-display text-base font-extrabold">Your catalogue</h2>
            {earnings.tracks.length === 0 ? (
              <p className="mt-2 text-[12px] text-white/55">No tracks yet. Create a draft in Upload — publishing requires uploaded audio.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {earnings.tracks.map((track) => (
                  <li key={track.id} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                    <span className="truncate font-semibold">{track.title}</span>
                    <span className="flex items-center gap-3 text-[11px] text-white/50">
                      <span>{track.playCount} plays</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${track.status === "PUBLISHED" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>{track.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/naijastream/studio/upload" className="mt-3 inline-block text-[12px] font-bold text-emerald-400 hover:underline">
              Upload a release →
            </Link>
          </section>

          <section className="mt-6 rounded-xl border border-white/10 bg-[#101613] p-5">
            <h2 className="font-display text-base font-extrabold">Royalty statements</h2>
            {earnings.accruals.length === 0 ? (
              <p className="mt-2 text-[12px] leading-6 text-white/55">
                No statements yet. Royalties are calculated from a revenue pool configured by finance for each period — they
                are not invented per stream.
              </p>
            ) : (
              <table className="mt-3 w-full text-left text-[12px]">
                <thead className="text-[10px] uppercase tracking-widest text-white/40">
                  <tr><th className="py-1">Period</th><th className="py-1">Eligible plays</th><th className="py-1">Artist amount</th><th className="py-1">Status</th></tr>
                </thead>
                <tbody>
                  {earnings.accruals.map((row) => (
                    <tr key={row.id} className="border-t border-white/5">
                      <td className="py-1.5">{row.period}</td>
                      <td className="py-1.5">{row.eligiblePlays.toString()}</td>
                      <td className="py-1.5">{koboToNaira(row.artistKobo.toString())}</td>
                      <td className="py-1.5">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Link href="/naijastream/studio/royalties" className="mt-3 inline-block text-[12px] font-bold text-emerald-400 hover:underline">
              Royalties &amp; payouts →
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
