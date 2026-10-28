"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Menu,
  Search,
  ShoppingBag,
  ShoppingCart,
  UserCircle,
  PackageCheck,
  Store,
  X,
  LogOut
} from "lucide-react";
import { verticals } from "@/lib/data/ecosystem";
import type { SessionUser } from "@/lib/api-client";

const topLinks = [
  { href: "/", label: "Home" },
  { href: "/naijashop", label: "NaijaShop" },
  { href: "/search", label: "Search" },
  { href: "/sell", label: "Sell" }
];

const bottomLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/naijashop", label: "Shop", icon: ShoppingBag },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/orders", label: "Orders", icon: PackageCheck },
  { href: "/account", label: "Account", icon: UserCircle }
];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMenu = () => setMobileMenuOpen(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-white shadow-lift">ND</span>
            <span className="hidden font-display text-xl font-extrabold text-primary sm:inline">NaijaDeals</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
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
          <div className="flex items-center gap-1">
            <Link href="/search" className="rounded-full p-2 text-muted hover:bg-surface-low" aria-label="Search products">
              <Search className="h-5 w-5" />
            </Link>
            <Link href="/cart" className="rounded-full p-2 text-muted hover:bg-surface-low" aria-label="Shopping cart">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            {user ? (
              <div className="flex items-center gap-1">
                <Link
                  href={user.roles.includes("admin") || user.actorType === "ADMIN" ? "/admin" : "/account"}
                  className="hidden items-center gap-2 rounded-full bg-primary-soft px-3 py-2 text-sm font-bold text-primary sm:inline-flex"
                >
                  <UserCircle className="h-4 w-4" />
                  {user.name.split(" ")[0]}
                </Link>
                <button
                  onClick={signOut}
                  className="rounded-full p-2 text-muted hover:bg-surface-low"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <Link href="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
                Sign in
              </Link>
            )}
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
            <Link href="/orders" onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
              Orders
            </Link>
            <Link href="/account" onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
              Account
            </Link>
          </div>
        </div>
      ) : null}

      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r border-border-soft bg-canvas px-4 py-5 lg:block">
        <div className="mb-5 rounded-xl bg-primary-soft p-4">
          {user ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Signed in</p>
              <p className="mt-1 font-bold">{user.name}</p>
              <p className="mt-1 text-xs text-muted">{user.email}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Welcome</p>
              <p className="mt-1 font-bold">Sign in to buy and sell</p>
              <Link href="/login" className="mt-2 inline-block text-xs font-bold text-primary underline">
                Sign in or create an account
              </Link>
            </>
          )}
        </div>
        <nav className="space-y-1" aria-label="Marketplace">
          {verticals.map((vertical) => {
            const Icon = vertical.icon;
            return (
              <Link
                key={vertical.key}
                href={vertical.href}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-muted hover:bg-surface-low hover:text-primary"
              >
                <Icon className="h-5 w-5" />
                <span>{vertical.name}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/sell" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-night px-4 py-3 text-sm font-bold text-white">
          <Store className="h-4 w-4" />
          Sell on NaijaDeals
        </Link>
      </aside>

      <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-6 lg:ml-64 lg:px-8">
        {children}
      </main>

      <footer className="hidden border-t border-border-soft bg-canvas py-8 lg:block lg:ml-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-8 text-sm text-muted">
          <span>NaijaDeals.com</span>
          <span>Prices in NGN kobo · Payments verified server-side · Delivery by NaijaSend</span>
        </div>
      </footer>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-soft bg-canvas lg:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5">
          {bottomLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-bold ${active ? "text-primary" : "text-muted"}`}
              >
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
