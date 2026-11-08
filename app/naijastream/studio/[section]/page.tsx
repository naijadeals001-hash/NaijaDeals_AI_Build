import Link from "next/link";

export const dynamic = "force-dynamic";

const COPY: Record<string, { title: string; body: string }> = {
  music: { title: "My music", body: "Your catalogue is listed on the studio overview with status and play counts. Per-track editing arrives with the media pipeline." },
  payouts: { title: "Payouts", body: "Royalty settlements credit your NaijaPay wallet. Payouts use the shared NaijaPay rail, which is gated until live provider credentials and a LIVE database classification are in place." },
  settings: { title: "Settings", body: "Artist profile settings are managed by the platform team during creator onboarding. Self-serve editing is not enabled yet." }
};

export default function StudioSection({ params }: { params: { section: string } }) {
  const copy = COPY[params.section];
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-[24px] font-extrabold">{copy?.title ?? "Studio"}</h1>
      <p className="mt-2 text-[12.5px] leading-7 text-white/60">{copy?.body ?? "This studio section is not available yet."}</p>
      <Link href="/naijastream/studio" className="mt-5 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
        Back to studio
      </Link>
    </main>
  );
}
