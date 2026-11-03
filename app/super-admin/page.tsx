import { Suspense } from "react";
import { AdminDashboard } from "@/components/functional/admin-dashboard";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";
import { loadAdminPageData } from "@/lib/admin/load-page-data";
import { normalizeModule, normalizeTab } from "@/lib/admin/admin-navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams
}: {
  searchParams?: { tab?: string; module?: string; geo?: string };
}) {
  const [data, sessionUser] = await Promise.all([loadAdminPageData(), getSessionUser()]);
  const publicUser = sessionUser ? await toPublicSessionUser(sessionUser) : null;

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
        users={data.users}
        rides={data.rides}
        audit={data.audit}
        payouts={data.payouts}
        vendors={data.vendors}
        couriers={data.couriers}
        loadErrors={data.loadErrors}
        loadedAt={data.loadedAt}
        userRoles={publicUser?.roles ?? ["super_admin"]}
        userActorType={publicUser?.actorType ?? "ADMIN"}
        isSuperAdmin
      />
    </Suspense>
  );
}
