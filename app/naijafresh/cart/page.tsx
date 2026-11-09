import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getFreshBasket } from "@/lib/services/fresh/cart";
import { FreshBasket } from "@/components/fresh/fresh-basket";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your basket — NaijaFresh" };

export default async function FreshCartPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <FreshPage>
        <FreshHeading eyebrow="Basket" title="Your basket" />
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
          <p className="font-display text-[16px] font-extrabold">Sign in to see your basket</p>
          <p className="mt-1 text-[12px] text-[#5d6d64]">Your basket is saved to your NaijaDeals account across devices.</p>
          <Link href="/login?next=/naijafresh/cart" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Sign in</Link>
        </div>
      </FreshPage>
    );
  }
  const basket = await getFreshBasket(session.id);
  return (
    <FreshPage>
      <FreshHeading eyebrow="Basket" title="Your basket" description="Produce is paid from your NaijaPay wallet and released to the farm once you confirm delivery." />
      <FreshBasket initial={basket} />
    </FreshPage>
  );
}
