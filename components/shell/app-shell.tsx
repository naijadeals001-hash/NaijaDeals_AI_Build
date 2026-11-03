"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  LayoutGrid,
  Menu,
  Search,
  ShoppingCart,
  UserCircle,
  PackageCheck,
  Store,
  X,
  LogOut
} from "lucide-react";
import { verticals } from "@/lib/data/ecosystem";
import { useLocale } from "@/lib/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import type { SessionUser } from "@/lib/api-client";

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);
  const { t } = useLocale();

  // Skip AppShell for admin routes - they use AdminShell
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/super-admin")) {
    return <>{children}</>;
  }

  // The storefront and NaijaEats landing use the full-bleed layout; the ecosystem
  // sidebar starts on the remaining inner routes.
  const isHome = pathname === "/" || pathname === "/naijaeats";

  const topLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/products", label: t("nav.products") },
    { href: "/naijashop", label: t("nav.shop") },
    { href: "/sell", label: t("nav.sell") }
  ];

  const bottomLinks = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/products", label: t("nav.products"), icon: LayoutGrid },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingCart },
    { href: "/orders", label: t("nav.orders"), icon: PackageCheck },
    { href: "/account", label: t("nav.account"), icon: UserCircle }
  ];

  const closeMenu = () => setMobileMenuOpen(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white rtl:focus:left-auto rtl:focus:right-4"
      >
        {t("common.skip")}
      </a>
      <header className="sticky top-0 z-40 border-b border-border-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-black text-white shadow-lift">ND</span>
            <span className="hidden font-display text-xl font-extrabold text-primary sm:inline">NaijaDeals</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {topLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isActive(link.href) ? "bg-primary-soft text-primary shadow-sm" : "text-ink/70 hover:bg-surface-low hover:text-ink"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <LocaleSwitcher />
            <Link
              href="/search"
              className="hidden items-center gap-2 rounded-full border border-border-soft px-3 py-2 text-xs font-bold text-muted transition hover:border-primary/40 hover:text-primary xl:inline-flex"
              aria-label={t("nav.search")}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t("nav.search")}
            </Link>
            <Link href="/search" className="rounded-full p-2 text-muted hover:bg-surface-low xl:hidden" aria-label={t("nav.search")}>
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link href="/cart" className="rounded-full p-2 text-muted hover:bg-surface-low" aria-label={t("nav.cart")}>
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
                  aria-label={t("common.signOut")}
                  title={t("common.signOut")}
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <Link href="/login" className="rounded-full bg-primary px-3 py-2 text-sm font-bold text-white sm:px-4">
                {t("common.signIn")}
              </Link>
            )}
            <button
              className="rounded-full p-2 text-muted hover:bg-surface-low lg:hidden"
              aria-label={t("common.menu")}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {isHome ? (
        <nav aria-label="Ecosystem" className="border-b border-border-soft bg-canvas">
          <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-3 py-2 sm:px-5 lg:px-8">
            {verticals.map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Link
                  key={vertical.key}
                  href={vertical.href}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-surface-low hover:text-primary"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {vertical.name}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {mobileMenuOpen ? (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-border-soft bg-canvas p-4 shadow-soft lg:hidden">
          <div className="grid gap-2 sm:grid-cols-2">
            {topLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
                {link.label}
              </Link>
            ))}
            <Link href="/orders" onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
              {t("nav.orders")}
            </Link>
            <Link href="/account" onClick={closeMenu} className="rounded-xl bg-surface-low px-4 py-3 text-sm font-bold">
              {t("nav.account")}
            </Link>
          </div>
        </div>
      ) : null}

      {!isHome ? (
      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r border-border-soft bg-canvas px-4 py-5 rtl:left-auto rtl:right-0 rtl:border-l rtl:border-r-0 lg:block">
        <div className="mb-5 rounded-xl bg-primary-soft p-4">
          {user ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{t("common.signedIn")}</p>
              <p className="mt-1 font-bold">{user.name}</p>
              <p className="mt-1 text-xs text-muted">{user.email}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{t("common.welcome")}</p>
              <p className="mt-1 font-bold">{t("common.signInPrompt")}</p>
              <Link href="/login" className="mt-2 inline-flex min-h-9 items-center text-xs font-bold text-primary underline">
                {t("common.signInLink")}
              </Link>
            </>
          )}
        </div>
        <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">Ecosystem</p>
        <nav className="space-y-1" aria-label="Marketplace">
          <Link
            href="/products"
            className="flex items-center gap-3 rounded-xl bg-primary-soft px-3 py-2.5 text-sm font-extrabold text-primary transition hover:bg-primary-soft/80"
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            <span>{t("common.allProducts")}</span>
          </Link>
          {verticals
            .filter((v) => v.key !== "shop")
            .map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Link
                  key={vertical.key}
                  href={vertical.href}
                  aria-current={isActive(vertical.href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-semibold transition ${
                    isActive(vertical.href)
                      ? "border-primary bg-surface-low text-primary"
                      : "border-transparent text-muted hover:bg-surface-low hover:text-primary"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{vertical.name}</span>
                  <span
                    className={`ml-auto h-1.5 w-1.5 rounded-full ${vertical.status === "live" ? "bg-primary-live" : "bg-[#B45309]"}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{vertical.status === "live" ? t("status.live") : t("status.setup")}</span>
                </Link>
              );
            })}
        </nav>
        <p className="mt-5 px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{t("nav.account")}</p>
        <nav className="space-y-1" aria-label="Account">
          <Link href="/orders" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface-low hover:text-primary">
            <PackageCheck className="h-5 w-5" aria-hidden="true" />
            {t("nav.orders")}
          </Link>
          <Link href="/wallet" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface-low hover:text-primary">
            <UserCircle className="h-5 w-5" aria-hidden="true" />
            NaijaPay
          </Link>
        </nav>
        <Link href="/sell" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-night px-4 py-3 text-sm font-bold text-white transition hover:bg-night/90">
          <Store className="h-4 w-4" />
          {t("common.sellOn")}
        </Link>
        {user && (user.roles.includes("driver") || user.actorType === "DRIVER") ? (
          <Link
            href="/driver"
            className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border-soft px-4 py-3 text-sm font-bold text-primary"
          >
            Driver board
          </Link>
        ) : null}
        {user && (user.roles.includes("courier") || user.actorType === "COURIER") ? (
          <Link
            href="/courier"
            className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border-soft px-4 py-3 text-sm font-bold text-primary"
          >
            Courier dashboard
          </Link>
        ) : null}
      </aside>
      ) : null}

      <main
        id="main-content"
        className={
          isHome
            ? "mx-auto max-w-[1440px] px-3 pb-20 pt-4 sm:px-5 lg:px-8"
            : "mx-auto max-w-7xl px-4 pb-28 pt-6 lg:ml-64 lg:px-8 lg:rtl:ml-0 lg:rtl:mr-64"
        }
      >
        {children}
      </main>

      <footer className={`hidden border-t border-border-soft bg-canvas py-8 lg:block ${isHome ? "" : "lg:ml-64 lg:rtl:ml-0 lg:rtl:mr-64"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-8 text-sm text-muted">
          <span>NaijaDeals.com</span>
          <span>{t("common.footer", { currency: "NGN" })}</span>
        </div>
      </footer>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-soft bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5">
          {bottomLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-bold ${active ? "text-primary" : "text-muted"}`}
              >
                <span className={`grid h-7 w-10 place-items-center rounded-full ${active ? "bg-primary-soft" : ""}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
