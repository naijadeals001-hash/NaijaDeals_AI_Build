import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerBookingsPage } from "@/components/gigs/bookings-client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My bookings — NaijaGigs" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijagigs/bookings");
  return (
    <main className="min-h-screen bg-[#F5F7F6] px-4 py-10 sm:px-6">
      <CustomerBookingsPage />
    </main>
  );
}
