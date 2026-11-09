import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listGigCategories } from "@/lib/services/gigs/service";
import { GigsFooter, GigsHeader, GigsPageShell } from "@/components/gigs/gigs-chrome";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Success stories — NaijaGigs", alternates: { canonical: "/naijagigs/stories" } };

/**
 * Only real published reviews appear here. Where no reviews exist yet the page
 * says so instead of inventing testimonials.
 */
export default async function StoriesPage() {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;
  const [categories, reviews] = await Promise.all([
    listGigCategories(),
    prisma.serviceReview.findMany({ where: { status: "PUBLISHED", comment: { not: "" } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } } } })
  ]);
  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <main id="main-content" className="mx-auto max-w-[1100px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Success Stories from Our Community</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Real reviews left by customers after completed bookings.</p>
        {reviews.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
                <p className="text-[10px] text-[#f5b52e]" aria-label={`${review.rating} out of 5`}>{"★".repeat(review.rating)}</p>
                <blockquote className="mt-1 text-[11.5px] italic leading-5 text-[#3f4d45]">“{review.comment}”</blockquote>
                <p className="mt-2 text-[10.5px] font-extrabold">{review.customer.name}</p>
                <p className="text-[9.5px] text-[#6b7a70]">{new Date(review.createdAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="font-display text-[15px] font-extrabold">No published stories yet</p>
            <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-5 text-[#5d6d64]">Stories appear here when customers leave reviews after completed bookings. NaijaGigs does not publish invented testimonials.</p>
            <Link href="/naijagigs/professionals" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Find a professional</Link>
          </div>
        )}
      </main>
      <GigsFooter />
    </GigsPageShell>
  );
}
