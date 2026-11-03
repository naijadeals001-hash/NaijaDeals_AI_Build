import { Suspense } from "react";
import { AdminDashboard } from "@/components/functional/admin-dashboard";
import { getSessionUser, isSuperAdmin, toPublicSessionUser } from "@/lib/auth/session";
import { loadAdminPageData } from "@/lib/admin/load-page-data";
import { normalizeModule, normalizeTab } from "@/lib/admin/admin-navigation";
import { resolveAdminRegion } from "@/lib/admin/region";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams
}: {
  searchParams?: { tab?: string; module?: string; geo?: string };
}) {
  const sessionUser = await getSessionUser();
  const resolved = resolveAdminRegion(searchParams?.geo, sessionUser?.scopeCountryCode);
  const [data, publicUser] = await Promise.all([
    loadAdminPageData(resolved.region),
    sessionUser ? toPublicSessionUser(sessionUser) : Promise.resolve(null)
  ]);

  return (
    <Suspense fallback={<p className="p-6 text-sm text-[#8B949E]">Loading Control Center…</p>}>
      <AdminDashboard
        initialTab={normalizeTab(searchParams?.tab)}
        initialModule={normalizeModule(searchParams?.module)}
        overview={data.overview}
        orders={data.orders}
        applications={data.applications}
        products={data.products}
        payments={data.payments}
        disputes={data.disputes}
        freight={data.freight}
        users={data.users}
        rides={data.rides}
        audit={data.audit}
        payouts={data.payouts}
        vendors={data.vendors}
        couriers={data.couriers}
        loadErrors={data.loadErrors}
        loadedAt={data.loadedAt}
        userRoles={publicUser?.roles ?? ["admin"]}
        userActorType={publicUser?.actorType ?? "ADMIN"}
        isSuperAdmin={sessionUser ? isSuperAdmin(sessionUser) : false}
        region={resolved.region}
        regionRestricted={resolved.restricted}
      />
    </Suspense>
  );
}
