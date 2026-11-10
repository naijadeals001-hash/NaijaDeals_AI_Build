import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuraPreferencesForm } from "@/components/aura/aura-preferences-form";
import { AuraOrb } from "@/components/aura/aura-visuals";

export const metadata: Metadata = { title: "Aura AI — privacy and settings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/aura-ai/settings");
  return (
    <main className="aura-type min-h-dvh bg-aura-canvas px-4 py-6 text-aura-text sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-4 inline-block text-xs font-semibold text-aura-muted hover:text-aura-mint">← NaijaDeals</Link>
        <header className="flex items-center gap-3">
          <AuraOrb size={36} />
          <div>
            <h1 className="font-display text-2xl font-extrabold">Privacy and settings</h1>
            <p className="text-xs text-aura-muted">Aura remembers only what you ask it to. Everything here is optional.</p>
          </div>
        </header>
        <AuraPreferencesForm />
      </div>
    </main>
  );
}
