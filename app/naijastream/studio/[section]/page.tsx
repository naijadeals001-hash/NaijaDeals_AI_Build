import Link from "next/link";
import { ProfileEditor } from "@/components/stream/profile-editor";

export const dynamic = "force-dynamic";

const COPY: Record<string, { title: string; body: string }> = {
  music: { title: "My music", body: "Your catalogue is listed on the studio overview with status and play counts. Publishing requires uploaded audio and a rights declaration." },
  payouts: { title: "Payouts", body: "Royalty settlements credit your NaijaPay wallet. Payouts use the shared NaijaPay rail, which is gated until live provider credentials and a LIVE database classification are in place." }
};

export default function StudioSection({ params }: { params: { section: string } }) {
  const isSettings = params.section === "settings";
  const copy = COPY[params.section];
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-[24px] font-extrabold">{isSettings ? "Creator profile" : copy?.title ?? "Studio"}</h1>
      {isSettings ? (
        <>
          <p className="mt-2 text-[12.5px] leading-7 text-white/60">
            Update how listeners see you across NaijaStream. Changes save immediately to your artist record.
          </p>
          <ProfileEditor />
        </>
      ) : (
        <p className="mt-2 text-[12.5px] leading-7 text-white/60">{copy?.body ?? "This studio section is not available yet."}</p>
      )}
      <Link href="/naijastream/studio" className="mt-6 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
        Back to studio
      </Link>
    </main>
  );
}
