import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijastream/studio/upload");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Upload a release</h1>
      <p className="mt-1 text-[12px] text-white/50">Publish music to NaijaStream and reach listeners across Africa.</p>

      <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Upload blocked</p>
        <h2 className="mt-2 font-display text-lg font-extrabold text-white">Audio storage is not configured</h2>
        <p className="mt-2 text-[12.5px] leading-6 text-white/65">
          Publishing requires private audio storage with signed, range-capable delivery — the current static asset folder
          cannot serve paid or private audio safely and would make every upload publicly downloadable and committed to
          source control. Rather than accept uploads that cannot be delivered correctly, upload is disabled here.
        </p>
        <p className="mt-3 text-[11.5px] text-white/50">
          <span className="font-bold text-white/70">Required dependency:</span> object storage (S3-compatible) + signed upload/download URLs + ffmpeg processing worker.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-[#101613] p-5">
        <h2 className="font-display text-base font-extrabold">What is already ready</h2>
        <ul className="mt-2 space-y-1.5 text-[12px] text-white/60">
          <li>• Track records with rights-declaration flag and DRAFT → PUBLISHED state machine (server enforced).</li>
          <li>• Deduplicated play tracking and the royalty accrual engine.</li>
          <li>• Creator earnings, statements and settlement to your NaijaPay wallet.</li>
        </ul>
        <Link href="/naijastream/studio" className="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
          Back to studio
        </Link>
      </div>
    </main>
  );
}
