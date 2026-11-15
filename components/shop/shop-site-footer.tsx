import { supportHref } from "@/lib/support/contact-link";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { NaijaDealsLogo } from "@/components/brand/naijadeals-logo";
import { contactAddress, type ContactKey } from "@/lib/data/contact-directory";

type PublicContactKey = Exclude<ContactKey, "accounts">;

type ContactLink = { label: string; contact: PublicContactKey; subject?: string };

const CONTACT_LINKS: ContactLink[] = [
  { label: "General enquiries", contact: "hello" },
  { label: "Help and order issues", contact: "support", subject: "NaijaShop help" },
  { label: "Sell and partner with us", contact: "partners", subject: "Partner with NaijaDeals" },
  { label: "Careers", contact: "careers" }
];

const SHOP_LINKS: Array<[string, string]> = [
  ["All departments", "/naijashop/categories"],
  ["Price drops", "/naijashop/deals"],
  ["Bestsellers", "/naijashop/bestsellers"],
  ["Your cart", "/cart"],
  ["Your orders", "/orders"]
];

const SELL_LINKS: Array<[string, string]> = [
  ["Sell on NaijaDeals", "/sell"],
  ["Seller dashboard", "/seller"],
  ["Bulk produce quotes", "/naijafresh/business"],
  ["Freight quotes", "/naijasend/quote"],
  ["Enterprise logistics", "/naijasend/enterprise"]
];

const HELP_LINKS: Array<[string, string]> = [
  ["Marketplace help", "/naijashop/help"],
  ["Your account", "/account"],
  ["Delivery and returns", "/orders"],
  ["Plus membership", "/naijashop/plus"],
  ["NaijaDeals home", "/"]
];

const ECOSYSTEM: Array<[string, string]> = [
  ["NaijaEats", "/naijaeats"],
  ["NaijaFresh", "/naijafresh"],
  ["NaijaDrive", "/naijadrive"],
  ["Deliveries & Freight", "/naijasend"],
  ["NaijaGigs", "/naijagigs"],
  ["NaijaStay", "/naijastay"],
  ["NaijaStream", "/naijastream"],
  ["NaijaPay", "/pay"],
  ["Aura AI", "/aura-ai"]
];

/**
 * Marketplace footer in the NaijaDeals ecosystem shell. Every link points at a
 * real route; the old NaijaShop navy footer is deliberately not reused here so
 * the storefront shares the owner-approved brand rather than a separate brand.
 */
export function ShopSiteFooter({ shopPaused = false }: { shopPaused?: boolean }) {
  return (
    <footer className="mt-12 bg-[#07351f] text-white">
      <div className="mx-auto max-w-[1440px] px-4 pb-28 pt-10 sm:px-6 lg:px-8 lg:pb-12 lg:pt-12">
        <div className={`grid gap-9 sm:grid-cols-2 ${shopPaused ? "lg:grid-cols-[1.35fr_1fr_1.5fr]" : "lg:grid-cols-[1.35fr_1fr_1fr_1fr_1.5fr]"}`}>
          <div>
            <Link href="/naijashop" aria-label="NaijaDeals Marketplace home" className="inline-flex flex-col">
              <NaijaDealsLogo tone="onDark" size="lg" />
              <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#b9d5bd]">Marketplace</span>
            </Link>
            <p className="mt-4 max-w-sm text-[12px] leading-6 text-[#b9d5bd]">
              Retail listings from sellers across Africa, with demonstration inventory clearly labelled, escrow-protected checkout and tracked delivery through the NaijaDeals
              ecosystem.
            </p>
            <ul className="mt-4 space-y-2 text-[11.5px] text-[#d6e7d7]">
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#8ed14b]" aria-hidden /> Escrow-protected NaijaPay checkout
              </li>
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#8ed14b]" aria-hidden /> Tracked delivery on paid orders
              </li>
              <li className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-[#8ed14b]" aria-hidden /> One account across the ecosystem
              </li>
            </ul>
          </div>

          {!shopPaused ? <FooterColumn title="Shop" links={SHOP_LINKS} /> : null}
          {!shopPaused ? <FooterColumn title="Sell and move" links={SELL_LINKS} /> : null}
          <FooterColumn title="Help" links={HELP_LINKS} />
          <FooterColumn title="Contact" contacts={CONTACT_LINKS} />
        </div>

        <div className="mt-9 border-t border-white/10 pt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fb89a]">The NaijaDeals ecosystem</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {ECOSYSTEM.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-[11.5px] text-[#d6e7d7] hover:text-white hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5 text-[11px] text-[#9fc3a9] sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>© 2026 NaijaDeals.com — one ecosystem for Africa.</p>
            <p>
              Corporate correspondence:{" "}
              <a href={supportHref("office")} className="font-bold text-[#d6e7d7] hover:text-white hover:underline">
                {contactAddress("office")}
              </a>
            </p>
          </div>
          <p className="flex items-center gap-3">
            <span>NGN · Nigeria</span>
            {!shopPaused ? (
              <Link href="/sell" className="inline-flex items-center gap-1 font-bold text-[#d6e7d7] hover:text-white">
                Sell on NaijaDeals <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links = [],
  contacts = []
}: {
  title: string;
  links?: Array<[string, string]>;
  contacts?: ContactLink[];
}) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-white">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-[11.5px] text-[#b9d5bd] hover:text-white hover:underline">
              {label}
            </Link>
          </li>
        ))}
        {contacts.map((entry) => (
          <li key={entry.contact} className="text-[11.5px] text-[#b9d5bd]">
            {entry.label}:{" "}
            <a href={supportHref(entry.contact, { subject: entry.subject })} className="hover:text-white hover:underline">
              {contactAddress(entry.contact)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
