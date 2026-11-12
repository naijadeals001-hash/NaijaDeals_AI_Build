"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Search,
  ShoppingCart,
  Store,
  UserCircle,
  Wallet,
  X
} from "lucide-react";
import { NaijaDealsLogo } from "@/components/brand/naijadeals-logo";
import { publicServices } from "@/lib/data/public-services";
import { useLocale } from "@/lib/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import type { SessionUser } from "@/lib/api-client";

const HEADER_LINKS = [
  { href: "/affiliate", label: "Earn" },
  { href: "/business/shop", label: "Business" },
  { href: "/help", label: "Help" }
] as const;

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Admin routes and the full-bleed vertical apps own their own chrome.
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/super-admin")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/aura-ai")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijastream")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijashop")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijaeats")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijastay")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijagigs")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijasend")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijafresh")) {
    return <>{children}</>;
  }
  if (pathname?.startsWith("/naijadrive") || pathname?.startsWith("/driver")) {
    return <>{children}</>;
  }

  const isHome = pathname === "/";
  const closeMenu = () => setMobileMenuOpen(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white rtl:focus:left-auto rtl:focus:right-4"
      >
        {t("common.skip")}
      </a>

      <header className="sticky top-0 z-50 border-b border-border-soft/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="NaijaDeals home"
            className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <NaijaDealsLogo tone="onLight" size="md" />
          </Link>

          <ServicesMenu isActive={isActive} />

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Company and partner links">
            {HEADER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-full px-3 py-2 text-[13px] font-semibold transition hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isActive(link.href) ? "text-primary" : "text-ink/70 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <LocaleSwitcher />

            <form action="/search" method="get" role="search" className="hidden xl:flex">
              <label htmlFor="shell-search" className="sr-only">
                Search products
              </label>
              <span className="relative flex h-10 w-[220px] items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />
                <input
                  id="shell-search"
                  name="q"
                  type="search"
                  placeholder="Search products"
                  className="h-10 w-full rounded-full border border-transparent bg-surface-low pl-9 pr-3 text-[13px] font-medium text-ink outline-none transition placeholder:text-muted/75 focus:border-primary/40 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </span>
            </form>

            <Link
              href="/search"
              aria-label="Search products"
              className="grid h-10 w-10 place-items-center rounded-full text-ink/70 transition hover:bg-surface-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary xl:hidden"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>

            <Link
              href="/orders"
              aria-label="Activity and orders"
              className="hidden h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-ink/70 transition hover:bg-surface-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex"
            >
              <Activity className="h-5 w-5" aria-hidden="true" />
              <span className="hidden xl:inline">Activity</span>
            </Link>

            <Link
              href="/cart"
              aria-label={t("nav.cart")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-ink/70 transition hover:bg-surface-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              <span className="hidden xl:inline">{t("nav.cart")}</span>
            </Link>

            {user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link
                  href={user.roles.includes("admin") || user.actorType === "ADMIN" ? "/admin" : "/account"}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-primary-soft px-3 text-[13px] font-bold text-primary transition hover:bg-primary-soft/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <UserCircle className="h-4 w-4" aria-hidden="true" />
                  <span className="max-w-[9rem] truncate">{user.name.split(" ")[0]}</span>
                </Link>
                <button
                  onClick={signOut}
                  className="grid h-10 w-10 place-items-center rounded-full text-ink/60 transition hover:bg-surface-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={t("common.signOut")}
                  title={t("common.signOut")}
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden min-h-10 items-center rounded-full bg-primary px-4 text-[13px] font-extrabold text-white transition hover:bg-[#005c30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex"
              >
                {t("common.signIn")}
              </Link>
            )}

            <button
              className="grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
              aria-label={mobileMenuOpen ? t("common.close") : t("common.menu")}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-y-auto overscroll-contain border-t border-border-soft bg-white px-4 pb-28 pt-5 lg:hidden"
        >
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted">Services</p>
              <Link href="/products" onClick={closeMenu} className="text-[12px] font-extrabold text-primary">
                All services
              </Link>
            </div>
            <nav aria-label="Services" className="mt-3 grid grid-cols-2 gap-2">
              {publicServices.map((service) => {
                const Icon = service.icon;
                return (
                  <Link
                    key={service.key}
                    href={service.href}
                    onClick={closeMenu}
                    className="flex min-h-[4.25rem] items-center gap-2.5 rounded-xl border border-border-soft bg-white px-3 py-2 text-[13px] font-bold transition hover:border-primary/35 hover:bg-primary-soft/40"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {service.label}
                  </Link>
                );
              })}
            </nav>

            <p className="mt-6 text-[11px] font-black uppercase tracking-[0.18em] text-muted">More</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { href: "/sell", label: t("nav.sell") },
                { href: "/orders", label: "Activity" },
                { href: "/wallet", label: "Wallet" },
                { href: "/account", label: t("nav.account") },
                ...HEADER_LINKS.filter((link) => link.href !== "/affiliate")
              ].map((link) => (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  onClick={closeMenu}
                  className="rounded-xl bg-surface-low px-3 py-3 text-[13px] font-bold text-ink"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="mt-5 border-t border-border-soft pt-4">
              {user ? (
                <button
                  onClick={() => {
                    closeMenu();
                    void signOut();
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-soft px-4 text-sm font-bold text-ink"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t("common.signOut")}
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white"
                >
                  {t("common.signIn")}
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!isHome ? (
        <aside className="fixed left-0 top-[72px] z-30 hidden h-[calc(100vh-4.5rem)] w-64 overflow-y-auto border-r border-border-soft bg-white px-4 py-5 rtl:left-auto rtl:right-0 rtl:border-l rtl:border-r-0 lg:block">
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
          <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">Services</p>
          <nav className="space-y-1" aria-label="Marketplace">
            <Link
              href="/products"
              className="flex items-center gap-3 rounded-xl bg-primary-soft px-3 py-2.5 text-sm font-extrabold text-primary transition hover:bg-primary-soft/80"
            >
              <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              <span>{t("common.allProducts")}</span>
            </Link>
            {publicServices.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.key}
                  href={service.href}
                  aria-current={isActive(service.href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-semibold transition ${
                    isActive(service.href)
                      ? "border-primary bg-surface-low text-primary"
                      : "border-transparent text-muted hover:bg-surface-low hover:text-primary"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{service.label}</span>
                  <span
                    className={`ml-auto h-1.5 w-1.5 rounded-full ${service.status === "live" ? "bg-primary-live" : "bg-[#B45309]"}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{service.status === "live" ? t("status.live") : t("status.setup")}</span>
                </Link>
              );
            })}
          </nav>
          <p className="mt-5 px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{t("nav.account")}</p>
          <nav className="space-y-1" aria-label="Account">
            <Link href="/orders" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface-low hover:text-primary">
              <Activity className="h-5 w-5" aria-hidden="true" />
              Activity
            </Link>
            <Link href="/wallet" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface-low hover:text-primary">
              <Wallet className="h-5 w-5" aria-hidden="true" />
              Wallet
            </Link>
          </nav>
          <Link href="/sell" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-night px-4 py-3 text-sm font-bold text-white transition hover:bg-night/90">
            <Store className="h-4 w-4" aria-hidden="true" />
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
        className={isHome ? "" : "mx-auto max-w-7xl px-4 pb-28 pt-6 lg:ml-64 lg:px-8 lg:rtl:ml-0 lg:rtl:mr-64"}
      >
        {children}
      </main>

      <SiteFooter offsetForSidebar={!isHome} />

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-soft bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile">
        <div className="grid grid-cols-4">
          {[
            { href: "/", label: t("nav.home"), icon: Home },
            { href: "/orders", label: "Activity", icon: Activity },
            { href: "/wallet", label: "Wallet", icon: Wallet },
            { href: "/account", label: t("nav.account"), icon: UserCircle }
          ].map((link) => {
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

function ServicesMenu({ isActive }: { isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="services-menu"
        className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          open ? "bg-surface-low text-ink" : "text-ink/70 hover:text-ink"
        }`}
      >
        Services
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id="services-menu"
          className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-[34rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border-soft bg-white p-3 shadow-[0_28px_60px_-25px_rgba(4,20,15,0.35)]"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">NaijaDeals services</p>
            <Link href="/products" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-[11px] font-extrabold text-primary">
              All services
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <nav aria-label="Services" className="grid grid-cols-2 gap-1">
            {publicServices.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.key}
                  href={service.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(service.href) ? "page" : undefined}
                  className={`group flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    isActive(service.href) ? "bg-primary-soft/50" : ""
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
                      {service.label}
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${service.status === "live" ? "bg-primary-live" : "bg-[#B45309]"}`}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-[10.5px] leading-snug text-muted">{service.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface-low px-3 py-2.5">
            <p className="text-[11px] font-semibold text-muted">Sell, serve or refer from one account.</p>
            <Link href="/affiliate" onClick={() => setOpen(false)} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-primary">
              Earn
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SiteFooter({ offsetForSidebar }: { offsetForSidebar: boolean }) {
  const { countryName, city } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className={`bg-[#0b1a13] text-white ${offsetForSidebar ? "lg:ml-64 lg:rtl:ml-0 lg:rtl:mr-64" : ""}`}>
      <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-12 sm:px-6 lg:px-8 lg:pb-10 lg:pt-16">
        <div className="grid gap-9 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.2fr_0.8fr_0.8fr]">
          <div>
            <Link href="/" aria-label="NaijaDeals home" className="inline-flex rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-live">
              <NaijaDealsLogo tone="onDark" size="lg" />
            </Link>
            <p className="mt-3 max-w-[18rem] text-[12px] leading-relaxed text-white/65">
              One account for everyday life — move, eat, shop, send, stay and pay.
            </p>
            <p className="mt-4 text-[11px] font-semibold text-white/50">Abuja, FCT · EziAlayi, Abia State, Nigeria</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-live" aria-hidden="true" />
              {city ? `${city}, ${countryName}` : `Choose location · ${countryName}`}
            </p>
          </div>

          <nav aria-label="Footer services">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-live">Services</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {publicServices.map((service) => (
                <li key={service.key}>
                  <Link href={service.href} className="text-[12px] text-white/75 transition hover:text-white hover:underline">
                    {service.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer company">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-live">Company</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/sell", label: "Sell on NaijaDeals" },
                { href: "/business/shop", label: "Business" },
                { href: "/affiliate", label: "Affiliate programme" },
                { href: "/install", label: "Install the web app" }
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[12px] text-white/75 transition hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer support">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-live">Support</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/help", label: "Help" },
                { href: "/orders", label: "Activity" },
                { href: "/wallet", label: "Wallet" },
                { href: "/account", label: "Account" }
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[12px] text-white/75 transition hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-[11px] text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} NaijaDeals. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/help" className="transition hover:text-white hover:underline">
              Support
            </Link>
            <Link href="/safety" className="transition hover:text-white hover:underline">
              Safety
            </Link>
            <Link href="/payments" className="transition hover:text-white hover:underline">
              Payments
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
