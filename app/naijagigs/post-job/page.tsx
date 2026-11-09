import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaGigsPostJobPage } from "@/components/gigs/post-job-page";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Post a Job — NaijaGigs",
  description: "Describe the work you need and receive quotes from verified professionals."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijagigs/post-job");
  return (
    <main id="main-content" className="min-h-screen bg-[#F5F7F6] py-10">
      <NaijaGigsPostJobPage />
    </main>
  );
}
