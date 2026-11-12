import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  Building2,
  Car,
  Check,
  ChevronDown,
  Leaf,
  LayoutGrid,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wrench
} from "lucide-react";
import { DRIVE_PLACES } from "@/lib/config/drive";
import { publicServices, type PublicService } from "@/lib/data/public-services";

export type HomeProduct = {
  id: string;
  name: string;
  slug: string;
  price: string;
  image: string | null;
};

type EcosystemHome2026Props = {
  products?: HomeProduct[];
};

/**
 * Ecosystem homepage, 2026-11 revision.
 *
 * Direction: Uber/Bolt-inspired clarity — a light working surface, one bold
 * mobility-led action, restrained green, generous spacing and a plain service
 * directory that reaches every vertical. African imagery comes from the
 * project's approved generated/brand photography only; service tiles use
 * interface icons rather than unrelated stock photos.
 */
export function EcosystemHome2026({ products = [] }: EcosystemHome2026Props) {
  return (
    <div className="bg-white text-ink">
      <Hero />
      <ServiceDirectory />
      <ProducerSection />
      {products.length ? <AvailableNow products={products} /> : null}
      <PartnerSection />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#f6f6f2]">
      <div
        className="pointer-events-none absolute -right-32 -top-40 h-[26rem] w-[26rem] rounded-full bg-primary/[0.06] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-14 lg:py-20">
        <div className="max-w-[36rem]">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/70 sm:text-[11px] sm:tracking-[0.16em]">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-live" aria-hidden="true" />
            One account, every day
          </p>
          <h1 className="mt-5 font-display text-[2.45rem] font-extrabold leading-[0.96] tracking-[-0.055em] text-ink min-[360px]:text-[2.7rem] sm:text-[3.7rem] lg:text-[4.35rem]">
            Your whole day,
            <br />
            <span className="text-primary">one app.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base">
            Book a ride, order food, shop verified sellers, send a parcel or find a place to stay — from one
            NaijaDeals account.
          </p>

          <RideQuickStart />

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-bold">
            <a href="#services" className="inline-flex min-h-10 items-center gap-1.5 text-ink underline decoration-border-soft underline-offset-4 transition hover:text-primary">
              Explore all services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link href="/affiliate" className="inline-flex min-h-10 items-center gap-1.5 text-primary transition hover:text-primary/80">
              Earn with NaijaDeals
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-muted">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Escrow-protected payments
            </li>
            <li className="inline-flex items-center gap-1.5">
              <PackageCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Tracked delivery
            </li>
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Verified partners
            </li>
          </ul>
        </div>

        <div className="relative lg:pl-2">
          <div className="absolute -inset-3 rounded-[32px] bg-primary/[0.07] blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[28px] bg-surface-low shadow-[0_30px_70px_-40px_rgba(4,20,15,0.55)]">
            <img
              src="/generated/home/home-hero-mobility.webp"
              alt="Brand illustration of two couriers riding through a Nigerian city street"
              width={1024}
              height={1024}
              fetchPriority="high"
              className="aspect-[4/3] w-full object-cover object-center sm:aspect-[16/11] lg:aspect-[4/5]"
            />
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur sm:right-auto sm:max-w-[18rem]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Car className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-live" aria-hidden="true" />
                  Rides live in Lagos
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  Verified drivers. Fares shown before you confirm.
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RideQuickStart() {
  return (
    <form
      action="/naijadrive"
      method="get"
      className="mt-7 max-w-[32rem] rounded-2xl border border-border-soft bg-white p-4 shadow-[0_18px_45px_-30px_rgba(4,20,15,0.35)] sm:p-5"
      aria-labelledby="ride-quick-start-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="ride-quick-start-heading" className="font-display text-[1.05rem] font-extrabold tracking-tight">
          Where are you going?
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          Lagos
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-muted">Pick-up</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/10" aria-hidden="true" />
            <select
              name="pickup"
              defaultValue="computer-village"
              className="h-12 w-full appearance-none rounded-xl border border-border-soft bg-surface-low pl-8 pr-8 text-[13px] font-semibold text-ink outline-none transition focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {DRIVE_PLACES.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-muted">Destination</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-ink ring-4 ring-ink/10" aria-hidden="true" />
            <select
              name="dropoff"
              defaultValue="victoria-island"
              className="h-12 w-full appearance-none rounded-xl border border-border-soft bg-surface-low pl-8 pr-8 text-[13px] font-semibold text-ink outline-none transition focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {DRIVE_PLACES.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          </span>
        </label>
      </div>

      <button
        type="submit"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-white transition hover:bg-[#005c30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Find a ride
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
        Fares are shown before you confirm. Ride dispatch is live in Lagos.
      </p>
    </form>
  );
}

function ServiceDirectory() {
  return (
    <section id="services" aria-labelledby="services-heading" className="scroll-mt-24 border-t border-border-soft/60 bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Services</p>
            <h2
              id="services-heading"
              className="mt-3 font-display text-[2rem] font-extrabold leading-[1.02] tracking-[-0.045em] sm:text-[2.6rem]"
            >
              One app. {publicServices.length} ways to use it.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-[15px]">
              From a ride across town to groceries at your door — every service uses the same NaijaDeals account.
            </p>
          </div>
          <Link
            href="/products"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-full border border-border-soft px-4 text-sm font-extrabold text-ink transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-auto"
          >
            All services
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-9 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {publicServices.map((service) => (
            <li key={service.key} className="min-w-0">
              <ServiceCard service={service} />
            </li>
          ))}
          <li className="min-w-0">
            <Link
              href="/products"
              className="group flex h-full min-h-[9.75rem] flex-col rounded-2xl border border-primary/20 bg-primary-soft/55 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-primary shadow-sm">
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="mt-3.5 block font-display text-[1.05rem] font-extrabold tracking-[-0.02em]">All services</span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-ink/70">Browse the full NaijaDeals directory.</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-black text-primary">
                View directory
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        </ul>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          A green dot means the service is live in this build. Availability can still vary by city and provider.
        </p>
      </div>
    </section>
  );
}

function ServiceCard({ service }: { service: PublicService }) {
  const Icon = service.icon;
  const live = service.status === "live";

  return (
    <Link
      href={service.href}
      data-service={service.key}
      className="group flex h-full min-h-[9.75rem] flex-col rounded-2xl border border-border-soft bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_34px_-24px_rgba(4,20,15,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${live ? "bg-primary-live" : "bg-amber"}`} aria-hidden="true" />
        <span className="sr-only">{live ? "Live" : "Setup required"}</span>
      </span>
      <span className="mt-3.5 block font-display text-[1.05rem] font-extrabold tracking-[-0.02em]">{service.label}</span>
      <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">{service.description}</span>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-black text-primary">
        Open
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ProducerSection() {
  return (
    <section aria-labelledby="producer-heading" className="bg-[#f2f5ef]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-14 lg:py-24">
        <div className="relative overflow-hidden rounded-[28px] bg-surface-low">
          <img
            src="/brand-photography/fresh-market-groceries.jpg"
            alt="Brand illustration of a market vendor arranging fresh produce in Lagos"
            width={1280}
            height={1581}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover object-center"
          />
        </div>

        <div className="max-w-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">From farm and market</p>
          <h2
            id="producer-heading"
            className="mt-3 font-display text-[2rem] font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-[2.6rem]"
          >
            Closer to the people who grow and make.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">
            NaijaFresh connects customers with produce from supported markets and vendors. If you grow, cook, make or
            sell, NaijaDeals gives your business a direct route to customers.
          </p>

          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Produce and staples from supported vendors",
              "Prices and availability shown before you order",
              "A direct route to customers for producers and sellers"
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="text-ink/80">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/naijafresh"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-white transition hover:bg-[#005c30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Shop fresh
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/sell"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-soft bg-white px-5 text-sm font-extrabold text-ink transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Start selling
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function AvailableNow({ products }: { products: HomeProduct[] }) {
  return (
    <section aria-labelledby="available-heading" className="bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Available now</p>
            <h2
              id="available-heading"
              className="mt-3 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.04em] sm:text-[2.4rem]"
            >
              In stock from NaijaDeals sellers.
            </h2>
          </div>
          <Link
            href="/naijashop"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start text-sm font-extrabold text-primary transition hover:text-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-auto"
          >
            Shop all
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id} className="min-w-0">
              <Link
                href={`/product/${product.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-24px_rgba(4,20,15,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="relative block aspect-square w-full bg-surface-low">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted">
                      <ShoppingBag className="h-8 w-8" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col p-3.5">
                  <span className="line-clamp-2 text-[12.5px] font-bold leading-snug">{product.name}</span>
                  <span className="mt-auto pt-2 text-[15px] font-extrabold text-ink">{product.price}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">Prices and stock come from active seller listings.</p>
      </div>
    </section>
  );
}

function PartnerSection() {
  return (
    <section data-forced-colors="preserve" className="bg-[#0b1a13] text-white">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-24">
        <div className="max-w-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-live">Earn with NaijaDeals</p>
          <h2 className="mt-3 font-display text-[2rem] font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-[2.6rem]">
            Turn what you already do into income.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-[15px]">
            Sell products, offer a service, host guests or refer customers. Manage the work and your earnings from the
            same NaijaDeals account.
          </p>

          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            <PartnerLink href="/sell" icon={Store} label="Sell on NaijaDeals" body="List products for verified buyers." />
            <PartnerLink href="/affiliate" icon={BadgeDollarSign} label="Refer and earn" body="Share links to completed orders." />
            <PartnerLink href="/naijagigs" icon={Wrench} label="Offer a service" body="Find work with verified customers." />
            <PartnerLink href="/business/shop" icon={Building2} label="Business tools" body="Manage orders, stock and payouts." />
          </ul>
        </div>

        <div className="relative">
          <img
            src="/generated/home/home-card-gigs.webp"
            alt="Brand illustration of a Nigerian technician at an electrical panel"
            width={800}
            height={800}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-[28px] object-cover object-center"
          />
          <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-3.5 text-ink shadow-lg sm:right-auto sm:max-w-[17rem]">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              Partner opportunities
            </p>
            <p className="mt-1 text-[13px] font-extrabold leading-snug">Sell, serve or refer from one account.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerLink({
  href,
  icon: Icon,
  label,
  body
}: {
  href: string;
  icon: typeof Store;
  label: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.04] p-3.5 transition hover:border-primary-live/40 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-live"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-live/15 text-primary-live">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[13px] font-extrabold">
            {label}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-white/65">{body}</span>
        </span>
      </Link>
    </li>
  );
}
