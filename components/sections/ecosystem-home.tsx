"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Car,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet
} from "lucide-react";
import { verticals, type Vertical } from "@/lib/data/ecosystem";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * NaijaDeals homepage.
 *
 * Visual direction follows the Stitch inventory: deep commerce green, large
 * editorial type (Plus Jakarta), one location-first action, module imagery and
 * honest live/setup states. No invented metrics: every status is derived from
 * the vertical catalogue.
 */
export function EcosystemHome() {
  return (
    <div className="space-y-6 pb-6 sm:space-y-8">
      <Hero />
      <EcosystemPulse />
      <ServiceBento />
      <WalletBand />
      <TrustSection />
      <PartnerBand />
      <EcosystemFooterNote />
    </div>
  );
}

function Hero() {
  const { t, city, countryName, storeCurrency } = useLocale();
  const liveCount = verticals.filter((vertical) => vertical.status === "live").length;

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-[#04140f] text-white shadow-[0_30px_80px_-40px_rgba(4,20,15,0.9)]">
      <img
        src="/real-photography/hero-ecosystem.jpg"
        alt="A warm Lagos evening with NaijaDeals delivering food, rides and payments"
        width={1600}
        height={1200}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[62%_center] opacity-95"
      />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(4,20,15,0.97)_0%,rgba(4,20,15,0.92)_38%,rgba(4,20,15,0.45)_66%,rgba(4,20,15,0.15)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,20,15,0.55)_0%,transparent_35%,rgba(4,20,15,0.85)_100%)]" />

      <div className="relative flex min-h-[560px] flex-col justify-end px-5 pb-6 pt-10 sm:px-8 lg:min-h-[620px] lg:px-12 lg:pb-10 lg:pt-14">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur">
              <MapPin className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" />
              {city}, {countryName}
            </span>
            <span className="rounded-full border border-white/15 px-3 py-1.5">{storeCurrency}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-live/40 bg-primary-live/15 px-3 py-1.5 text-primary-live">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-live" aria-hidden="true" />
              {liveCount} live
            </span>
          </div>

          <h1 className="mt-5 font-display text-[2.15rem] font-extrabold leading-[1.03] tracking-[-0.02em] sm:text-5xl lg:text-[4.1rem]">
            {t("home.title")}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base lg:text-lg">{t("home.body")}</p>

          <form
            action="/search"
            method="get"
            className="mt-7 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/95 p-1.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
          >
            <label htmlFor="home-search" className="sr-only">
              {t("home.searchLabel")}
            </label>
            <Search className="ml-2.5 h-5 w-5 shrink-0 text-muted rtl:ml-0 rtl:mr-2.5" aria-hidden="true" />
            <input
              id="home-search"
              name="q"
              type="search"
              inputMode="search"
              placeholder={t("home.searchPlaceholder")}
              className="min-h-12 w-full min-w-0 bg-transparent px-1 text-sm font-semibold text-ink outline-none placeholder:text-muted/70 sm:text-base"
            />
            <button
              type="submit"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-white transition hover:bg-[#005c30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("home.searchLabel")}
            >
              <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <QuickChip href="/naijashop" icon={ShoppingBag} label={verticals[0].name} />
            <QuickChip href="/naijadrive" icon={Car} label={verticals.find((v) => v.key === "drive")!.name} />
            <QuickChip href="/wallet" icon={Wallet} label={verticals.find((v) => v.key === "wallet")!.name} />
            <Link
              href="#products"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-[#04140f] transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("home.explore")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-4 text-[11px] font-bold text-white/70 sm:text-xs">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-live" aria-hidden="true" />
            {t("trust.escrow")}
          </span>
          <span className="inline-flex items-center gap-2">
            <PackageCheck className="h-4 w-4 shrink-0 text-primary-live" aria-hidden="true" />
            {t("trust.delivery")}
          </span>
          <span className="inline-flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary-live" aria-hidden="true" />
            {t("trust.partners")}
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickChip({ href, icon: Icon, label }: { href: string; icon: typeof Store; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 text-sm font-bold text-white backdrop-blur transition hover:border-white/40 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function EcosystemPulse() {
  const { t } = useLocale();
  const live = verticals.filter((vertical) => vertical.status === "live").length;
  const setup = verticals.length - live;

  return (
    <section aria-label={t("home.quickActions")} className="rounded-2xl border border-border-soft bg-canvas px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 text-xs font-bold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-live" aria-hidden="true" />
            {live} {t("status.live")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-strong" aria-hidden="true" />
            {setup} {t("status.setup")}
          </span>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0" role="list" aria-label={t("home.quickActions")}>
          {verticals.map((vertical) => (
            <Link
              key={vertical.key}
              role="listitem"
              href={vertical.href}
              className="whitespace-nowrap rounded-full border border-border-soft px-3 py-1.5 text-[11px] font-bold text-ink transition hover:border-primary/40 hover:text-primary"
            >
              {vertical.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ServiceBento() {
  const { t } = useLocale();
  const features = ["shop", "drive"];
  const featured = verticals.filter((vertical) => features.includes(vertical.key));
  const rest = verticals.filter((vertical) => !features.includes(vertical.key));

  return (
    <section id="products" aria-labelledby="products-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{t("home.productsEyebrow")}</p>
          <h2 id="products-heading" className="mt-1.5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t("home.productsTitle")}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">{t("home.productsBody")}</p>
        </div>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-soft bg-canvas px-4 text-sm font-bold text-primary transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("common.allProducts")}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {featured.map((vertical) => (
          <FeatureCard key={vertical.key} vertical={vertical} />
        ))}
        {rest.map((vertical) => (
          <CompactCard key={vertical.key} vertical={vertical} />
        ))}
      </div>
    </section>
  );
}

function StatusPill({ vertical, onImage = false }: { vertical: Vertical; onImage?: boolean }) {
  const { t } = useLocale();
  const live = vertical.status === "live";
  const label = t(live ? "status.live" : "status.setup");

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
        onImage ? "bg-[#04140f]/80 text-white backdrop-blur" : "border border-border-soft bg-canvas text-ink"
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-primary-live" : onImage ? "bg-amber" : "bg-amber-strong"}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function FeatureCard({ vertical }: { vertical: Vertical }) {
  const { t } = useLocale();
  const Icon = vertical.icon;
  const description = t(`module.${vertical.key}.desc` as DictionaryKey);

  return (
    <Link
      href={vertical.href}
      aria-label={`${vertical.name}: ${description}`}
      className="group relative col-span-2 min-h-[15rem] overflow-hidden rounded-[22px] bg-night text-white shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-[17rem]"
    >
      <img
        src={vertical.image}
        alt=""
        width={900}
        height={600}
        className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-90"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,20,15,0.15)_0%,rgba(4,20,15,0.55)_55%,rgba(4,20,15,0.95)_100%)]" />
      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <StatusPill vertical={vertical} onImage />
        </div>
        <div>
          <h3 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">{vertical.name}</h3>
          <p className="mt-1.5 line-clamp-2 max-w-md text-xs leading-relaxed text-white/75 sm:text-sm">{description}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-primary-live sm:text-sm">
            {t("common.open")}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CompactCard({ vertical }: { vertical: Vertical }) {
  const { t } = useLocale();
  const Icon = vertical.icon;
  const description = t(`module.${vertical.key}.desc` as DictionaryKey);

  return (
    <Link
      href={vertical.href}
      aria-label={`${vertical.name}: ${description}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-canvas transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-low">
        <img
          src={vertical.image}
          alt=""
          width={640}
          height={400}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-2 top-2">
          <StatusPill vertical={vertical} onImage />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-sm font-extrabold leading-tight sm:text-base">{vertical.name}</h3>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted sm:text-xs">{description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-2.5 text-[11px] font-black text-primary sm:text-xs">
          {t("common.open")}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function WalletBand() {
  const { t } = useLocale();
  const wallet = verticals.find((vertical) => vertical.key === "wallet");
  const drive = verticals.find((vertical) => vertical.key === "drive");

  return (
    <section className="overflow-hidden rounded-[28px] bg-[#0b1a13] text-white">
      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-live">{wallet?.name ?? "NaijaPay"}</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t("trust.wallet")}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">{t("trust.walletBody")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[t("trust.escrow"), t("trust.delivery"), t("trust.partners")].map((label) => (
              <span key={label} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/80">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={wallet?.href ?? "/wallet"}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-[#0b1a13] transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {wallet?.name ?? "NaijaPay"}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href={drive?.href ?? "/naijadrive"}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {drive?.name ?? "NaijaDrive"}
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
          <div className="absolute -inset-4 rounded-[28px] bg-primary-live/10 blur-2xl" />
          <div className="relative rotate-[-3deg] rounded-2xl border border-white/15 bg-[linear-gradient(135deg,#0f5132_0%,#0a2e1f_60%,#04140f_100%)] p-5 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-extrabold tracking-tight">NaijaPay</span>
              <Wallet className="h-5 w-5 text-primary-live" />
            </div>
            <div className="mt-6 space-y-2">
              <div className="h-2 w-24 rounded-full bg-white/25" />
              <div className="h-2 w-16 rounded-full bg-white/15" />
            </div>
            <div className="mt-8 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              <span>{t("trust.escrow")}</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary-live" />
                NGN
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
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
    <section aria-labelledby="trust-heading">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="trust-heading" className="font-display text-2xl font-extrabold tracking-tight">
            {t("home.trustTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("home.trustBody")}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-2xl border border-border-soft bg-canvas p-4 transition hover:border-primary/30 hover:shadow-soft">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-2.5 text-sm font-extrabold">{item.title}</h3>
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
    <section className="relative overflow-hidden rounded-[28px] bg-night px-5 py-8 text-white sm:px-8">
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-live">{t("home.partnerEyebrow")}</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t("home.partnerTitle")}</h2>
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

/** Shared module card kept for the products grid. */
export function ModuleCard({ vertical }: { vertical: Vertical }) {
  return <CompactCard vertical={vertical} />;
}
