import { PremiumPlans } from "@/components/stream/premium-client";

export const dynamic = "force-dynamic";

export default function PremiumPage() {
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">NaijaStream Premium</h1>
      <p className="mt-1 max-w-2xl text-[12px] text-white/50">
        Ad-free listening, higher quality and creator support. Premium is paid from your NaijaPay wallet balance.
      </p>
      <div className="mt-5">
        <PremiumPlans />
      </div>
    </main>
  );
}
