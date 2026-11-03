import Link from "next/link";
import { Suspense } from "react";
import { AlertCircle, ArrowRight, Bot, ChefHat, Headphones, PackageCheck, ShieldCheck, ShoppingBag, Truck, Wrench } from "lucide-react";
import { NaijaEatsPage, NaijaFreshPage, NaijaPayPage, NaijaSendPage, NaijaShopPage, OrdersPageApi, SearchPage, ShopCartPage, ShopCheckoutPage } from "@/components/commerce/naijashop";
import { verticals } from "@/lib/data/ecosystem";

const configuredShopRoutes = new Set(["categories", "product-listing"]);

/** Second owner-supplied brand illustration per module page (AI-generated artwork). */
const secondaryBrandImage: Record<string, { src: string; alt: string }> = {
  naijastay: {
    src: "/brand-photography/stay-courtyard-villa.jpg",
    alt: "Brand illustration of a walled courtyard villa with a pool at twilight"
  },
  naijastream: {
    src: "/brand-photography/stream-rooftop-lagos.jpg",
    alt: "Brand illustration of a listener wearing headphones on a Lagos rooftop at sunset"
  },
  "aura-ai": {
    src: "/brand-photography/aura-orb-lagos.jpg",
    alt: "Brand illustration of a glowing green assistant orb on a table overlooking Lagos at night"
  }
};

export function GenericPage({ slug }: { slug: string }) {
  if (slug === "naijashop") {
    return (
      <Suspense fallback={<Loading />}>
        <NaijaShopPage />
      </Suspense>
    );
  }

  if (slug === "search" || configuredShopRoutes.has(slug)) {
    return (
      <Suspense fallback={<Loading />}>
        <SearchPage />
      </Suspense>
    );
  }

  if (slug === "cart") {
    return (
      <Suspense fallback={<Loading />}>
        <ShopCartPage />
      </Suspense>
    );
  }

  if (slug === "checkout") {
    return (
      <Suspense fallback={<Loading />}>
        <ShopCheckoutPage />
      </Suspense>
    );
  }

  if (slug === "orders" || slug === "returns") {
    return (
      <Suspense fallback={<Loading />}>
        <OrdersPageApi />
      </Suspense>
    );
  }

  if (slug === "wallet" || slug === "payments") {
    return (
      <Suspense fallback={<Loading />}>
        <NaijaPayPage />
      </Suspense>
    );
  }

  if (slug === "naijaeats") return <NaijaEatsPage />;
  if (slug === "naijafresh") return <NaijaFreshPage />;
  if (slug === "naijasend" || slug === "shipping") return <NaijaSendPage />;
  if (slug === "product-detail") return <ConfiguredLink title="Product detail" description="Open a live product from NaijaShop to see variants, stock, reviews and escrow checkout." href="/naijashop" cta="Browse NaijaShop" />;
  if (slug === "safety") return <SafetyPage />;
  if (slug === "help") return <HelpPage />;
  if (slug === "ecosystem-hub") return <EcosystemPage />;

  return <UnconfiguredVertical slug={slug} />;
}

function Loading() {
  return <div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading...</div>;
}

function ConfiguredLink({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-8">
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{description}</p>
      <Link href={href} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white">
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function SafetyPage() {
  const controls = [
    "Passwords are hashed with scrypt; sessions are stored as SHA-256 token hashes in httpOnly cookies.",
    "Every seller, admin and courier API checks the session and role on the server before reading or writing data.",
    "Payment amounts, currency and status are verified with the provider on the server before an order is marked paid.",
    "Stock is reserved atomically, so concurrent checkouts cannot oversell the same units.",
    "Escrow holds, refunds and vendor payouts are written to ledger and audit records."
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <ShieldCheck className="h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-3xl font-extrabold">Safety and verification</h1>
        <p className="mt-2 text-muted">These controls are implemented in the running application, not illustrative screens.</p>
      </header>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <ul className="space-y-3">
          {controls.map((control) => (
            <li key={control} className="flex gap-3 text-sm">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <span>{control}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <PackageCheck className="h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-3xl font-extrabold">Help with an order</h1>
        <p className="mt-2 text-muted">Order actions are handled inside your account so the result is recorded server-side.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/orders" className="rounded-2xl border border-border-soft bg-canvas p-5 hover:border-primary">
          <h2 className="font-bold">Orders and returns</h2>
          <p className="mt-1 text-sm text-muted">Cancel an unpaid order, request a return, confirm delivery or review a product.</p>
        </Link>
        <Link href="/account" className="rounded-2xl border border-border-soft bg-canvas p-5 hover:border-primary">
          <h2 className="font-bold">Account details</h2>
          <p className="mt-1 text-sm text-muted">Update addresses, view saved items or apply to become a seller.</p>
        </Link>
      </section>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Live support configuration</h2>
        <p className="mt-2 text-sm text-muted">
          No live chat, email or SMS provider is configured in this environment. Support automation is therefore not
          available rather than simulated. Configure an email or messaging provider to enable outbound support.
        </p>
      </section>
    </div>
  );
}

function EcosystemPage() {
  const live = [
    { name: "NaijaShop", href: "/naijashop", detail: "Products, cart, checkout, escrow, orders and reviews.", icon: ShoppingBag, live: true },
    { name: "NaijaPay", href: "/wallet", detail: "Wallet balance, transactions and escrow holds.", icon: PackageCheck, live: true },
    { name: "NaijaSend", href: "/naijasend", detail: "Manual courier workflow with tracked delivery events.", icon: Truck, live: true },
    { name: "NaijaDrive", href: "/naijadrive", detail: "Lagos ride booking with fare held in NaijaPay and real driver acceptance.", icon: Truck, live: true },
    { name: "NaijaEats", href: "/naijaeats", detail: "No restaurant or dispatch provider is configured.", icon: ChefHat, live: false }
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">NaijaDeals ecosystem</h1>
        <p className="mt-2 text-muted">Only the services below are connected to real backend data in this environment.</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        {live.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} className="rounded-2xl border border-border-soft bg-canvas p-5 hover:border-primary">
              <Icon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-display text-lg font-extrabold">{item.name}</h2>
              <p className="mt-1 text-sm text-muted">{item.detail}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${item.live ? "bg-primary-soft text-primary" : "bg-surface-mid text-muted"}`}>
                {item.live ? "Connected" : "Not configured"}
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

const verticalCopy: Record<string, { name: string; description: string; requirement: string; icon: typeof Wrench; image?: string; works?: string[]; needs?: string[] }> = {
  naijagigs: {
    name: "NaijaGigs",
    description: "Service bookings with milestone escrow.",
    requirement: "A gig catalogue, provider verification and milestone payout rules are not implemented in this environment.",
    icon: Wrench
  },
  naijastay: {
    name: "NaijaStay",
    description: "Hotel and shortlet bookings.",
    requirement: "Property inventory, availability calendars and host payout accounts are not configured in this environment.",
    icon: PackageCheck
  },
  naijastream: {
    name: "NaijaStream",
    description: "Creator content, live rooms and royalties.",
    requirement: "Media storage, rights management and royalty settlement are not configured in this environment.",
    icon: Headphones
  },
  naijafresh: {
    name: "NaijaFresh",
    description: "Groceries and fresh produce with substitutions.",
    requirement: "Grocery inventory, a picker workflow and substitution approval are not configured in this environment.",
    icon: PackageCheck
  },
  "aura-ai": {
    name: "Aura AI",
    description: "Shopping and support assistant.",
    requirement: "No model provider key is configured, so the assistant is not available rather than simulated.",
    icon: Bot
  }
};

function UnconfiguredVertical({ slug }: { slug: string }) {
  const copy = verticalCopy[slug] ?? {
    name: "NaijaDeals service",
    description: "This route is not connected to a backend service in this environment.",
    requirement: "No provider credentials or service configuration are present.",
    icon: AlertCircle
  };
  const Icon = copy.icon;
  const image = verticals.find((vertical) => vertical.href === `/${slug}`)?.image;
  const secondary = secondaryBrandImage[slug];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/products"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
        All products
      </Link>
      <section className="overflow-hidden rounded-3xl border border-border-soft bg-canvas">
        {image ? (
          <div className={secondary ? "grid grid-cols-2" : ""}>
            <img src={image} alt={`Brand illustration for ${copy.name}`} width={640} height={480} className={`w-full object-cover ${secondary ? "h-56" : "h-44"}`} />
            {secondary ? (
              <img src={secondary.src} alt={secondary.alt} width={640} height={480} className="h-56 w-full object-cover" />
            ) : null}
          </div>
        ) : null}
        <div className="p-6 sm:p-8">
          <Icon className="h-9 w-9 text-primary" aria-hidden="true" />
          <h1 className="mt-3 font-display text-3xl font-extrabold">{copy.name}</h1>
          <p className="mt-2 text-muted">{copy.description}</p>
          <div className="mt-5 rounded-xl bg-surface-low p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">Configuration state</p>
            <p className="mt-1 text-sm font-semibold">{copy.requirement}</p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            This page is served so the route never dead-ends or pretends to complete a booking. The service becomes
            usable only when its provider, operational data and money movement are connected and verified.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/products" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white">
              Explore connected services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/naijashop" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-soft px-5 text-sm font-bold">
              Shop NaijaShop
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
