import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MapPin, Search } from "lucide-react";
import { listGigCategories, listOpenGigJobs } from "@/lib/services/gigs/service";
import { GigsFooter, GigsHeader, GigsPageShell } from "@/components/gigs/gigs-chrome";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find jobs — NaijaGigs",
  description: "Full-time, part-time, contract and remote job opportunities across Africa.",
  alternates: { canonical: "/naijagigs/jobs" }
};

const MODE_LABEL: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", remote: "Remote", project: "Project" };

export default async function GigsJobsPage({ searchParams }: { searchParams?: { q?: string; category?: string; city?: string } }) {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;
  const q = searchParams?.q?.trim() || undefined;
  const category = searchParams?.category?.trim() || undefined;
  const city = searchParams?.city?.trim() || undefined;
  const [categories, result] = await Promise.all([listGigCategories(), listOpenGigJobs({ q, category, city, page: 1, pageSize: 30 })]);
  const categoryLinks = categories.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categoryLinks} />
      <main id="main-content" className="mx-auto max-w-[1100px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Find a Job</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Every listing here is a real open job posted by a NaijaGigs customer.</p>
        <form action="/naijagigs/jobs" method="get" className="mt-3 flex flex-wrap gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-[#dfe6e1]">
            <Search className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
            <span className="sr-only">Search jobs</span>
            <input name="q" defaultValue={q} placeholder="Search jobs, roles or skills" className="w-full bg-transparent text-[12px] outline-none" />
          </label>
          <label className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-[#dfe6e1]">
            <MapPin className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
            <span className="sr-only">City</span>
            <input name="city" defaultValue={city} placeholder="City" className="w-28 bg-transparent text-[12px] outline-none" />
          </label>
          <select name="category" defaultValue={category ?? ""} aria-label="Category" className="rounded-full bg-white px-3 py-2 text-[12px] ring-1 ring-[#dfe6e1]">
            <option value="">All categories</option>
            {categoryLinks.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button type="submit" className="rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Search</button>
        </form>

        {result.items.length ? (
          <>
            <p className="mt-3 text-[11.5px] text-[#6b7a70]">{result.total} open {result.total === 1 ? "job" : "jobs"}</p>
            <ul className="mt-2 divide-y divide-[#f0f3f1] rounded-2xl bg-white ring-1 ring-[#eef1ef]">
              {result.items.map((job) => (
                <li key={job.id} data-job={job.id}>
                  <Link href={`/naijagigs/jobs/${job.id}`} className="flex items-center gap-3 p-3 hover:bg-[#f9fbf9]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#f2f9f0]"><Briefcase className="h-5 w-5 text-[#0b5c33]" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-extrabold">{job.title}</span>
                      <span className="block truncate text-[10.5px] text-[#6b7a70]">{job.customer?.name ?? "Company on file"}{job.city ? ` · ${job.city}` : ""}{job.category?.name ? ` · ${job.category.name}` : ""}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[#f2f9f0] px-2 py-0.5 text-[10px] font-extrabold text-[#0b5c33]">{MODE_LABEL[String(job.mode)] ?? job.mode}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="font-display text-[15px] font-extrabold">No open jobs match that search</p>
            <p className="mt-1 text-[11.5px] text-[#5d6d64]">Jobs appear here as soon as a customer posts one. You can post the first.</p>
            <Link href="/naijagigs/post-job" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Post a job</Link>
          </div>
        )}
      </main>
      <GigsFooter />
    </GigsPageShell>
  );
}
