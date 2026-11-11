import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DriverWorkspace } from "@/components/drive/driver-workspace";
import { getSessionUser, isDriver } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Driver workspace — NaijaDrive",
  description:
    "Approved NaijaDrive partners manage online presence, passenger requests, navigation and trip completion."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/driver");
  if (!isDriver(user)) redirect("/naijadrive");
  return <DriverWorkspace userName={user.name} />;
}
