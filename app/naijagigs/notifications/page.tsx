import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";
import { listGigCategories } from "@/lib/services/gigs/service";
import { GigsFooter, GigsHeader, GigsPageShell } from "@/components/gigs/gigs-chrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifications — NaijaGigs" };

export default async function GigsNotificationsPage() {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;
  const categories = await listGigCategories();
  const notes = session
    ? await prisma.partnerNotification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, title: true, body: true, createdAt: true } })
    : [];
  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <main id="main-content" className="mx-auto max-w-[900px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Notifications</h1>
        {!session ? (
          <div className="mt-3 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="text-[12px] text-[#5d6d64]">Sign in to see your NaijaGigs notifications.</p>
            <Link href="/login?next=/naijagigs/notifications" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Sign in</Link>
          </div>
        ) : notes.length ? (
          <ul className="mt-3 divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            {notes.map((note) => (
              <li key={note.id} className="py-2">
                <p className="text-[12px] font-extrabold">{note.title}</p>
                <p className="text-[11px] leading-5 text-[#5d6d64]">{note.body}</p>
                <p className="text-[9.5px] text-[#9aa59e]">{new Date(note.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-[12px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No notifications yet.</p>
        )}
      </main>
      <GigsFooter />
    </GigsPageShell>
  );
}
