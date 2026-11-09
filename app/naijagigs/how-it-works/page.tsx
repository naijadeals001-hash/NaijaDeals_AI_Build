import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Briefcase, CreditCard, Star, UserPlus, Handshake } from "lucide-react";
import { listGigCategories } from "@/lib/services/gigs/service";
import { GigsFooter, GigsHeader, GigsPageShell } from "@/components/gigs/gigs-chrome";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "How NaijaGigs works — NaijaGigs", alternates: { canonical: "/naijagigs/how-it-works" } };

const STEPS = [
  ["Sign Up", "Create your account in minutes — as a customer, a professional or both.", UserPlus],
  ["Post or Browse", "Customers post a job or browse services; professionals publish gigs or apply to jobs.", Briefcase],
  ["Connect", "Hire, apply or agree on a gig. Chat and agree the scope before work starts.", Handshake],
  ["Work & Get Paid", "Deliver the work and get paid securely through NaijaPay.", CreditCard],
  ["Review & Build Trust", "Rate and review so the next customer can choose with confidence.", Star]
] as const;

export default async function HowItWorksPage() {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;
  const categories = await listGigCategories();
  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">How NaijaGigs Works</h1>
        <ol className="mt-3 space-y-2">
          {STEPS.map(([title, body, Icon], index) => (
            <li key={title} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0b5c33] text-[12px] font-black text-white">{index + 1}</span>
              <span>
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold"><Icon className="h-4 w-4 text-[#0b5c33]" aria-hidden /> {title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-[#5d6d64]">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[#f2f9f0] p-3 text-[11px] leading-5 text-[#3f4d45]">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0b8f47]" aria-hidden />
          Professionals are marked verified only after NaijaGigs checks their details. Ratings on this site come from completed bookings with published reviews — never invented.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/naijagigs/professionals" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Hire a professional</Link>
          <Link href="/naijagigs/jobs" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Find a job</Link>
          <Link href="/naijagigs/pro" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Offer your skills</Link>
        </div>
      </main>
      <GigsFooter />
    </GigsPageShell>
  );
}
