import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DriverDashboard } from "@/components/functional/driver-dashboard";
import { getSessionUser, isDriver } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Driver board",
  description: "Accept NaijaDrive requests and update real trip status."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/driver");
  if (!isDriver(user)) redirect("/naijadrive");
  return <DriverDashboard />;
}
