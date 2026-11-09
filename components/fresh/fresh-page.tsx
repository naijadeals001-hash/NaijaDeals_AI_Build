import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { freshBasketCount } from "@/lib/services/fresh/cart";
import { FreshBottomNav, FreshHeader } from "@/components/fresh/fresh-shell";
import { FreshFooter } from "@/components/fresh/fresh-promo";

/** Shared chrome for every NaijaFresh route. */
export async function FreshPage({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  const cartCount = await freshBasketCount(session?.id ?? null);
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <FreshHeader cartCount={cartCount} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 pt-4 sm:px-8">
        {children}
      </main>
      <FreshFooter />
      <FreshBottomNav cartCount={cartCount} />
    </div>
  );
}

/** Simple breadcrumb + heading block used by inner routes. */
export function FreshHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-4">
      <nav aria-label="Breadcrumb" className="text-[11px] text-[#6b7a70]">
        <Link href="/naijafresh" className="hover:underline">NaijaFresh</Link>
        <span aria-hidden> / </span>
        <span className="font-semibold text-[#14241b]">{eyebrow ?? title}</span>
      </nav>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight sm:text-[28px]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[#5d6d64] sm:text-[13px]">{description}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Honest empty state used when a list has no real records. */
export function FreshEmpty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
      <p className="font-display text-[16px] font-extrabold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-[#5d6d64]">{body}</p>
      {cta ? (
        <Link href={cta.href} className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white hover:bg-[#094a29]">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
