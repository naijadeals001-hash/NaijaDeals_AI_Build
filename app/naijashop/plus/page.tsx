import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleOff,
  Info,
  ListChecks,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { NaijaDealsLogo } from "@/components/brand/naijadeals-logo";
import { PlusCarousel } from "@/components/plus/plus-carousel";
import { PlusFaq } from "@/components/plus/plus-faq";
import { PlusServiceCard } from "@/components/plus/plus-service-card";
import {
  plusAvailability,
  plusBenefits,
  plusFaqs,
  plusMarketFactsUnavailable,
  plusMembershipSummary,
  plusServiceCards,
  plusStatus,
  resolvePlusMarketFacts,
  type PlusMarketFacts
} from "@/lib/data/plus";
import { listCountryActivations } from "@/lib/services/core/country.service";

export const metadata: Metadata = {
  title: "NaijaDeals Plus+ — membership status",
  description:
    "NaijaDeals Plus+ is not open yet. No plan, price or exclusive benefit is configured, and this page cannot take a payment. Explore the real NaijaDeals ecosystem services."
};

// Marketplace availability is admin-editable at runtime, so this page must be
// rendered per request instead of freezing one configuration into the build.
export const dynamic = "force-dynamic";

const EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]";
const SECTION_PAD = "scroll-mt-28 pt-9 sm:pt-12";

/**
 * Read the same effective country activation list checkout uses (static
 * configuration overlaid by admin-editable database rows). A failed read must
 * never take the page down and must never fall back to static values as if they
 * were the current configuration: it reports that configuration was unreadable.
 */
async function readPlusMarketFacts(): Promise<PlusMarketFacts> {
  try {
    return resolvePlusMarketFacts(await listCountryActivations());
  } catch {
    return plusMarketFactsUnavailable;
  }
}

export default async function PlusPage() {
  const marketFacts = await readPlusMarketFacts();
  const marketFactsUnavailable = marketFacts.state === "unavailable";
  const benefitCount = plusAvailability.benefitsConfigured;
  const benefitNoun = benefitCount === 1 ? "benefit" : "benefits";
  const serviceCount = plusServiceCards.length;
  const deliveryNames = marketFacts.deliveryMarkets.map((country) => country.name).join(", ");
  const browseNames = marketFacts.browseOnlyMarkets.map((country) => country.name).join(", ");
  const storeCurrency = marketFacts.storeCurrency;

  return (
    <div data-plus-page className="bg-[#f4f7f2] pb-4 text-[#14241b]">
      <div className="bg-[#07351f] text-white">
        <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <nav aria-label="Breadcrumb" className="text-[11px] font-semibold text-[#b9d5bd]">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <Link
                  href="/naijashop"
                  className="rounded-sm hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f]"
                >
                  NaijaDeals Marketplace
                </Link>
              </li>
              <li aria-hidden="true" className="text-[#7fa58a]">
                /
              </li>
              <li aria-current="page" className="text-white">
                Plus+
              </li>
            </ol>
          </nav>

          <header className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[#0a4028]">
            <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
              <div className="min-w-0 p-5 sm:p-8 lg:p-10 xl:p-12">
                <div className="flex flex-col items-start gap-2.5">
                  <NaijaDealsLogo tone="onDark" size="xl" />
                  <span className="rounded-full border border-[#E8C56A]/50 bg-[#E8C56A]/10 px-2.5 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#F2D48C]">
                    Plus+
                  </span>
                </div>

                <p className="mt-6 text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-[#9fd0ad]">NaijaDeals membership</p>
                <h1
                  id="plus-hero-heading"
                  className="mt-2 max-w-[20ch] font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[40px] lg:text-[46px] xl:text-[52px]"
                >
                  One membership for the NaijaDeals you already use.
                </h1>
                <p className="mt-4 max-w-xl text-[13px] leading-6 text-[#d6e7d7] sm:text-[14px] sm:leading-7">
                  Plus+ is being prepared as a single membership across the ecosystem. {plusMembershipSummary}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusChip tone="gold">{plusStatus.membership}</StatusChip>
                  <StatusChip tone="muted">{plusStatus.checkout}</StatusChip>
                  <StatusChip tone="muted">
                    {benefitCount} {benefitNoun} configured
                  </StatusChip>
                </div>

                <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                  <a
                    href="#how-it-works"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#F2CE72] px-5 py-2.5 text-[12.5px] font-extrabold text-[#17301f] transition hover:bg-[#ffdf95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a4028] motion-reduce:transition-none"
                  >
                    See what is confirmed
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </a>
                  <a
                    href="#explore"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-[12.5px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a4028] motion-reduce:transition-none"
                  >
                    Explore the ecosystem
                  </a>
                </div>
                <p className="mt-4 text-[11px] leading-5 text-[#a9c9b2]">Nothing on this page takes a payment or enrols an account.</p>
              </div>

              <div className="relative min-h-[360px] sm:min-h-[380px] lg:min-h-full">
                <Image
                  src="/generated/shop/hero-desktop.webp"
                  alt="Shopper carrying paper bags at a lively outdoor market"
                  fill
                  priority
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover object-[64%_center]"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0a4028] via-[#0a4028]/30 to-transparent rtl:bg-gradient-to-l" />
                <div className="absolute bottom-4 start-4 end-4 rounded-2xl border border-white/15 bg-[#07351f]/95 p-4 shadow-lg backdrop-blur-sm sm:start-auto sm:end-4 sm:w-[276px]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#F2D48C]">Membership status</p>
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#f0b24a]" />
                  </div>
                  <dl className="mt-3 space-y-2 text-[11.5px] leading-5">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#b9d5bd]">Plan and price</dt>
                      <dd className="font-bold text-[#F2D48C]">{plusStatus.plan}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#b9d5bd]">Exclusive benefits</dt>
                      <dd className="font-bold text-white">{benefitCount} configured</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#b9d5bd]">Billing</dt>
                      <dd className="font-bold text-white">{plusStatus.billing}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-white/10 pt-2 text-[10.5px] leading-4 text-[#b9d5bd]">
                    Status reflects the configuration in this build.
                  </p>
                </div>
              </div>
            </div>
          </header>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <section aria-labelledby="plus-facts-heading" className="pt-6 sm:pt-8">
          <h2 id="plus-facts-heading" className="sr-only">
            What is confirmed today
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            <FactCard icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />} title="One account">
              Your existing NaijaDeals sign-in is the identity a plan would attach to.
            </FactCard>
            <FactCard icon={<CircleOff className="h-5 w-5" aria-hidden="true" />} title="No plan configured">
              No price, billing period, trial or country eligibility has been approved.
            </FactCard>
            <FactCard icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title="Standard stays standard">
              Ecosystem services are shown as services, never relabelled as Plus+ benefits.
            </FactCard>
          </ul>
        </section>

        <section id="how-it-works" aria-labelledby="plus-how-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-how-heading"
            eyebrow="How it works"
            title="Membership, step by step"
            description="Only the first step exists today. The rest are marked unavailable rather than hidden."
          />
          <ol className="mt-5 grid gap-3 lg:grid-cols-3">
            <Step
              number="01"
              title="Use one NaijaDeals account"
              status="Available today"
              tone="live"
              action={
                <Link
                  href="/account"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-[12px] font-extrabold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                >
                  Open your account
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              }
            >
              Your existing NaijaDeals sign-in is the identity a plan would attach to. You can use it today; no membership is attached.
            </Step>
            <Step number="02" title="A plan is published" status={plusStatus.plan} tone="muted">
              {plusAvailability.plansConfigured === 0
                ? "A plan must publish its price, billing period, eligible countries, cancellation terms and approved benefit register before it can be offered. None of that exists yet."
                : `This build reports ${plusAvailability.plansConfigured} configured ${
                    plusAvailability.plansConfigured === 1 ? "plan" : "plans"
                  }; this page does not publish their terms.`}
            </Step>
            <Step number="03" title="Billing and activation" status={plusStatus.checkoutStep} tone="muted">
              {plusAvailability.checkoutConfigured
                ? "Subscription checkout is marked configured in this build. This page still has no payment-method step or activation flow, and no account is upgraded here."
                : "There is no subscription checkout, payment-method step or activation flow for Plus+. No account is upgraded by this page."}
            </Step>
          </ol>
          <div className="mt-4 flex gap-3 rounded-xl border border-[#e5d3a2] bg-[#fffaf0] p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6412]" aria-hidden="true" />
            <p className="text-[12px] leading-6 text-[#5c4a1e]">
              <strong className="font-extrabold text-[#3f3010]">
                {plusAvailability.membershipOpen ? "No join control is rendered here." : "There is no join button because there is no plan to join."}
              </strong>{" "}
              {plusAvailability.checkoutConfigured
                ? "Checkout is marked configured in this build, but this page still cannot start a subscription."
                : "Until a plan and checkout are approved, a button here could not complete a real subscription."}
            </p>
          </div>
        </section>

        <section aria-labelledby="plus-eligibility-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-eligibility-heading"
            eyebrow="Eligibility"
            title="Country and plan eligibility"
            description={
              marketFactsUnavailable
                ? "No Plus+ plan is configured in any market. The marketplace country configuration could not be read for this request, so market facts are shown as unavailable rather than guessed."
                : "No Plus+ plan is configured in any market. The marketplace facts below are read from the current country configuration."
            }
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <EligibilityCard
              title={marketFactsUnavailable ? "Delivery markets unavailable" : deliveryNames || "No delivery market"}
              badge={marketFactsUnavailable ? "Configuration unread" : marketFacts.deliveryMarkets.length > 0 ? "Commerce enabled" : "No delivery market"}
              tone={!marketFactsUnavailable && marketFacts.deliveryMarkets.length > 0 ? "live" : "muted"}
              body={
                marketFactsUnavailable
                  ? "The marketplace country configuration could not be read, so current delivery markets cannot be confirmed. No Plus+ plan, price or entitlement is configured."
                  : marketFacts.deliveryMarkets.length > 0
                    ? `${storeCurrency} checkout and tracked delivery are enabled for the marketplace. No Plus+ plan, price or entitlement is configured.`
                    : "No market currently has marketplace checkout and tracked delivery enabled. No Plus+ plan, price or entitlement is configured."
              }
              rows={[
                ["Marketplace currency", marketFactsUnavailable ? "Unavailable" : storeCurrency ?? "Not configured"],
                ["Plus+ plan", plusStatus.plan],
                ["Plus+ price", "Not published"]
              ]}
            />
            <EligibilityCard
              title="Browse-only markets"
              badge={marketFactsUnavailable ? "Configuration unread" : "No delivery"}
              tone="muted"
              body={
                marketFactsUnavailable
                  ? "The marketplace country configuration could not be read, so browse-only markets cannot be confirmed. No Plus+ plan is configured."
                  : `${browseNames || "No additional markets"} can be selected for browsing. Marketplace delivery is not enabled, and no Plus+ plan is configured.`
              }
              rows={[
                ["Plus+ plan", plusStatus.plan],
                ["Plus+ eligibility", "Not published"],
                ["Plus+ checkout", plusStatus.subscriptionCheckout]
              ]}
            />
            <EligibilityCard
              title="Plans and billing"
              badge={plusStatus.checkout}
              tone={plusAvailability.checkoutConfigured ? "live" : "muted"}
              body={
                plusAvailability.checkoutConfigured
                  ? "Subscription checkout is marked configured in this build. No Plus+ plan price or cancellation window is published on this page."
                  : "No monthly or annual plan, trial, amount, currency or cancellation window has been approved. No payment can be taken."
              }
              rows={[
                ["Plans configured", String(plusAvailability.plansConfigured)],
                ["Subscription checkout", plusStatus.subscriptionCheckout],
                ["Cancellation terms", "Not published"]
              ]}
            />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#4b5b51]">
            {marketFactsUnavailable
              ? "Marketplace country configuration could not be read. Plus+ eligibility remains unconfigured for every market."
              : "The country list is read from the current marketplace configuration. Plus+ eligibility is a separate decision and remains unconfigured for every market."}
          </p>
        </section>

        <section aria-labelledby="plus-benefits-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-benefits-heading"
            eyebrow="Benefits"
            title="Discover Plus+-exclusive benefits"
            description={
              benefitCount === 0
                ? "Only approved entitlements attached to a real plan appear here. That register is empty."
                : "Only approved entitlements attached to a real plan appear here."
            }
            aside={<CountChip>{`${benefitCount} ${benefitNoun}`}</CountChip>}
          />
          <div className="mt-5">
            <PlusCarousel
              label="Plus+-exclusive benefits"
              hint={
                benefitCount === 0
                  ? "No additional benefits are configured to scroll yet."
                  : "Swipe or use the arrow keys to browse the configured benefits. The rail does not auto-rotate."
              }
            >
              {plusBenefits.length === 0 ? (
                <li className="w-full flex-none snap-start">
                  <div className="relative overflow-hidden rounded-2xl border border-dashed border-[#abc4aa] bg-[#f8fbf6] p-5 sm:p-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#07351f] text-[#F2D48C]">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className={EYEBROW}>Benefits register · empty</p>
                        <h3 className="mt-1 font-display text-[20px] font-extrabold leading-tight tracking-[-0.015em] sm:text-[23px]">
                          No Plus+-exclusive benefits are configured yet.
                        </h3>
                        <p className="mt-2 max-w-3xl text-[12.5px] leading-6 text-[#4b5b51]">
                          Standard NaijaDeals services are not Plus+ benefits. When an entitlement is approved, it will appear here with its plan and
                          eligible countries.
                        </p>
                        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                          <a
                            href="#benefits-register"
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#07351f] px-4 py-2 text-[12px] font-extrabold text-white transition hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 motion-reduce:transition-none"
                          >
                            View all benefits
                            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                          </a>
                          <a
                            href="#how-it-works"
                            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cbdacb] bg-white px-4 py-2 text-[12px] font-extrabold text-[#14241b] transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 motion-reduce:transition-none"
                          >
                            How membership works
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ) : (
                plusBenefits.map((benefit) => (
                  <li key={benefit.id} className="w-[86%] flex-none snap-start sm:w-[48%] lg:w-[32%]">
                    <article data-plus-benefit-card={benefit.id} className="flex h-full flex-col rounded-2xl border border-[#dbe6d8] bg-white p-5">
                      <span className="w-fit rounded-full bg-[#e7f8ed] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0b5c33]">
                        Configured
                      </span>
                      <h3 className="mt-3 font-display text-[18px] font-extrabold leading-tight">{benefit.title}</h3>
                      <p className="mt-1.5 text-[12.5px] leading-6 text-[#4b5b51]">{benefit.description}</p>
                      <div className="mt-auto pt-3">
                        <p className="text-[11px] font-bold text-[#0b5c33]">Plan: {benefit.planName}</p>
                        <p className="mt-0.5 text-[11px] text-[#4b5b51]">
                          Eligible countries:{" "}
                          {benefit.eligibleCountries.length > 0 ? benefit.eligibleCountries.join(", ") : "Not published"}
                        </p>
                      </div>
                    </article>
                  </li>
                ))
              )}
            </PlusCarousel>
          </div>
        </section>

        <section id="benefits-register" aria-labelledby="plus-register-heading" className={SECTION_PAD}>
          <div className="rounded-2xl border border-[#dbe6d8] bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-2xl">
                <p className={EYEBROW}>Benefits register</p>
                <h2 id="plus-register-heading" className="mt-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[29px]">
                  All benefits, including none.
                </h2>
                <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
                  This is the complete public register. An entitlement can only move into it after approval, and it must name the plan it belongs to.
                </p>
              </div>
              <CountChip>This build</CountChip>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <RegisterCard
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                label="Exclusive benefits"
                value={`${benefitCount} configured`}
                body="No entitlement is active on any account."
              />
              <RegisterCard
                icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
                label="Plans and prices"
                value={plusStatus.plan}
                body="No monthly or annual plan has been approved."
              />
              <RegisterCard
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                label="Standard services"
                value="Not included"
                body="Shop, Drive, Food and the other services are not Plus+ benefits."
              />
            </dl>
          </div>
        </section>

        <section id="explore" aria-labelledby="plus-explore-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-explore-heading"
            eyebrow="The ecosystem"
            title="Explore more with NaijaDeals"
            description={`${serviceCount} real services, separate from Plus+. Availability is read from the public service directory.`}
            aside={<CountChip>{serviceCount} services</CountChip>}
          />
          <div className="mt-5">
            <PlusCarousel
              label="NaijaDeals ecosystem services"
              hint={`Swipe, scroll or use the arrow keys to see all ${serviceCount} services. The rail does not auto-rotate.`}
            >
              {plusServiceCards.map((service) => (
                <li key={service.key} className="w-[82%] min-w-0 flex-none snap-start sm:w-[46%] lg:w-[31%] xl:w-[23.5%]">
                  <PlusServiceCard service={service} />
                </li>
              ))}
            </PlusCarousel>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#4b5b51]">
            Opening a service takes you to its own pricing and terms; it does not create a Plus+ membership.{" "}
            <Link
              href="/#services"
              className="font-bold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              See the ecosystem home
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="plus-faq-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-faq-heading"
            eyebrow="FAQ"
            title="Questions about Plus+"
            description="Short answers to the things this page cannot do yet."
          />
          <div className="mt-5 max-w-4xl">
            <PlusFaq items={plusFaqs} />
          </div>
        </section>

        <section aria-labelledby="plus-close-heading" className="pt-9 sm:pt-12">
          <div className="overflow-hidden rounded-2xl bg-[#07351f] p-5 text-white sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
            <div className="max-w-2xl">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#F2D48C]">
                {plusAvailability.checkoutConfigured ? "No checkout on this page" : "No payment. No signup."}
              </p>
              <h2 id="plus-close-heading" className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">
                {plusAvailability.membershipOpen ? "Membership is marked open." : "Membership is not open yet."}
              </h2>
              <p className="mt-2 text-[12.5px] leading-6 text-[#d6e7d7]">
                {plusAvailability.membershipOpen
                  ? plusAvailability.checkoutConfigured
                    ? "Membership is marked open and subscription checkout is configured in this build. Opening a service still does not create a Plus+ membership."
                    : "Membership is marked open in this build, but subscription checkout is still not configured. Opening a service does not create a Plus+ membership."
                  : "There is nothing to buy and nothing to opt in to. Keep using the marketplace and the other services on their current terms; this page will change only when an approved plan exists."}
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:mt-0 lg:shrink-0">
              <Link
                href="/naijashop"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#F2CE72] px-5 py-2.5 text-[12.5px] font-extrabold text-[#17301f] transition hover:bg-[#ffdf95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f] motion-reduce:transition-none"
              >
                Continue to the marketplace
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
              <a
                href="#explore"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-[12.5px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f] motion-reduce:transition-none"
              >
                Explore services
              </a>
            </div>
          </div>
          <p className="mt-3 text-[10.5px] text-[#4b5b51]">Status reflects the configuration in this build.</p>
        </section>
      </div>
    </div>
  );
}

function StatusChip({ tone, children }: { tone: "gold" | "muted"; children: ReactNode }) {
  const className =
    tone === "gold"
      ? "border-[#E8C56A]/40 bg-[#E8C56A]/10 text-[#F2D48C]"
      : "border-white/15 bg-white/5 text-[#d6e7d7]";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${className}`}>
      {children}
    </span>
  );
}

function CountChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#e7f3e9] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0b5c33] ring-1 ring-[#cfe0ca]">
      {children}
    </span>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  aside
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 id={id} className="mt-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[30px]">
          {title}
        </h2>
        <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">{description}</p>
      </div>
      {aside}
    </div>
  );
}

function FactCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-[#dbe6d8] bg-white p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7f3e9] text-[#0b5c33]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-extrabold text-[#14241b]">{title}</p>
        <p className="mt-1 text-[11.5px] leading-5 text-[#4b5b51]">{children}</p>
      </div>
    </li>
  );
}

function Step({
  number,
  title,
  status,
  tone,
  action,
  children
}: {
  number: string;
  title: string;
  status: string;
  tone: "live" | "muted";
  action?: ReactNode;
  children: ReactNode;
}) {
  const badge =
    tone === "live"
      ? "bg-[#e7f8ed] text-[#0b5c33] ring-[#0b5c33]/10"
      : "bg-[#f2f4f2] text-[#4b5b51] ring-[#4b5b51]/10";
  return (
    <li className="flex h-full flex-col rounded-2xl border border-[#dbe6d8] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#07351f] font-display text-[13px] font-extrabold text-[#F2D48C]">
          {number}
        </span>
        <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ring-1 ${badge}`}>
          {status}
        </span>
      </div>
      <h3 className="mt-4 font-display text-[17px] font-extrabold leading-tight tracking-[-0.015em]">{title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-6 text-[#4b5b51]">{children}</p>
      {action ? <div className="mt-auto pt-3">{action}</div> : null}
    </li>
  );
}

function EligibilityCard({
  title,
  badge,
  tone,
  body,
  rows
}: {
  title: string;
  badge: string;
  tone: "live" | "muted";
  body: string;
  rows: Array<[string, string]>;
}) {
  const badgeClass =
    tone === "live"
      ? "bg-[#e7f8ed] text-[#0b5c33] ring-[#0b5c33]/10"
      : "bg-[#f2f4f2] text-[#4b5b51] ring-[#4b5b51]/10";
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#dbe6d8] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-display text-[17px] font-extrabold leading-tight tracking-[-0.015em]">{title}</h3>
        <span className={`inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ring-1 ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-6 text-[#4b5b51]">{body}</p>
      <dl className="mt-auto space-y-2 pt-4 text-[11.5px] leading-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-t border-[#eef3ea] pt-2">
            <dt className="text-[#4b5b51]">{label}</dt>
            <dd className="text-right font-bold text-[#14241b] rtl:text-left">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function RegisterCard({
  icon,
  label,
  value,
  body
}: {
  icon: ReactNode;
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-xl bg-[#f7faf5] p-4 ring-1 ring-[#e3ebe0]">
      <dt className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#4b5b51]">
        <span className="text-[#0b5c33]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-2 font-display text-[18px] font-extrabold leading-tight text-[#14241b]">{value}</dd>
      <dd className="mt-1 text-[11.5px] leading-5 text-[#4b5b51]">{body}</dd>
    </div>
  );
}
