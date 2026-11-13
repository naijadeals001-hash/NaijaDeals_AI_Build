import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Power } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { permissionsFor } from "@/lib/auth/permissions";
import { VerticalActivationWorkspace } from "@/components/admin/verticals/vertical-activation-workspace";

export const metadata: Metadata = { title: "Service activation — Control Center" };
export const dynamic = "force-dynamic";

/**
 * Control Center → Service activation.
 *
 * The page deliberately uses the existing Control Center shell and tokens. Read
 * access covers every console operator; the save/clear controls are rendered
 * only for a holder of the super-admin-only `verticals:write` permission, and
 * the API re-checks it on every write.
 */
export default async function VerticalsAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/verticals");
  if (!hasAdminConsoleAccess(user)) redirect("/");

  const permissions = permissionsFor(user);
  const canWrite = permissions.includes("verticals:write");

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">
          <Power className="h-3.5 w-3.5" aria-hidden="true" /> Control Center · Platform
        </p>
        <h1 className="font-display text-2xl font-extrabold leading-tight text-[#F0F6FC] sm:text-3xl">
          Service activation
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[#8B949E]">
          One effective state for every NaijaDeals service. Choose a service, set a GLOBAL, country or city rule, and
          record why. A GLOBAL rule overrides local rules; a service with no rules keeps its verified registry status.
          Only services marked <strong className="text-[#F0F6FC]">Enforced</strong> consult this setting today.
        </p>
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg text-sm font-bold text-[#8B949E] hover:text-[#F0F6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Control Center overview
          </Link>
        </nav>
      </header>

      <VerticalActivationWorkspace canWrite={canWrite} />
    </div>
  );
}
