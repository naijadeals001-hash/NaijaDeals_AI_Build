import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuraOrb } from "@/components/aura/aura-visuals";

export const metadata: Metadata = { title: "Aura AI — my tasks and plans" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/aura-ai/plans");
  const plans = await prisma.auraPlan.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, city: true, status: true, updatedAt: true, components: true }
  });

  return (
    <main className="aura-type min-h-dvh bg-aura-canvas px-4 py-6 text-aura-text sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-xs font-semibold text-aura-muted hover:text-aura-mint">← NaijaDeals</Link>
        <header className="flex items-center gap-3">
          <AuraOrb size={36} />
          <div>
            <h1 className="font-display text-2xl font-extrabold">My tasks</h1>
            <p className="text-xs text-aura-muted">
              Draft plans Aura assembled from real options. Each step is completed in its own service after you confirm it.
            </p>
          </div>
        </header>

        <div className="mt-5 flex gap-2">
          <Link href="/aura-ai" className="rounded-full bg-aura-mint px-4 py-2 text-sm font-bold text-aura-canvas">
            Ask Aura to plan something
          </Link>
        </div>

        {plans.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-aura-border bg-aura-surface p-6 text-sm text-aura-muted">
            No plans yet. Try “Plan a relaxed Saturday in Abuja for two.”
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {plans.map((plan) => {
              const steps = Array.isArray(plan.components) ? (plan.components as Array<{ label?: string }>) : [];
              return (
                <li key={plan.id} className="rounded-2xl border border-aura-border bg-aura-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/aura-ai/plans/${plan.id}`} className="min-w-0">
                      <span className="block truncate text-sm font-bold text-aura-text">{plan.title}</span>
                      <span className="block text-[11px] text-aura-muted">
                        {plan.city ? `${plan.city} · ` : ""}
                        {steps.length} step{steps.length === 1 ? "" : "s"} · {new Date(plan.updatedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      </span>
                    </Link>
                    <span className="rounded-full border border-aura-gold/40 px-2 py-0.5 text-[10px] font-bold text-aura-gold">{plan.status}</span>
                  </div>
                  <ol className="mt-2 space-y-1">
                    {steps.slice(0, 4).map((step, index) => (
                      <li key={index} className="text-xs text-aura-text/75">
                        {index + 1}. {step.label ?? "Step"}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
