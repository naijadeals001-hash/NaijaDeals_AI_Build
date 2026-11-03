"use client";

import Link from "next/link";

const MODULES: Array<[string, string]> = [
  ["NaijaEats", "/naijaeats"],
  ["NaijaFresh", "/naijafresh"],
  ["NaijaDrive", "/naijadrive"],
  ["NaijaSend", "/naijasend"],
  ["NaijaGigs", "/naijagigs"],
  ["NaijaStay", "/naijastay"],
  ["NaijaStream", "/naijastream"],
  ["NaijaPay", "/naijapay"],
  ["Aura AI", "/aura"],
  ["NaijaShop", "/naijashop"]
];

const COLUMNS = [
  {
    title: "Get to know NaijaDeals",
    links: [
      ["About NaijaDeals", "/"],
      ["Marketplace home", "/naijashop"],
      ["Sell on NaijaDeals", "/sell"],
      ["Seller dashboard", "/seller"],
      ["Partner updates", "/seller"]
    ]
  },
  {
    title: "Make money with us",
    links: [
      ["Sell on NaijaDeals", "/sell"],
      ["Run a kitchen", "/restaurant/apply"],
      ["Drive with NaijaDrive", "/driver"],
      ["Deliver with NaijaSend", "/courier"],
      ["Grow with NaijaGigs", "/naijagigs"]
    ]
  },
  {
    title: "Payment and protection",
    links: [
      ["NaijaPay wallet", "/naijapay"],
      ["Your orders", "/orders"],
      ["Returns and refunds", "/orders"],
      ["Your account", "/account"],
      ["Cart", "/cart"]
    ]
  },
  {
    title: "Let us help you",
    links: [
      ["Sign in", "/login"],
      ["Create an account", "/register"],
      ["Support", "/support"],
      ["Your addresses", "/account"],
      ["Saved items", "/account"]
    ]
  }
];

export function ShopFooter() {
  return (
    <footer className="mt-8 text-white">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="w-full bg-[#37475a] py-3.5 text-xs font-bold text-white hover:bg-[#485769]"
      >
        Back to top
      </button>

      <div className="bg-[#232f3e]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-extrabold">{column.title}</h2>
              <ul className="mt-2 space-y-1.5">
                {column.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-xs text-white/75 hover:text-white hover:underline">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 py-5">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 rounded border border-white/30 px-3 py-1.5 font-bold">EN · English</span>
            <span className="inline-flex items-center gap-2 rounded border border-white/30 px-3 py-1.5 font-bold">₦ NGN · Nigeria</span>
            <span className="text-white/60">One account across every NaijaDeals module</span>
          </div>
        </div>
      </div>

      <div className="bg-[#131a22]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-4 px-4 py-7 text-[11px] sm:grid-cols-3 lg:grid-cols-5">
          {MODULES.map(([label, href]) => (
            <Link key={href} href={href} className="text-white/70 hover:text-white hover:underline">
              <span className="block font-bold text-white/90">{label}</span>
              <span className="text-white/50">Part of the NaijaDeals ecosystem</span>
            </Link>
          ))}
        </div>
        <div className="border-t border-white/10 py-5 text-center text-[11px] text-white/50">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <span>Conditions of use</span>
            <span>Privacy notice</span>
            <span>Customer rights</span>
            <span>Your ad choices</span>
          </div>
          <p className="mt-2">© 2026 NaijaDeals.com — one ecosystem for Africa.</p>
        </div>
      </div>
    </footer>
  );
}
