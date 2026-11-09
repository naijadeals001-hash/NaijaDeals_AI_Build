"use client";

import Link from "next/link";
import { Bell, Globe2, Heart, Menu, Search, ShoppingCart, User, X } from "lucide-react";
import { useState } from "react";
import type { VerticalLink } from "@/lib/home/designs";

/**
 * Premium green-and-orange header from the approved mockup. The ecosystem
 * switcher below it is identical on every dashboard, so no service is hidden.
 */
export function SuperAppHeader({ cartCount = 0, country = "Nigeria", verticals }: { cartCount?: number; country?: string; verticals: VerticalLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="bg-[#0b3d21] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 lg:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="NaijaDeals home">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0b5c33] text-[11px] font-black text-[#8ed14b] ring-2 ring-[#8ed14b]/40">ND</span>
            <span className="leading-tight">
              <span className="block text-[18px] font-extrabold leading-none sm:text-[21px]">Naija<span className="text-[#f5b52e]">Deals</span></span>
              <span className="hidden text-[8.5px] text-white/75 sm:block">Africa&apos;s Super App Marketplace</span>
            </span>
          </Link>
          <form action="/search" method="get" role="search" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-full bg-white lg:order-none lg:flex-1">
            <label htmlFor="nd-q" className="sr-only">Search for products, food, rides, stays, services or properties</label>
            <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
            <input id="nd-q" name="q" type="search" placeholder="Search for products, food, rides, stays, services, properties and more…" className="min-h-9 w-full min-w-0 bg-transparent px-3 text-[12px] text-[#14241b] outline-none" />
            <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white"><Search className="h-4 w-4" aria-hidden /></button>
          </form>
          <nav aria-label="Account and actions" className="ml-auto flex shrink-0 items-center gap-2.5 text-[11px] font-semibold">
            <span className="hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 md:flex"><Globe2 className="h-3.5 w-3.5" aria-hidden /> {country}</span>
            <Link href="/naijashop" className="hidden hover:text-[#f5b52e] md:block">Shop</Link>
            <Link href="/sell" className="hidden hover:text-[#f5b52e] lg:block">Sell</Link>
            <Link href="/naijafresh/favourites" aria-label="Saved items" className="hidden hover:text-[#f5b52e] sm:grid"><Heart className="h-4 w-4" aria-hidden /></Link>
            <Link href="/cart" aria-label={`Cart, ${cartCount} items`} className="relative hover:text-[#f5b52e]"><ShoppingCart className="h-5 w-5" aria-hidden /></Link>
            <Link href="/wallet" className="hidden hover:text-[#f5b52e] sm:block">Wallet</Link>
            <Link href="/orders" className="hidden hover:text-[#f5b52e] sm:block">Orders</Link>
            <Link href="/notifications" aria-label="Notifications" className="hover:text-[#f5b52e]"><Bell className="h-4 w-4" aria-hidden /></Link>
            <Link href="/account" className="flex items-center gap-1 hover:text-[#f5b52e]"><User className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Hi, Sign In</span></Link>
          </nav>
        </div>
        <nav aria-label="NaijaDeals services" className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-3 pb-1.5 text-[11.5px] font-semibold [scrollbar-width:none] sm:px-6 lg:px-8">
            {verticals.map((vertical) => (
              <Link key={vertical.key} href={vertical.href} className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-white/10">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#8ed14b" }} aria-hidden /> {vertical.name}
              </Link>
            ))}
          </div>
        </nav>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[82%] max-w-xs overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-extrabold text-[#0b3d21]">NaijaDeals</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1"><X className="h-4 w-4" aria-hidden /></button>
            </div>
            <ul className="mt-3 space-y-1 text-[13px]">
              {verticals.map((vertical) => <li key={vertical.key}><Link href={vertical.href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">{vertical.name}</Link></li>)}
              <li className="border-t border-[#e6ebe7] pt-1"><Link href="/designs" onClick={() => setOpen(false)} className="block rounded px-2 py-2 font-bold text-[#0b5c33] hover:bg-[#f2f9f0]">Change homepage design</Link></li>
              <li><Link href="/account" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Account</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  );
}
