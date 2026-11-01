import { AdminDashboard } from "@/components/functional/admin-dashboard";
import { headers } from "next/headers";

export default async function Page({
  params,
}: {
  params: { tab?: string };
}) {
  // Server-side data fetching - use absolute URLs via headers
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3003";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const fetchApi = async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Cookie: headersList.get("cookie") ?? "" },
    });
    if (!res.ok) return null;
    return res.json();
  };

  const overview = await fetchApi("/api/admin/overview");
  const orders = await fetchApi("/api/admin/orders");
  const applications = await fetchApi("/api/admin/applications");
  const products = await fetchApi("/api/admin/products");
  const payments = await fetchApi("/api/admin/payments");
  const users = await fetchApi("/api/admin/users");
  const rides = await fetchApi("/api/admin/rides");
  const audit = await fetchApi("/api/admin/audit-logs");
  const payouts = await fetchApi("/api/admin/payouts");

  // Determine initial tab from pathname
  const initialTab = params?.tab || "overview";

  return (
    <AdminDashboard
      initialTab={initialTab as "overview" | "orders" | "applications" | "products" | "payments" | "users" | "deliveries" | "rides" | "payouts" | "audit"}
      overview={overview}
      orders={orders}
      applications={applications}
      products={products}
      payments={payments}
      users={users}
      rides={rides}
      audit={audit}
      payouts={payouts}
    />
  );
}