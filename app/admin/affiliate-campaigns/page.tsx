import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { AffiliateCampaignPanel } from "@/components/functional/affiliate-campaign-panel";

export const metadata: Metadata = { title: "Affiliate campaigns" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/affiliate-campaigns");
  if (!hasAdminConsoleAccess(user)) redirect("/");
  const canRead = hasPermission(user, "affiliates:read");
  const canManage = hasPermission(user, "affiliates:manage");
  if (!canRead && !canManage) redirect("/admin");
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold">Affiliate campaigns</h1>
        <p className="text-sm text-[#8B949E]">
          Draft the terms, then activate to open traffic. Only ACTIVE campaigns are discoverable by approved affiliates.
        </p>
      </header>
      <AffiliateCampaignPanel canManage={canManage} />
    </main>
  );
}
