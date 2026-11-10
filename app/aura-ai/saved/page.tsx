import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuraOrb } from "@/components/aura/aura-visuals";
import { SavedPlanList } from "@/components/aura/saved-plan-list";

export const metadata: Metadata = { title: "Aura AI — saved" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/aura-ai/saved");

  const [messages, plans] = await Promise.all([
    prisma.auraMessage.findMany({
      where: { saved: true, conversation: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, content: true, createdAt: true, conversationId: true }
    }),
    prisma.auraPlan.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, city: true, status: true, updatedAt: true }
    })
  ]);

  return (
    <main className="aura-type min-h-dvh bg-aura-canvas px-4 py-6 text-aura-text sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-xs font-semibold text-aura-muted hover:text-aura-mint">← NaijaDeals</Link>
        <header className="flex items-center gap-3">
          <AuraOrb size={36} />
          <div>
            <h1 className="font-display text-2xl font-extrabold">Saved</h1>
            <p className="text-xs text-aura-muted">Answers you kept and plans Aura drafted. Plans are drafts — nothing is booked.</p>
          </div>
        </header>

        <nav className="mt-5 flex gap-2">
          <Link href="/aura-ai" className="rounded-full border border-aura-border px-4 py-2 text-sm font-semibold text-aura-text/85">
            Back to chat
          </Link>
          <Link href="/aura-ai/plans" className="rounded-full border border-aura-border px-4 py-2 text-sm font-semibold text-aura-text/85">
            My tasks
          </Link>
        </nav>

        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-aura-muted">Draft plans</h2>
          {plans.length === 0 ? (
            <p className="mt-2 rounded-xl border border-aura-border bg-aura-surface p-4 text-sm text-aura-muted">No plans saved yet.</p>
          ) : (
            <SavedPlanList plans={plans.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() }))} />
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-aura-muted">Saved answers</h2>
          {messages.length === 0 ? (
            <p className="mt-2 rounded-xl border border-aura-border bg-aura-surface p-4 text-sm text-aura-muted">
              Nothing saved yet. Use the bookmark under any answer.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {messages.map((m) => (
                <li key={m.id} className="rounded-xl border border-aura-border bg-aura-surface p-4">
                  <p className="text-sm leading-relaxed text-aura-text/90">{m.content.slice(0, 320)}{m.content.length > 320 ? "…" : ""}</p>
                  <p className="mt-2 text-[11px] text-aura-muted">
                    {new Date(m.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })} ·{" "}
                    <a href={`/aura-ai?c=${m.conversationId}`} className="text-aura-mint underline">
                      open conversation
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
