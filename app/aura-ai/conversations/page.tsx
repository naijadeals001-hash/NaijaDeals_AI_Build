import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuraOrb } from "@/components/aura/aura-visuals";
import { ConversationActions } from "@/components/aura/conversation-actions";

export const metadata: Metadata = { title: "Aura AI — conversations" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/aura-ai/conversations");
  const conversations = await prisma.auraConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, archived: true, updatedAt: true, _count: { select: { messages: true } } }
  });

  return (
    <main className="aura-type min-h-dvh bg-aura-canvas px-4 py-6 text-aura-text sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-xs font-semibold text-aura-muted hover:text-aura-mint">← NaijaDeals</Link>
        <header className="flex items-center gap-3">
          <AuraOrb size={36} />
          <div>
            <h1 className="font-display text-2xl font-extrabold">Conversations</h1>
            <p className="text-xs text-aura-muted">Only you can see these. Deleting removes the conversation and its messages.</p>
          </div>
        </header>

        <div className="mt-5 flex gap-2">
          <Link href="/aura-ai" className="rounded-full bg-aura-mint px-4 py-2 text-sm font-bold text-aura-canvas">
            New chat
          </Link>
          <Link href="/aura-ai/saved" className="rounded-full border border-aura-border px-4 py-2 text-sm font-semibold text-aura-text/85">
            Saved
          </Link>
        </div>

        {conversations.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-aura-border bg-aura-surface p-6 text-sm text-aura-muted">
            You have no conversations yet. Ask Aura something on the chat screen and it will appear here.
          </p>
        ) : (
          <ul className="mt-5 space-y-2">
            {conversations.map((c) => (
              <li key={c.id} className="rounded-xl border border-aura-border bg-aura-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-aura-text">{c.title}</span>
                    <span className="block text-[11px] text-aura-muted">
                      {c._count.messages} message{c._count.messages === 1 ? "" : "s"} · {new Date(c.updatedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      {c.archived ? " · archived" : ""}
                    </span>
                  </span>
                  <ConversationActions id={c.id} archived={c.archived} title={c.title} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
