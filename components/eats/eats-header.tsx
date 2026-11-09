"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Heart, MapPin, Menu, Search, ShoppingBag, User } from "lucide-react";

/**
 * NaijaEats header.
 *
 * Desktop mirrors the approved mockup: utility row (delivery location, search,
 * Orders, Favourites, Notifications, Account) over a green brand bar with the
 * cuisine strip. Mobile collapses to logo + location + cart, then a full-width
 * search, as the mobile mockup shows.
 */
export function EatsHeader({
  destination,
  cartCount,
  cuisines
}: {
  destination: string;
  cartCount: number;
  cuisines: Array<{ slug: string; label: string; restaurants: number }>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      {/* Brand bar */}
      <div className="bg-[#0b5c33] text-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2 sm:gap-4 sm:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <Link href="/naijaeats" className="flex shrink-0 items-center gap-1.5" aria-label="NaijaEats home">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f26b21] text-[15px] font-black text-white">N</span>
            <span className="text-[19px] font-extrabold leading-none tracking-tight sm:text-[23px]">
              Naija<span className="text-[#8ed14b]">Eats</span>
            </span>
          </Link>

          <span className="ml-1 hidden text-[10px] font-semibold leading-tight text-white/70 sm:block">
            Food Delivery
            <br />
            Across Nigeria
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link href="/naijaeats#location" className="hidden items-center gap-1 text-[12px] font-semibold hover:text-[#8ed14b] lg:flex">
              <MapPin className="h-4 w-4" aria-hidden /> Deliver to {destination}
            </Link>
            <Link href="/naijaeats#orders" className="hidden items-center gap-1 text-[12px] font-semibold hover:text-[#8ed14b] md:flex">
              Orders
            </Link>
            <Link href="/naijaeats#favourites" className="hidden items-center gap-1 text-[12px] font-semibold hover:text-[#8ed14b] md:flex">
              <Heart className="h-4 w-4" aria-hidden /> Favourites
            </Link>
            <Link href="/naijaeats#cart" aria-label={`Cart, ${cartCount} items`} className="relative flex items-center gap-1 rounded px-1.5 py-1 hover:text-[#8ed14b]">
              <ShoppingBag className="h-5 w-5" aria-hidden />
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#f26b21] px-1 text-[10px] font-black text-white">
                {cartCount}
              </span>
            </Link>
            <Link href="/account" aria-label="Your account" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10">
              <User className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* Location + search */}
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:px-8">
        <Link
          href="/naijaeats#location"
          className="flex items-center gap-1.5 rounded-full border border-[#0b5c33]/25 px-3 py-1.5 text-[11.5px] font-semibold text-[#0b5c33] lg:hidden"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {destination}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </Link>
        <form action="/naijaeats/search" method="get" className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-full border border-[#e2e6e3] bg-white">
          <label htmlFor="eats-q" className="sr-only">
            Search for restaurants, cuisines, dishes or vendors
          </label>
          <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
          <input
            id="eats-q"
            name="q"
            type="search"
            enterKeyHint="search"
            placeholder="Search for restaurants, cuisines, dishes or vendors…"
            className="min-h-9 w-full min-w-0 flex-1 bg-transparent px-3 text-[12.5px] text-[#14241b] outline-none placeholder:text-[#7d8a81]"
          />
          <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white hover:bg-[#dd5f18]">
            <Search className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>

      {/* Cuisine strip */}
      <nav aria-label="Cuisines" className="border-t border-[#eef1ef]">
        <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-3 pb-2 text-[12px] font-semibold [scrollbar-width:none] sm:px-8">
          <Link href="/naijaeats/restaurants" className="flex shrink-0 items-center gap-1 rounded-full bg-[#e7f6ec] px-3 py-1.5 text-[#0b5c33]">
            All Restaurants
          </Link>
          {cuisines.map((cuisine) => (
            <Link
              key={cuisine.slug}
              href={`/naijaeats/restaurants/cuisine/${cuisine.slug}`}
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[#33443a] hover:bg-[#f4f6f5] hover:text-[#0b5c33]"
            >
              {cuisine.label}
            </Link>
          ))}
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="NaijaEats menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[82%] max-w-xs overflow-y-auto bg-white p-4">
            <p className="font-extrabold text-[#0b5c33]">Browse NaijaEats</p>
            <ul className="mt-3 space-y-1 text-[13px]">
              <li><Link href="/naijaeats/restaurants" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f4f6f5]">All restaurants</Link></li>
              {cuisines.map((cuisine) => (
                <li key={cuisine.slug}>
                  <Link href={`/naijaeats/restaurants/cuisine/${cuisine.slug}`} onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f4f6f5]">
                    {cuisine.label} <span className="text-[11px] text-[#6b7a70]">({cuisine.restaurants})</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-[#eef1ef] pt-3 text-[11px] font-bold uppercase tracking-wide text-[#6b7a70]">Your account</p>
            <ul className="mt-1 space-y-1 text-[13px]">
              <li><Link href="/naijaeats#orders" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f4f6f5]">Your orders</Link></li>
              <li><Link href="/naijaeats#favourites" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f4f6f5]">Favourites</Link></li>
              <li><Link href="/account" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f4f6f5]">Account</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  );
}
