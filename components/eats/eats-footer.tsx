import Link from "next/link";
import { contactAddress, mailtoFor, type ContactKey } from "@/lib/data/contact-directory";

type PublicContactKey = Exclude<ContactKey, "accounts">;

const CONTACTS: Array<{ label: string; contact: PublicContactKey }> = [
  { label: "Customer support", contact: "support" },
  { label: "Restaurant and partner enquiries", contact: "partners" },
  { label: "Courier enquiries", contact: "drivers" },
  { label: "Careers", contact: "careers" }
];

/** Full footer from the approved desktop mockup. Every link resolves locally. */
export function EatsFooter() {
  const columns: Array<{ title: string; links: Array<[string, string]> }> = [
    {
      title: "Company",
      links: [
        ["About NaijaEats", "/naijaeats"],
        ["How it works", "/naijaeats/help"],
        ["Careers", "/naijaeats/help"],
        ["Press & media", "/naijaeats/help"],
        ["Contact us", "/naijaeats/help"]
      ]
    },
    {
      title: "For customers",
      links: [
        ["Browse restaurants", "/naijaeats/restaurants"],
        ["Track my order", "/naijaeats/orders"],
        ["Payment options", "/pay"],
        ["Refunds & returns", "/naijaeats/help"],
        ["Help centre", "/naijaeats/help"]
      ]
    },
    {
      title: "For restaurants & vendors",
      links: [
        ["Join NaijaEats", "/restaurant/apply"],
        ["Restaurant dashboard", "/restaurant"],
        ["Vendor guidelines", "/naijaeats/help"],
        ["Catering & bulk orders", "/naijaeats/catering"],
        ["Partner support", "/naijaeats/help"]
      ]
    },
    {
      title: "Policies",
      links: [
        ["Terms of service", "/naijaeats/help"],
        ["Privacy policy", "/naijaeats/help"],
        ["Food safety & hygiene", "/naijaeats/help"],
        ["Community guidelines", "/naijaeats/help"]
      ]
    }
  ];

  return (
    <footer className="mt-10 bg-[#0b5c33] text-white">
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f26b21] text-[13px] font-black">N</span>
            Naija<span className="text-[#8ed14b]">Eats</span>
          </p>
          <p className="mt-2 max-w-xs text-[11px] leading-5 text-white/70">
            Order food from top restaurants, local kitchens and trusted vendors across Nigeria and Africa.
          </p>
          <p className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full border border-white/25 px-2 py-0.5">🇳🇬 Nigeria</span>
            <span className="rounded-full border border-white/25 px-2 py-0.5">NGN ₦</span>
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8ed14b]">{column.title}</p>
            <ul className="mt-2 space-y-1 text-[11px] text-white/75">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="hover:text-white hover:underline">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-8">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8ed14b]">Contact</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-[11px] text-white/75 sm:grid-cols-2">
            {CONTACTS.map((entry) => (
              <li key={entry.contact}>
                {entry.label}:{" "}
                <a href={mailtoFor(entry.contact)} className="hover:text-white hover:underline">
                  {contactAddress(entry.contact)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 px-4 py-3 text-[10.5px] text-white/60 sm:flex-row sm:px-8">
          <p>© 2026 NaijaEats, a NaijaDeals company. All rights reserved.</p>
          <nav aria-label="NaijaDeals ecosystem" className="flex flex-wrap justify-center gap-3">
            <Link href="/naijashop" className="hover:text-white">NaijaShop</Link>
            <Link href="/pay" className="hover:text-white">NaijaPay</Link>
            <Link href="/naijadrive" className="hover:text-white">NaijaDrive</Link>
            <Link href="/naijagigs" className="hover:text-white">NaijaGigs</Link>
            <Link href="/naijastream" className="hover:text-white">NaijaStream</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
