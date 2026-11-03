import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RestaurantApply } from "@/components/commerce/restaurant-apply";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Apply to run a kitchen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/restaurant/apply");
  return <RestaurantApply />;
}
