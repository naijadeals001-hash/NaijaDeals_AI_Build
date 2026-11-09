"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, HelpCircle, Home, Locate, Menu, Package, Search, Store, Truck, User, X } from "lucide-react";

export const SEND_NAV = [
  { href: "/naijasend/ship", label: "Ship Now", icon: Package },
  { href: "/naijasend/track", label: "Track Shipment", icon: Locate },
  { href: "/naijasend/quote", label: "Get a Quote", icon: Truck },
  { href: "/naijasend/providers", label: "Find a Provider", icon: Store },
  { href: "/naijasend/transporter", label: "Become a Transporter", icon: User },
  { href: "/naijasend/enterprise", label: "Enterprise Logistics", icon: Package },
  { href: "/naijasend/help", label: "Help & Support", icon: HelpCircle }
];

/** Deep-green NaijaSend header with the orange search action. */
export function SendHeader() {
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
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 lg:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/naijasend" className="flex shrink-0 items-center gap-1.5" aria-label="NaijaSend home">
            <Package className="h-6 w-6 rounded bg-[#f26b21] p-0.5 text-white" aria-hidden />
            <span className="leading-tight">
              <span className="block text-[19px] font-extrabold leading-none sm:text-[22px]">Naija<span className="text-[#8ed14b]">Send</span></span>
              <span className="hidden text-[8.5px] font-medium text-white/80 sm:block">Move Anything, Anywhere in Africa</span>
            </span>
          </Link>
          <span className="hidden items-center gap-1 text-[12px] font-semibold md:flex"><Locate className="h-3.5 w-3.5" aria-hidden /> Nigeria</span>
          <form action="/naijasend/ship" method="get" role="search" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-full bg-white lg:order-none lg:flex-1">
            <label htmlFor="send-q" className="sr-only">Search for logistics, shipments, transporters or services</label>
            <Search className="ml-3 hidden h-4 w-4 self-center text-[#6b7a70] sm:block" aria-hidden />
            <input id="send-q" name="q" type="search" placeholder="Search for logistics, routes, transporters, or services…" className="min-h-9 w-full min-w-0 bg-transparent px-3 text-[12.5px] text-[#14241b] outline-none" />
            <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#f26b21] text-white hover:bg-[#dd5f18]"><Search className="h-4 w-4" aria-hidden /></button>
          </form>
          <nav aria-label="Your account" className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2.5 text-[11.5px] font-semibold">
            <Link href="/" aria-label="Back to the NaijaDeals dashboard" className="mr-1 hidden items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20 md:flex">
              <Home className="h-3.5 w-3.5" aria-hidden /> NaijaDeals
            </Link>
            <Link href="/naijasend/ship" className="hidden items-center gap-1 hover:text-[#8ed14b] sm:flex"><Truck className="h-4 w-4" aria-hidden /> Ship Now</Link>
            <Link href="/naijasend/orders" className="flex items-center gap-1 hover:text-[#8ed14b]"><Package className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Orders</span></Link>
            <Link href="/naijasend/notifications" className="relative grid h-8 w-8 place-items-center rounded hover:bg-white/10" aria-label="Notifications">
              <Bell className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/account" className="flex items-center gap-1 hover:text-[#8ed14b]"><User className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Hi, Sign In</span></Link>
          </nav>
        </div>
        <nav aria-label="NaijaSend sections" className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-3 pb-1.5 text-[12px] font-semibold [scrollbar-width:none] sm:px-6">
            {SEND_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-white/10">
                <item.icon className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden /> {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="NaijaSend menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative h-full w-[82%] max-w-xs overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-extrabold text-[#0b5c33]">NaijaSend</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1"><X className="h-4 w-4" aria-hidden /></button>
            </div>
            <ul className="mt-3 space-y-1 text-[13px]">
              {SEND_NAV.map((item) => (
                <li key={item.href}><Link href={item.href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">{item.label}</Link></li>
              ))}
              <li><Link href="/naijasend/orders" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Your shipments</Link></li>
              <li><Link href="/naijasend/transporter/dashboard" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Transporter dashboard</Link></li>
              <li><Link href="/naijasend/driver/jobs" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">My jobs &amp; navigation</Link></li>
              <li><Link href="/naijasend/track" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Track by number</Link></li>
              <li><Link href="/account" onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-[#f2f9f0]">Account</Link></li>
              <li className="border-t border-[#eef1ef] pt-1"><Link href="/" onClick={() => setOpen(false)} className="block rounded px-2 py-2 font-bold text-[#0b5c33] hover:bg-[#f2f9f0]">← Back to NaijaDeals dashboard</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Mobile bottom navigation from the approved mobile mockup. */
export function SendBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/naijasend", label: "Home", icon: Home },
    { href: "/naijasend/ship", label: "Ship", icon: Package },
    { href: "/naijasend/track", label: "Track", icon: Locate },
    { href: "/naijasend/providers", label: "Transporters", icon: Truck },
    { href: "/naijasend/enterprise", label: "Business", icon: Store },
    { href: "/account", label: "Account", icon: User }
  ];
  return (
    <nav aria-label="NaijaSend navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eef1ef] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-6">
        {items.map((item) => {
          const active = item.href === "/naijasend" ? pathname === "/naijasend" : Boolean(pathname?.startsWith(item.href));
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
