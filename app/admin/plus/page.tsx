import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { PLUS_PERMISSION_NAMES, plusCapabilitiesFor } from "@/components/admin/plus/plus-capabilities";
import { normalizePlusTab } from "@/components/admin/plus/plus-tabs";
import { PlusWorkspace } from "@/components/admin/plus/plus-workspace";

export const metadata: Metadata = { title: "Plus+ Control Center" };
export const dynamic = "force-dynamic";

export default async function PlusAdminPage({
  searchParams
}: {
  searchParams?: { section?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/plus");
  if (!hasAdminConsoleAccess(user)) redirect("/");

  const capabilities = plusCapabilitiesFor(user);
  const initialTab = normalizePlusTab(searchParams?.section);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">NaijaDeals Plus+</p>
        <h1 className="font-display text-2xl font-extrabold leading-tight text-[#F0F6FC] sm:text-3xl">
          Plus+ Control Center
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[#8B949E]">
          Configure service-awareness content, membership plans and terms, member benefits and reviewed promotions.
          Nothing here charges a customer, opens membership or starts a live campaign by itself.
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

      {capabilities.read ? (
        <PlusWorkspace capabilities={capabilities} initialTab={initialTab} />
      ) : (
        <section
          aria-labelledby="plus-access-heading"
          className="rounded-2xl border border-[#7A2324] bg-[#2B1416] p-5 text-[#FFB3AD]"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="plus-access-heading" className="font-display text-lg font-extrabold text-[#F0F6FC]">
                Access restricted
              </h2>
              <p className="mt-2 text-sm leading-6">
                Your account cannot read the Plus+ Control Center. The server requires one of the Plus+ read or write
                permissions; this page does not bypass that decision.
              </p>
              <p className="mt-2 text-xs leading-5">
                Required permission: <code className="rounded bg-black/30 px-1 py-0.5 font-mono">{PLUS_PERMISSION_NAMES.contentRead}</code>
              </p>
              <p className="mt-1 text-xs leading-5">
                Write, publish, membership configuration and advertiser approval are additionally protected by{" "}
                <code className="font-mono">{PLUS_PERMISSION_NAMES.contentWrite}</code>,{" "}
                <code className="font-mono">{PLUS_PERMISSION_NAMES.contentPublish}</code>,{" "}
                <code className="font-mono">{PLUS_PERMISSION_NAMES.membershipConfigure}</code> and{" "}
                <code className="font-mono">{PLUS_PERMISSION_NAMES.advertiserApprove}</code>.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
