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

const quickActions = [
  { label: "Shop deals", href: "/naijashop", icon: Store },
  { label: "Send a parcel", href: "/naijasend", icon: Truck },
  { label: "Pay & transfer", href: "/wallet", icon: Banknote },
  { label: "Track an order", href: "/orders", icon: PackageCheck }
];

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
            Lagos, Nigeria
            <span className="text-white/40">·</span>
            <span className="text-white/70">NGN</span>
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            One app for the way Africa moves, shops and pays.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
            NaijaDeals brings verified shopping, delivery, rides, stays, services and a wallet into one account — built
            for the phone in your hand.
          </p>

          <form action="/search" method="get" className="mt-6 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lift">
            <label htmlFor="home-search" className="sr-only">
              Search NaijaDeals
            </label>
            <Search className="ml-2 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
            <input
              id="home-search"
              name="q"
              type="search"
              inputMode="search"
              placeholder="What do you need today?"
              className="min-h-11 w-full min-w-0 bg-transparent px-1 text-sm font-semibold text-ink outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Search"
            >
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="#products"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-[#04140f] transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Explore products
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/sell"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Sell or partner
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        Quick actions
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
  return (
    <section id="products" aria-labelledby="products-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Products</p>
          <h2 id="products-heading" className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">
            Everything in the ecosystem
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Tap a service to use it. Cards marked “Setup required” open an honest status page until the provider or
            operational data needed to run the service is connected.
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-soft bg-canvas px-4 text-sm font-bold text-primary transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          All products
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
  const Icon = vertical.icon;
  const live = vertical.status === "live";

  return (
    <Link
      href={vertical.href}
      aria-label={`${vertical.name}: ${vertical.description} (${vertical.statusLabel})`}
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
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-canvas/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-ink shadow-sm backdrop-blur"
          style={{ boxShadow: `0 0 0 1px ${live ? "#bbf7d0" : "#e5e7eb"} inset` }}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-primary-live" : "bg-amber-500"}`} aria-hidden="true" />
          {vertical.statusLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-base font-extrabold leading-tight sm:text-lg">{vertical.name}</h3>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">{vertical.description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-black text-primary sm:text-sm">
          Open
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function TrustSection() {
  const items = [
    { title: "Escrow-protected", body: "Money is verified server-side and only released when the order or service is confirmed.", icon: ShieldCheck },
    { title: "One wallet", body: "Pay, hold, refund and get paid from a ledger-backed NaijaPay balance.", icon: Banknote },
    { title: "Tracked delivery", body: "Pickup, transit and delivery events are recorded, not invented.", icon: PackageCheck },
    { title: "Verified partners", body: "Sellers, couriers and providers pass onboarding before they can take work.", icon: BadgeCheck }
  ];

  return (
    <section aria-labelledby="trust-heading" className="rounded-3xl border border-border-soft bg-canvas p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="trust-heading" className="font-display text-2xl font-extrabold">
            Built to be trusted, not just to look busy
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every operational claim on NaijaDeals is backed by a server-side record. Nothing is simulated to look live.
          </p>
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
  return (
    <section className="overflow-hidden rounded-3xl bg-night px-5 py-7 text-white sm:px-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-live">Grow with NaijaDeals</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Sell, deliver or host on the same platform.</h2>
          <p className="mt-2 text-sm text-white/70">
            Apply as a seller, courier, driver, host or creator. Applications go through document review in the Control
            Center before an account can trade.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sell"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-night transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start selling
          </Link>
          <Link
            href="/onboarding/vendor"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Partner onboarding
          </Link>
        </div>
      </div>
    </section>
  );
}

export function EcosystemFooterNote() {
  return (
    <p className="flex items-center justify-center gap-2 px-2 text-center text-xs text-muted">
      <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
      Designed mobile-first. This is a responsive web app, not a native mobile application.
    </p>
  );
}
