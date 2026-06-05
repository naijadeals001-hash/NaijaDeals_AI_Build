import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircle, QrCode, Route, ShieldCheck } from "lucide-react";
import { aiSystems, listings, pageCopy, trustFlows, verticals } from "@/lib/data/ecosystem";
import { ListingCard, MetricCard } from "@/components/sections/cards";
import { TrustBadge } from "@/components/ui/badge";
import { RouteSpecificPanel } from "@/components/sections/flow-panels";
import { VerticalDemoPanel } from "@/components/sections/investor-demo";

export function GenericPage({ slug }: { slug: string }) {
  const copy = pageCopy[slug] ?? verticalCopy(slug);
  const activeVertical = verticals.find((vertical) => vertical.href.replace("/", "") === slug);
  const relevantListings = activeVertical ? listings.filter((item) => item.vertical === activeVertical.key || item.vertical === "shop").slice(0, 4) : listings;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm sm:p-8">
        <TrustBadge>{copy.eyebrow}</TrustBadge>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h1 className="max-w-4xl font-display text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-muted">{copy.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/checkout" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white">
                {copy.cta} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/aura-ai" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border-soft px-5 font-bold">
                Ask Aura
              </Link>
            </div>
          </div>
          <div className="rounded-xl bg-primary-soft p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Live readiness</p>
            <div className="mt-4 space-y-3 text-sm">
              {["Auth-ready", "Wallet-ready", "Escrow-ready", "API-ready demo data"].map((item) => (
                <div key={item} className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Conversion lift" value="+18%" detail="Aura recommendation model target" />
        <MetricCard label="Trust events" value="9,204" detail="KYC, QR, escrow, reviews" />
        <MetricCard label="Avg response" value="42 sec" detail="Support and dispatch state" />
        <MetricCard label="Low-data ready" value="100%" detail="Mobile-first layouts" />
      </section>

      <RouteSpecificPanel slug={slug} />

      {activeVertical ? <VerticalDemoPanel keyName={activeVertical.key} /> : null}

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Discovery rail</p>
            <h2 className="font-display text-2xl font-extrabold">Featured experiences</h2>
          </div>
          <Link href="/search" className="text-sm font-bold text-primary">See all</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {relevantListings.map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border-soft bg-canvas p-5">
          <Route className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-display text-xl font-bold">Real-time tracking</h3>
          <p className="mt-2 text-sm text-muted">Order, ride, delivery, booking, gig, and payout states use one mission timeline model.</p>
          <Link href="/tracking/mission-2843" className="mt-4 inline-flex font-bold text-primary">Open tracker</Link>
        </div>
        <div className="rounded-xl border border-border-soft bg-canvas p-5">
          <QrCode className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-display text-xl font-bold">QR and barcode proof</h3>
          <p className="mt-2 text-sm text-muted">Pickup, delivery, handoff, room access, and return verification events are represented.</p>
          <Link href="/shipping" className="mt-4 inline-flex font-bold text-primary">View proof flow</Link>
        </div>
        <div className="rounded-xl border border-border-soft bg-canvas p-5">
          <MessageCircle className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-display text-xl font-bold">Disputes and refunds</h3>
          <p className="mt-2 text-sm text-muted">Escrow, evidence, merchant response, refund rules, and human escalation are UI-ready.</p>
          <Link href="/returns" className="mt-4 inline-flex font-bold text-primary">Resolve case</Link>
        </div>
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-2xl font-extrabold">AI and trust systems</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {aiSystems.map((system) => {
            const Icon = system.icon;
            return (
              <div key={system.title} className="flex gap-3 rounded-xl bg-surface-low p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold">{system.title}</h3>
                  <p className="mt-1 text-sm text-muted">{system.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-night p-5 text-white">
        <h2 className="font-display text-2xl font-extrabold">Wallet, escrow, payout lifecycle</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {trustFlows.map((flow) => {
            const Icon = flow.icon;
            return (
              <div key={flow.title} className="rounded-xl bg-white/10 p-4">
                <Icon className="h-5 w-5 text-primary-live" />
                <h3 className="mt-3 font-bold">{flow.title}</h3>
                <p className="mt-2 text-sm text-white/70">{flow.detail}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function verticalCopy(slug: string) {
  const vertical = verticals.find((item) => item.href.replace("/", "") === slug);
  if (!vertical) {
    return {
      title: "NaijaDeals production-ready page",
      eyebrow: "NaijaDeals",
      description: "A structured, mobile-first page shell with ecosystem data, trust flows, AI interfaces, and backend-ready components.",
      cta: "Continue"
    };
  }

  return {
    title: `${vertical.name} is ready for high-trust African scale.`,
    eyebrow: vertical.name,
    description: `${vertical.label}. Built from Stitch patterns including hero search, category chips, discovery rows, listing cards, checkout or booking flow, reviews, saved items, AI recommendations, and admin readiness.`,
    cta: `Open ${vertical.name}`
  };
}
