"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot, Home, Menu, Search, ShoppingBag, UserCircle, Wallet, PackageCheck, Languages, X } from "lucide-react";
import { verticals } from "@/lib/data/ecosystem";

const topLinks = [
  { href: "/", label: "Home" },
  { href: "/ecosystem-hub", label: "Ecosystem" },
  { href: "/search", label: "Search" },
  { href: "/admin", label: "Admin" }
];

const bottomLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/orders", label: "Orders", icon: PackageCheck },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/account", label: "Account", icon: UserCircle }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-40 border-b border-border-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-white shadow-lift">ND</span>
            <span className="font-display text-xl font-extrabold text-primary">NaijaDeals</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {topLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${pathname === link.href ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-low"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/aura-ai" className="hidden rounded-full bg-night px-4 py-2 text-sm font-bold text-white sm:inline-flex">
              Aura AI
            </Link>
            <Link href="/wallet" className="rounded-full p-2 text-primary hover:bg-primary-soft" aria-label="Wallet">
              <Wallet className="h-5 w-5" />
            </Link>
            <button className="rounded-full p-2 text-muted hover:bg-surface-low" aria-label="Language">
              <Languages className="h-5 w-5" />
            </button>
            <button
              className="rounded-full p-2 text-muted hover:bg-surface-low lg:hidden"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-border-soft bg-canvas p-4 shadow-soft lg:hidden">
          <div className="grid gap-2 sm:grid-cols-2">
            {topLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
                {link.label}
              </Link>
            ))}
            {verticals.map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Link key={vertical.key} href={vertical.href} onClick={closeMenu} className="flex items-center gap-3 rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
                  <Icon className="h-4 w-4 text-primary" />
                  {vertical.name}
                </Link>
              );
            })}
            <Link href="/business/shop" onClick={closeMenu} className="rounded-xl bg-night px-4 py-3 text-sm font-bold text-white">
              Seller OS
            </Link>
          </div>
        </div>
      ) : null}

      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 border-r border-border-soft bg-canvas px-4 py-5 lg:block">
        <div className="mb-5 rounded-xl bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Verified Eco-Member</p>
          <p className="mt-1 font-bold">Welcome back, John</p>
          <p className="mt-1 text-xs text-muted">Trust score 94. Low-data mode ready.</p>
        </div>
        <nav className="space-y-1">
          {verticals.map((vertical) => {
            const Icon = vertical.icon;
            return (
              <Link key={vertical.key} href={vertical.href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-surface-low hover:text-primary">
                <Icon className="h-5 w-5" />
                <span>{vertical.name}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/business/shop" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-night px-4 py-3 text-sm font-bold text-white">
          <ShoppingBag className="h-4 w-4" />
          Seller OS
        </Link>
        <Link href="/aura-ai" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border-soft px-4 py-3 text-sm font-bold">
          <Bot className="h-4 w-4" />
          Ask Aura
        </Link>
      </aside>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 lg:ml-64 lg:px-8">{children}</main>

      <footer className="hidden border-t border-border-soft bg-canvas py-8 lg:block lg:ml-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-8 text-sm text-muted">
          <span>NaijaDeals.com Super Ecosystem</span>
          <span>Wallet, escrow, dispatch, AI, and admin structures are API-ready.</span>
        </div>
      </footer>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-soft bg-canvas lg:hidden">
        <div className="grid grid-cols-5">
          {bottomLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-bold ${active ? "text-primary" : "text-muted"}`}>
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
