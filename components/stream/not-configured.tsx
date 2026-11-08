import Link from "next/link";

/**
 * Honest unavailable state for surfaces whose real dependency is missing.
 * Never a fake control, never a dead button.
 */
export function NotConfigured({
  title,
  body,
  dependency,
  backHref = "/naijastream",
  backLabel = "Back to NaijaStream"
}: {
  title: string;
  body: string;
  dependency: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-6 sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Not available yet</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-white">{title}</h1>
        <p className="mt-3 text-[13px] leading-7 text-white/65">{body}</p>
        <p className="mt-4 rounded-lg bg-black/30 p-3 text-[11.5px] text-white/50">
          <span className="font-bold text-white/70">Required dependency:</span> {dependency}
        </p>
        <Link href={backHref} className="mt-5 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
