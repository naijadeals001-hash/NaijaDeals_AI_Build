"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Grid2x2, Heart, Home, Leaf, MapPin, Menu, ReceiptText, Search, ShoppingBasket, Sprout, Store, User } from "lucide-react";

export const FRESH_NAV = [
  { href: "/naijafresh/shop", label: "Shop Produce", icon: ShoppingBasket },
  { href: "/naijafresh/farmers", label: "Farmers", icon: Sprout },
  { href: "/naijafresh/business", label: "Bulk Orders", icon: Store },
  { href: "/naijafresh/how-it-works", label: "How It Works", icon: Leaf },
  { href: "/naijafresh/seasonal", label: "Seasonal Harvests", icon: CalendarDays },
  { href: "/naijafresh/offers", label: "Offers", icon: ReceiptText }
];

/** Deep-green NaijaFresh header from the approved mockups. */
export function FreshHeader({ cartCount = 0 }: { cartCount?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="bg-[#0b5c33] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-8">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 lg:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/naijafresh" className="flex shrink-0 items-center gap-1.5" aria-label="NaijaFresh home">
            <Leaf className="h-6 w-6 text-[#8ed14b]" aria-hidden />
            <span className="text-[19px] font-extrabold leading-none sm:text-[23px]">
              Naija<span className="text-[#8ed14b]">Fresh</span>
            </span>
          </Link>
          <form action="/naijafresh/shop" method="get" role="search" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-full bg-white lg:order-none lg:flex-1">
            <label htmlFor="fresh-q" className="sr-only">Search produce, farms or fresh products</label>
            <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
            <input id="fresh-q" name="q" type="search" enterKeyHint="search" placeholder="Search tomatoes, yam, rice, farms or fresh produce…" className="min-h-9 w-full min-w-0 bg-transparent px-3 text-[12.5px] text-[#14241b] outline-none" />
            <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white hover:bg-[#dd5f18]"><Search className="h-4 w-4" aria-hidden /></button>
          </form>
          <nav aria-label="Your account" className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
            <Link href="/naijafresh/orders" className="hidden text-[12px] font-semibold hover:text-[#8ed14b] md:block">Orders</Link>
            <Link href="/naijafresh/favourites" aria-label="Favourites" className="grid h-9 w-9 place-items-center rounded hover:bg-white/10"><Heart className="h-5 w-5" aria-hidden /></Link>
            <Link href="/naijafresh/cart" aria-label={`Cart, ${cartCount} items`} className="relative grid h-9 w-9 place-items-center rounded hover:bg-white/10">
              <ShoppingBasket className="h-5 w-5" aria-hidden />
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f26b21] px-1 text-[9.5px] font-black">{cartCount}</span>
            </Link>
            <Link href="/account" aria-label="Account" className="hidden items-center gap-1 text-[12px] font-semibold hover:text-[#8ed14b] sm:flex"><User className="h-5 w-5" aria-hidden /> Hi, Sign In</Link>
          </nav>
        </div>
        <nav aria-label="NaijaFresh sections" className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-3 pb-1.5 text-[12px] font-semibold [scrollbar-width:none] sm:px-8">
            {FRESH_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/10">
                <item.icon className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden /> {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
      <p className="mx-auto flex max-w-[1440px] items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold text-[#0b5c33] sm:px-8">
        <MapPin className="h-3.5 w-3.5" aria-hidden /> Deliver across Africa · Prices in NGN
      </p>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="NaijaFresh menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[82%] max-w-xs overflow-y-auto bg-white p-4">
            <p className="font-extrabold text-[#0b5c33]">NaijaFresh</p>
            <ul className="mt-3 space-y-1 text-[13px]">
              {FRESH_NAV.map((item) => (
                <li key={item.href}><Link href={item.href} onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">{item.label}</Link></li>
              ))}
              <li><Link href="/naijafresh/orders" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Your orders</Link></li>
              <li><Link href="/naijafresh/favourites" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Favourites</Link></li>
              <li><Link href="/account" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Account</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Mobile bottom navigation from the approved mobile mockup. */
export function FreshBottomNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();
  const items = [
    { href: "/naijafresh", label: "Home", icon: Home },
    { href: "/naijafresh/shop", label: "Shop", icon: Grid2x2 },
    { href: "/naijafresh/farmers", label: "Farmers", icon: Sprout },
    { href: "/naijafresh/cart", label: "Cart", icon: ShoppingBasket },
    { href: "/naijafresh/orders", label: "Orders", icon: ReceiptText },
    { href: "/account", label: "Account", icon: User }
  ];
  return (
    <nav aria-label="NaijaFresh navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eef1ef] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-6">
        {items.map((item) => {
          const active = item.href === "/naijafresh" ? pathname === "/naijafresh" : Boolean(pathname?.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 py-1.5 text-[9.5px] font-semibold ${active ? "text-[#f26b21]" : "text-[#5d6d64]"}`}>
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
                {item.href === "/naijafresh/cart" && cartCount ? (
                  <span className="absolute right-[18%] top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#f26b21] px-1 text-[8px] font-black text-white">{cartCount}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
