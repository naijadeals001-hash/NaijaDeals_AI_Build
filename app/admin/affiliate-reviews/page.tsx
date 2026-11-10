import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { hasAdminConsoleAccess } from "@/lib/auth/guard";
import { AffiliateReviewPanel } from "@/components/functional/affiliate-review-panel";

export const metadata: Metadata = { title: "Affiliate reversal review" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/affiliate-reviews");
  if (!hasAdminConsoleAccess(user)) redirect("/");
  const canRead = hasPermission(user, "affiliates:read");
  const canManage = hasPermission(user, "affiliates:manage");
  if (!canRead && !canManage) redirect("/admin");
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold">Affiliate reversal review</h1>
        <p className="text-sm text-[#8B949E]">
          Refunds whose historical commission basis is not recorded. Nothing is adjusted until the basis and its evidence are stated.
        </p>
      </header>
      <AffiliateReviewPanel canManage={canManage} />
    </main>
  );
}
