"use client";

import Link from "next/link";

export function ShopFooter() {
  const columns = [
    { title: "Get to know NaijaDeals", links: [["Marketplace home", "/"], ["NaijaShop", "/naijashop"], ["NaijaEats", "/naijaeats"], ["NaijaSend", "/naijasend"]] },
    { title: "Make money with us", links: [["Sell on NaijaDeals", "/sell"], ["Run a kitchen", "/restaurant/apply"], ["Drive with NaijaDrive", "/driver"], ["Deliver with NaijaSend", "/courier"]] },
    { title: "Payment and protection", links: [["NaijaPay wallet", "/naijapay"], ["Your orders", "/orders"], ["Your account", "/account"], ["Cart", "/cart"]] },
    { title: "Let us help you", links: [["Sign in", "/login"], ["Create an account", "/register"]] }
  ];
  return (
    <footer className="mt-6 border-t border-border-soft bg-[#0b1a13] text-white">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="w-full bg-[#08120d] py-3 text-xs font-bold text-white/90 hover:bg-[#101f18]">
        Back to top
      </button>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-extrabold">{column.title}</h2>
            <ul className="mt-2 space-y-1.5">
              {column.links.map(([label, href]) => (
                <li key={label}><Link href={href} className="text-xs text-white/70 hover:text-white hover:underline">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 py-4 text-center text-[11px] text-white/50">
        NaijaDeals · One account across shop, food, rides, delivery, stays, streaming and payments.
      </div>
    </footer>
  );
}
