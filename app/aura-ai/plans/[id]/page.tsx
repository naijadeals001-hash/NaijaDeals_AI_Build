import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { AuraOrb } from "@/components/aura/aura-visuals";

export const metadata: Metadata = { title: "Aura AI — plan" };
export const dynamic = "force-dynamic";

type Component = { kind: string; label: string; detail?: string | null; href?: string | null; amountNaira?: number | null };

export default async function Page({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/aura-ai/plans/${params.id}`);
  const plan = await prisma.auraPlan.findFirst({ where: { id: params.id, userId: user.id } });
  if (!plan) notFound();

  const components = Array.isArray(plan.components) ? (plan.components as Component[]) : [];
  const total = components.reduce((sum, c) => sum + (typeof c.amountNaira === "number" ? c.amountNaira : 0), 0);

  return (
    <main className="min-h-dvh bg-aura-canvas px-4 py-6 text-aura-text sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-4 inline-block text-xs font-semibold text-aura-muted hover:text-aura-mint">← NaijaDeals</Link>
        <header className="flex items-center gap-3">
          <AuraOrb size={36} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold">{plan.title}</h1>
            <p className="text-xs text-aura-muted">
              {plan.city ? `${plan.city} · ` : ""}Draft · saved {new Date(plan.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
            </p>
          </div>
        </header>

        <p className="mt-4 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-3 text-xs text-aura-gold">
          This is a draft. Nothing here is booked or paid. Open each step to review the real option and confirm it in its own
          service — Aura cannot complete a booking or payment for you.
        </p>

        <ol className="mt-5 space-y-3">
          {components.map((component, index) => (
            <li key={index} className="rounded-2xl border border-aura-border bg-aura-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-aura-muted">{component.kind}</p>
                  <p className="mt-0.5 text-sm font-bold text-aura-text">{component.label}</p>
                  {component.detail && <p className="mt-0.5 text-xs text-aura-muted">{component.detail}</p>}
                </div>
                {typeof component.amountNaira === "number" && (
                  <span className="shrink-0 text-sm font-extrabold text-aura-mint">₦{component.amountNaira.toLocaleString("en-NG")}</span>
                )}
              </div>
              {component.href && (
                <Link href={component.href} className="mt-2 inline-flex rounded-full border border-aura-mint/40 px-3.5 py-1.5 text-xs font-bold text-aura-mint">
                  Open in {component.kind}
                </Link>
              )}
            </li>
          ))}
        </ol>

        {total > 0 && (
          <p className="mt-4 text-right text-sm text-aura-muted">
            Estimated total <span className="ml-1 font-extrabold text-aura-text">₦{total.toLocaleString("en-NG")}</span>
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <Link href="/aura-ai" className="rounded-full bg-aura-mint px-4 py-2 text-sm font-bold text-aura-canvas">
            Back to Aura
          </Link>
          <Link href="/aura-ai/plans" className="rounded-full border border-aura-border px-4 py-2 text-sm font-semibold text-aura-text/85">
            All plans
          </Link>
        </div>
      </div>
    </main>
  );
}
