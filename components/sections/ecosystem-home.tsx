"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Truck
} from "lucide-react";
import { verticals, type Vertical } from "@/lib/data/ecosystem";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export function EcosystemHome() {
  return (
    <div className="space-y-10 pb-4">
      <Hero />
      <QuickActions />
      <ProductSection />
      <TrustSection />
      <PartnerBand />
      <EcosystemFooterNote />
    </div>
  );
}

function Hero() {
  const { t, city, countryName, storeCurrency } = useLocale();

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#04140f] text-white">
      <img
        src="/generated/hero-ecosystem.svg"
        alt="Illustration of a warm Lagos evening skyline with the NaijaDeals app showing shop, ride, pay and delivery services"
        width={640}
        height={480}
        className="absolute inset-0 h-full w-full object-cover object-[68%_center] opacity-90 lg:left-auto lg:right-0 lg:w-[58%]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#04140f] via-[#04140f]/90 to-[#04140f]/25 lg:via-[#04140f]/75 lg:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#04140f] via-transparent to-transparent" />
      <div className="relative px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-14 lg:px-12 lg:pb-16 lg:pt-20">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
            <MapPin className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" />
            {city}, {countryName}
            <span className="text-white/40">·</span>
            <span className="text-white/70">{storeCurrency}</span>
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {t("home.title")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">{t("home.body")}</p>

          <form action="/search" method="get" className="mt-6 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lift">
            <label htmlFor="home-search" className="sr-only">
              {t("home.searchLabel")}
            </label>
            <Search className="ml-2 h-5 w-5 shrink-0 text-muted rtl:ml-0 rtl:mr-2" aria-hidden="true" />
            <input
              id="home-search"
              name="q"
              type="search"
              inputMode="search"
              placeholder={t("home.searchPlaceholder")}
              className="min-h-11 w-full min-w-0 bg-transparent px-1 text-sm font-semibold text-ink outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={t("home.searchLabel")}
            >
              <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="#products"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-[#04140f] transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("home.explore")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href="/sell"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("home.sellPartner")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActions() {
  const { t } = useLocale();
  const quickActions = [
    { label: t("quick.shop"), href: "/naijashop", icon: Store },
    { label: t("quick.send"), href: "/naijasend", icon: Truck },
    { label: t("quick.pay"), href: "/wallet", icon: Banknote },
    { label: t("quick.track"), href: "/orders", icon: PackageCheck }
  ];

  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        {t("home.quickActions")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex min-h-20 items-center gap-3 rounded-2xl border border-border-soft bg-canvas p-4 transition hover:border-primary/40 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-extrabold leading-tight">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProductSection() {
  const { t } = useLocale();

  return (
    <section id="products" aria-labelledby="products-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{t("home.productsEyebrow")}</p>
          <h2 id="products-heading" className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">
            {t("home.productsTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{t("home.productsBody")}</p>
        </div>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-soft bg-canvas px-4 text-sm font-bold text-primary transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("common.allProducts")}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {verticals.map((vertical) => (
          <ModuleCard key={vertical.key} vertical={vertical} />
        ))}
      </div>
    </section>
  );
}

export function ModuleCard({ vertical }: { vertical: Vertical }) {
  const { t } = useLocale();
  const Icon = vertical.icon;
  const live = vertical.status === "live";
  const description = t(`module.${vertical.key}.desc` as DictionaryKey);
  const statusLabel = t(live ? "status.live" : "status.setup");

  return (
    <Link
      href={vertical.href}
      aria-label={`${vertical.name}: ${description} (${statusLabel})`}
      className="group flex min-h-[15rem] flex-col overflow-hidden rounded-2xl border border-border-soft bg-canvas transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-low">
        <img
          src={vertical.image}
          alt={`Original NaijaDeals artwork for ${vertical.name}`}
          width={640}
          height={480}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <span
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-canvas/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-ink shadow-sm backdrop-blur rtl:left-auto rtl:right-2.5"
          style={{ boxShadow: `0 0 0 1px ${live ? "#bbf7d0" : "#e5e7eb"} inset` }}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-primary-live" : "bg-amber-500"}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-base font-extrabold leading-tight sm:text-lg">{vertical.name}</h3>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">{description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-black text-primary sm:text-sm">
          {t("common.open")}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function TrustSection() {
  const { t } = useLocale();
  const items = [
    { title: t("trust.escrow"), body: t("trust.escrowBody"), icon: ShieldCheck },
    { title: t("trust.wallet"), body: t("trust.walletBody"), icon: Banknote },
    { title: t("trust.delivery"), body: t("trust.deliveryBody"), icon: PackageCheck },
    { title: t("trust.partners"), body: t("trust.partnersBody"), icon: BadgeCheck }
  ];

  return (
    <section aria-labelledby="trust-heading" className="rounded-3xl border border-border-soft bg-canvas p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="trust-heading" className="font-display text-2xl font-extrabold">
            {t("home.trustTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("home.trustBody")}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-2xl bg-surface-low p-4">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-2 text-sm font-extrabold">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PartnerBand() {
  const { t } = useLocale();

  return (
    <section className="overflow-hidden rounded-3xl bg-night px-5 py-7 text-white sm:px-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-live">{t("home.partnerEyebrow")}</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{t("home.partnerTitle")}</h2>
          <p className="mt-2 text-sm text-white/70">{t("home.partnerBody")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sell"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-night transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("home.startSelling")}
          </Link>
          <Link
            href="/onboarding/vendor"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t("home.partnerOnboarding")}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function EcosystemFooterNote() {
  const { t } = useLocale();

  return (
    <p className="flex items-center justify-center gap-2 px-2 text-center text-xs text-muted">
      <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("home.mobileNote")}
    </p>
  );
}
