import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijastream/account");
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-[24px] font-extrabold">{user.name}</h1>
      <p className="text-[12px] text-white/50">{user.email}</p>
      <ul className="mt-6 space-y-2 text-[13px]">
        <li><Link href="/naijastream/library" className="text-emerald-400 hover:underline">Your library</Link></li>
        <li><Link href="/naijastream/studio" className="text-emerald-400 hover:underline">Creator studio</Link></li>
        <li><Link href="/account" className="text-emerald-400 hover:underline">NaijaDeals account settings</Link></li>
        <li><Link href="/wallet" className="text-emerald-400 hover:underline">NaijaPay wallet</Link></li>
      </ul>
    </main>
  );
}
