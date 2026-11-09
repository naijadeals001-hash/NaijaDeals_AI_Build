"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BedDouble, Bell, Building2, CalendarCheck, Heart, Home, House, LandPlot, Key, MapPin, Menu, MessageCircle, Search, Store, TreePalm, User, Users, Building } from "lucide-react";

export const STAY_NAV = [
  { href: "/naijastay/stays", label: "Stays & Accommodation", icon: BedDouble },
  { href: "/naijastay/search?type=rent", label: "Property for Rent", icon: House },
  { href: "/naijastay/search?type=sale", label: "Property for Sale", icon: Store },
  { href: "/naijastay/search?type=land", label: "Land & Plots", icon: LandPlot },
  { href: "/naijastay/search?category=vacation-homes", label: "Vacation & Holiday Stays", icon: TreePalm },
  { href: "/naijastay/search?category=corporate-stays", label: "Corporate Stays", icon: Building2 },
  { href: "/naijastay/host", label: "Host on NaijaStay", icon: Key },
  { href: "/naijastay/agents", label: "Real Estate Agents", icon: Users }
];

/** Deep-green NaijaStay header matching the approved mockups. */
export function StayHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      <div className="bg-[#0b5c33] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 lg:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/naijastay" className="flex shrink-0 items-center gap-1.5" aria-label="NaijaStay home">
            <House className="h-6 w-6 text-[#f5b52e]" aria-hidden />
            <span className="leading-tight">
              <span className="block text-[19px] font-extrabold leading-none sm:text-[22px]">Naija<span className="text-[#f5b52e]">Stay</span></span>
              <span className="hidden text-[8.5px] font-medium text-white/80 sm:block">Hotels • Short Stays • Rentals • Property • Land</span>
            </span>
          </Link>
          <span className="hidden items-center gap-1 text-[12px] font-semibold md:flex"><MapPin className="h-3.5 w-3.5" aria-hidden /> Nigeria</span>
          <form action="/naijastay/search" method="get" role="search" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-full bg-white lg:order-none lg:flex-1">
            <label htmlFor="stay-q" className="sr-only">Search hotels, apartments, houses, land or cities</label>
            <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
            <input id="stay-q" name="q" type="search" placeholder="Search hotels, apartments, houses, land or cities…" className="min-h-9 w-full min-w-0 bg-transparent px-3 text-[12.5px] text-[#14241b] outline-none" />
            <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white"><Search className="h-4 w-4" aria-hidden /></button>
          </form>
          <nav aria-label="Your NaijaStay account" className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] font-semibold sm:gap-2.5">
            <Link href="/" aria-label="Back to the NaijaDeals dashboard" className="mr-1 hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20 md:flex"><Home className="h-3.5 w-3.5" aria-hidden /> NaijaDeals</Link>
            <Link href="/naijastay/host" className="hidden items-center gap-1 hover:text-[#f5b52e] sm:flex"><Key className="h-4 w-4" aria-hidden /> List a Property</Link>
            <Link href="/naijastay/bookings" className="flex items-center gap-1 hover:text-[#f5b52e]"><CalendarCheck className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">My Bookings</span></Link>
            <Link href="/naijastay/saved" aria-label="Saved properties" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"><Heart className="h-4 w-4" aria-hidden /></Link>
            <Link href="/naijastay/messages" aria-label="Messages" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"><MessageCircle className="h-4 w-4" aria-hidden /></Link>
            <Link href="/naijastay/notifications" className="relative grid h-8 w-8 place-items-center rounded hover:bg-white/10" aria-label="Notifications"><Bell className="h-4 w-4" aria-hidden /></Link>
            <Link href="/account" className="flex items-center gap-1 hover:text-[#f5b52e]"><User className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Hi, Sign In</span></Link>
          </nav>
        </div>
        <nav aria-label="NaijaStay sections" className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-3 pb-1.5 text-[12px] font-semibold [scrollbar-width:none] sm:px-8">
            {STAY_NAV.map((item) => (
              <Link key={item.label} href={item.href} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/10">
                <item.icon className="h-3.5 w-3.5 text-[#f5b52e]" aria-hidden /> {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="NaijaStay menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[82%] max-w-xs overflow-y-auto bg-white p-4">
            <p className="font-extrabold text-[#0b5c33]">NaijaStay</p>
            <ul className="mt-3 space-y-1 text-[13px]">
              {STAY_NAV.map((item) => <li key={item.label}><Link href={item.href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">{item.label}</Link></li>)}
              <li><Link href="/naijastay/bookings" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">My bookings</Link></li>
              <li><Link href="/naijastay/saved" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Saved</Link></li>
              <li><Link href="/naijastay/messages" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Messages</Link></li>
              <li className="border-t border-[#eef1ef] pt-1"><Link href="/" onClick={() => setOpen(false)} className="block rounded px-2 py-2 font-bold text-[#0b5c33] hover:bg-[#f2f9f0]">← Back to NaijaDeals dashboard</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Mobile bottom navigation from the approved mobile mockup. */
export function StayBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/naijastay", label: "Home", icon: Home },
    { href: "/naijastay/stays", label: "Stays", icon: BedDouble },
    { href: "/naijastay/search", label: "Property", icon: Building },
    { href: "/naijastay/bookings", label: "Bookings", icon: CalendarCheck },
    { href: "/naijastay/messages", label: "Messages", icon: MessageCircle },
    { href: "/account", label: "Account", icon: User }
  ];
  return (
    <nav aria-label="NaijaStay navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eef1ef] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-6">
        {items.map((item) => {
          const active = item.href === "/naijastay" ? pathname === "/naijastay" : Boolean(pathname?.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-1.5 text-[9.5px] font-semibold ${active ? "text-[#f26b21]" : "text-[#5d6d64]"}`}>
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
