import type { Metadata } from "next";
import { DrivePage } from "@/components/functional/drive-page";
import { getSessionUser, isDriver } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaDrive",
  description: "Book a verified Lagos driver with a fare locked at request and real server ride events."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  return (
    <DrivePage
      viewer={user ? { name: user.name, isDriver: isDriver(user) } : null}
    />
  );
}
