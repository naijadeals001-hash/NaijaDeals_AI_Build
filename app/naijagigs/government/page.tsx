import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FileText, ShieldCheck, Users } from "lucide-react";
import { listGigCategories } from "@/lib/services/gigs/service";
import { contactAddress, mailtoFor } from "@/lib/data/contact-directory";
import { GigsFooter, GigsHeader, GigsPageShell } from "@/components/gigs/gigs-chrome";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "For Government & Institutions — NaijaGigs", alternates: { canonical: "/naijagigs/government" } };

const SERVICES = [
  ["Verified professionals", "Every professional on the marketplace is checked before they can take bookings.", ShieldCheck],
  ["Projects and programmes", "Source talent for short projects, ongoing programmes and public services.", Building2],
  ["Multiple positions", "Post several jobs under one organisation and track applications.", Users],
  ["Documented records", "Bookings, reviews and payments are recorded for audit and reporting.", FileText]
] as const;

export default async function GovernmentPage() {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;
  const categories = await listGigCategories();
  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">For Government &amp; Institutions</h1>
        <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[#5d6d64]">Source verified professionals for projects, programmes and public services — supporting local talent and job creation.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SERVICES.map(([title, body, Icon]) => (
            <li key={title} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
              <Icon className="h-5 w-5 text-[#0b5c33]" aria-hidden />
              <p className="mt-1 text-[12.5px] font-extrabold">{title}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-xl bg-[#fff3e8] p-3 text-[11px] leading-5 text-[#a3480f]">
          Institutional procurement terms, framework agreements and bulk contracting are not approved features yet, so they are not offered here. Start with a normal job posting, or email the partnerships team to discuss an institutional arrangement.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/naijagigs/post-job" className="rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Post a job</Link>
          <Link href="/naijagigs/professionals" className="rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">Browse professionals</Link>
          <a
            href={mailtoFor("partners", { subject: "Institutional procurement enquiry" })}
            className="max-w-full break-words rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]"
          >
            {contactAddress("partners")}
          </a>
        </div>
      </main>
      <GigsFooter />
    </GigsPageShell>
  );
}
