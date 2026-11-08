import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { UploadStudio } from "@/components/stream/upload-studio";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijastream/studio/upload");
  return (
    <main className="px-4 py-8 sm:px-6">
      <UploadStudio />
    </main>
  );
}
