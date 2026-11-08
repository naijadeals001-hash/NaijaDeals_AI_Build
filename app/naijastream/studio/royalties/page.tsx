import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { artistEarnings } from "@/lib/services/stream/service";
import { koboToNaira } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function RoyaltiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijastream/studio/royalties");
  const earnings = await artistEarnings(user.id);

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Royalties &amp; payouts</h1>
      <p className="mt-1 text-[12px] text-white/50">
        Royalties accrue from the configured revenue pool for each period — never a fixed amount per stream.
      </p>

      {!earnings ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-[#101613] p-6 text-[12.5px] text-white/60">
          You do not have an artist account yet. <Link href="/naijastream/studio" className="font-bold text-emerald-400">Learn about creator accounts</Link>.
        </p>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Pending royalties", koboToNaira(earnings.metrics.pendingRoyaltyKobo)],
              ["Settled royalties", koboToNaira(earnings.metrics.settledRoyaltyKobo)],
              ["Wallet available (NaijaPay)", koboToNaira(earnings.metrics.availableKobo)],
              ["Total plays", earnings.metrics.totalPlays]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-[#101613] p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</p>
                <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
              </div>
            ))}
          </section>

          <section className="mt-5 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/40">
                <tr>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Eligible plays</th>
                  <th className="px-4 py-2">Rate / play</th>
                  <th className="px-4 py-2">Gross</th>
                  <th className="px-4 py-2">Platform</th>
                  <th className="px-4 py-2">Your amount</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {earnings.accruals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-white/50">
                      No royalty statements yet. Finance configures each period&apos;s pool in the Control Center before accrual runs.
                    </td>
                  </tr>
                ) : (
                  earnings.accruals.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 text-white/75">
                      <td className="px-4 py-2 font-semibold">{row.period}</td>
                      <td className="px-4 py-2">{row.eligiblePlays.toString()}</td>
                      <td className="px-4 py-2">{koboToNaira(row.rateKoboPerPlay.toString())}</td>
                      <td className="px-4 py-2">{koboToNaira(row.grossKobo.toString())}</td>
                      <td className="px-4 py-2">{koboToNaira(row.platformKobo.toString())}</td>
                      <td className="px-4 py-2 font-bold text-emerald-300">{koboToNaira(row.artistKobo.toString())}</td>
                      <td className="px-4 py-2">{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="mt-5 rounded-xl border border-white/10 bg-[#101613] p-5 text-[12px] leading-6 text-white/60">
            <h2 className="font-display text-base font-extrabold text-white">Payouts</h2>
            <p className="mt-1">
              Settled royalties move into your shared NaijaPay wallet. Withdrawals use the existing NaijaPay payout rail,
              which is currently gated: the database is classified TEST and no live provider credentials are configured, so
              no payout can be marked successful here.
            </p>
            <Link href="/wallet" className="mt-3 inline-block rounded-full border border-white/20 px-5 py-2.5 text-[12px] font-bold text-white">
              Open NaijaPay wallet
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
