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
  Megaphone,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { NaijaDealsLogo } from "@/components/brand/naijadeals-logo";
import { PlusAwarenessCard } from "@/components/plus/plus-awareness-card";
import { PlusBenefitCard } from "@/components/plus/plus-benefit-card";
import { PlusCarousel } from "@/components/plus/plus-carousel";
import { PlusCountryGrid } from "@/components/plus/plus-country-grid";
import { PlusEmptyState } from "@/components/plus/plus-empty-state";
import { PlusFaq } from "@/components/plus/plus-faq";
import { PlusPromotionCard } from "@/components/plus/plus-promotion-card";
import {
  loadPlusPublicData,
  plusFaqs,
  plusMembershipSummary,
  plusStatusLabels
} from "@/lib/data/plus";

export const metadata: Metadata = {
  title: "NaijaDeals Plus+ — membership availability",
  description:
    "Plus+ availability is read from approved plan configuration. This page publishes no plan, price or benefit that the server has not approved, and it cannot take a payment."
};

// Plan, content and promotion availability are admin-editable at runtime, so
// this page must be rendered per request instead of freezing one configuration.
export const dynamic = "force-dynamic";

const EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]";
const SECTION_PAD = "scroll-mt-28 pt-9 sm:pt-12";

export default async function PlusPage() {
  const data = await loadPlusPublicData();
  const unavailable = data.state === "unavailable";
  const status = plusStatusLabels(data);
  const benefitCount = data.benefits.length;
  const benefitNoun = benefitCount === 1 ? "benefit" : "benefits";
  const cardCount = data.cards.length;
  const promotionCount = data.promotions.length;
  const availableCountries = data.countries.filter((country) => country.available);
  const availableNames = availableCountries.map((country) => country.name).join(", ");

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
                  <NaijaDealsLogo
                    tone="onDark"
                    size="xl"
                    className="max-w-full !text-[min(2.4rem,10.5vw)] sm:!text-[min(3rem,10.5vw)] lg:!text-[min(3rem,6.5vw)]"
                  />
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
                  Plus+ is being prepared as a single membership across the ecosystem. {plusMembershipSummary(data)}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusChip tone={data.flags.membershipOpen ? "gold" : "muted"}>{status.membership}</StatusChip>
                  <StatusChip tone="muted">{status.checkout}</StatusChip>
                  <StatusChip tone="muted">
                    {unavailable ? "Benefits unavailable" : `${benefitCount} ${benefitNoun} published`}
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
                    href="#eligibility"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-[12.5px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D48C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a4028] motion-reduce:transition-none"
                  >
                    Check country eligibility
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
                      <dd className="text-right font-bold text-[#F2D48C]">{status.plan}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#b9d5bd]">Member benefits</dt>
                      <dd className="text-right font-bold text-white">{unavailable ? "Unavailable" : `${benefitCount} published`}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#b9d5bd]">Eligible countries</dt>
                      <dd className="text-right font-bold text-white">
                        {unavailable ? "Unavailable" : availableCountries.length === 0 ? "None yet" : `${availableCountries.length}`}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-white/10 pt-2 text-[10.5px] leading-4 text-[#b9d5bd]">
                    Status reflects the current server configuration.
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
              Your existing NaijaDeals sign-in is the identity a plan attaches to. No membership is attached by this page.
            </FactCard>
            <FactCard icon={<CircleOff className="h-5 w-5" aria-hidden="true" />} title={unavailable ? "Configuration unread" : "Plans come from the server"}>
              {unavailable
                ? "The Plus+ configuration could not be read for this request, so no plan or price can be confirmed."
                : data.flags.activePlanCount === 0
                  ? "No active plan, price, billing period or country eligibility has been approved."
                  : `${data.flags.activePlanCount} active ${data.flags.activePlanCount === 1 ? "plan is" : "plans are"} configured. This page does not start a checkout.`}
            </FactCard>
            <FactCard icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title="Standard stays standard">
              Ecosystem services are shown as services, never relabelled as Plus+ benefits. Marketplace configuration is not Plus+ eligibility.
            </FactCard>
          </ul>
        </section>

        <section id="how-it-works" aria-labelledby="plus-how-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-how-heading"
            eyebrow="How it works"
            title="Membership, step by step"
            description="Only the first step exists today. The rest are marked with their actual server state rather than hidden."
          />
          <ol className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
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
            <Step number="02" title="A plan is published" status={status.plan} tone={data.flags.membershipOpen ? "live" : "muted"}>
              {unavailable
                ? "Plan availability could not be read for this request. No price or country eligibility is asserted."
                : data.flags.activePlanCount === 0
                  ? "A plan must be activated and enabled for a country before it can be offered. A priced plan additionally needs approved, effective commercial terms."
                  : "At least one plan is active. Country cards below show where it is actually enabled; other countries remain not yet available."}
            </Step>
            <Step number="03" title="Billing and activation" status={status.checkout} tone="muted">
              There is no Plus+ subscription checkout, payment-method step or customer activation flow in this build. No account is upgraded by this page.
            </Step>
          </ol>
          <div className="mt-4 flex gap-3 rounded-xl border border-[#e5d3a2] bg-[#fffaf0] p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6412]" aria-hidden="true" />
            <p className="text-[12px] leading-6 text-[#5c4a1e]">
              <strong className="font-extrabold text-[#3f3010]">There is no join button because this build has no membership checkout.</strong>{" "}
              Until a plan, its terms and a payment path are approved, a button here could not complete a real subscription.
            </p>
          </div>
        </section>

        <section id="eligibility" aria-labelledby="plus-eligibility-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-eligibility-heading"
            eyebrow="Eligibility"
            title="Country and plan eligibility"
            description={
              unavailable
                ? "The Plus+ configuration could not be read. Country eligibility is unavailable, not assumed."
                : "Every country is listed with its actual Plus+ status. A country is Available only when an active plan is enabled for it and, if priced, has approved effective terms."
            }
            aside={!unavailable && data.countries.length > 0 ? <CountChip>{availableCountries.length} available</CountChip> : undefined}
          />
          <div className="mt-5">
            {unavailable ? (
              <div data-plus-unavailable className="flex gap-3 rounded-2xl border border-[#e5d3a2] bg-[#fffaf0] p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6412]" aria-hidden="true" />
                <div>
                  <p className="text-[12.5px] font-extrabold text-[#3f3010]">Plus+ configuration unavailable</p>
                  <p className="mt-1 text-[12px] leading-6 text-[#5c4a1e]">
                    The server could not read plan or country configuration for this request. That is not the same as every country being eligible, so
                    no country is marked Available.
                  </p>
                </div>
              </div>
            ) : (
              <PlusCountryGrid countries={data.countries} />
            )}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#4b5b51]">
            {unavailable
              ? "Eligibility is unread, not unconfigured. Marketplace country settings are never used as Plus+ eligibility."
              : availableCountries.length === 0
                ? "No active Plus+ plan is enabled in any country yet. Marketplace delivery or checkout settings are not Plus+ eligibility."
                : `Available: ${availableNames}. Other countries remain not yet available. Marketplace settings are not Plus+ eligibility.`}
          </p>
        </section>

        <section aria-labelledby="plus-awareness-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-awareness-heading"
            eyebrow="Awareness"
            title="What Plus+ is preparing"
            description="Published awareness cards from the Control Center, filtered by their current schedule, language and country scope. Each card carries the Plus+ readiness label from the audit, never the registry's blanket catalogue status."
            aside={<CountChip>{unavailable ? "Unavailable" : `${cardCount} ${cardCount === 1 ? "card" : "cards"}`}</CountChip>}
          />
          <div className="mt-5">
            {unavailable ? (
              <PlusEmptyState
                testId="awareness-unavailable"
                icon={<Info className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Configuration unread"
                title="Awareness cards are unavailable."
              >
                The server could not read published awareness content for this request. Nothing is invented to fill the section.
              </PlusEmptyState>
            ) : data.cards.length === 0 ? (
              <PlusEmptyState
                testId="awareness-empty"
                icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Awareness register · empty"
                title="No Plus+ awareness cards are published yet."
              >
                Cards appear here only after an authorised publisher publishes them for the current schedule and country scope. Standard NaijaDeals
                services are not Plus+ benefits.
              </PlusEmptyState>
            ) : (
              <PlusCarousel
                label="Plus+ awareness"
                hint={
                  cardCount === 1
                    ? "One published card. The rail shows arrows only when the cards do not fit."
                    : "Swipe, scroll or use the arrow keys to browse published cards. Arrows appear only when the cards do not fit; the rail does not auto-rotate."
                }
              >
                {data.cards.map((card) => (
                  <li key={card.id} className="w-[86%] min-w-0 flex-none snap-start sm:w-[48%] lg:w-[31.5%]">
                    <PlusAwarenessCard card={card} />
                  </li>
                ))}
              </PlusCarousel>
            )}
          </div>
          <p id="plus-readiness-note" className="mt-3 text-[11px] leading-5 text-[#4b5b51]">
            Readiness describes recorded verification of each service&apos;s software. <strong className="font-extrabold">Verified</strong> means a
            recorded executed suite covers the main journey; <strong className="font-extrabold">Available — limited verification</strong> means a
            decisive suite is stale or covers only part of the journey; <strong className="font-extrabold">Preview</strong> means no executed
            end-to-end result. A service without an audited entry shows <strong className="font-extrabold">Not assessed</strong>. This is not launch
            status, supply or country eligibility; Plus+ country eligibility comes only from approved plans above.
          </p>
        </section>

        <section aria-labelledby="plus-benefits-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-benefits-heading"
            eyebrow="Benefits"
            title="Plus+ member benefits"
            description={
              unavailable
                ? "Benefit availability could not be read for this request."
                : benefitCount === 0
                  ? "Only benefits published for an available plan appear here. This section is empty."
                  : "Only benefits published for an available plan appear here."
            }
            aside={<CountChip>{unavailable ? "Unavailable" : `${benefitCount} ${benefitNoun}`}</CountChip>}
          />
          <div className="mt-5">
            {unavailable ? (
              <PlusEmptyState
                testId="benefits-unavailable"
                icon={<Info className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Benefits unavailable"
                title="Benefits cannot be confirmed right now."
              >
                The server could not read the benefit register. No benefit is asserted, and no disabled carousel is shown.
              </PlusEmptyState>
            ) : data.benefits.length === 0 ? (
              <PlusEmptyState
                testId="benefits-empty"
                icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Benefits register · empty"
                title="No Plus+ member benefits are configured yet."
              >
                Standard NaijaDeals services are not Plus+ benefits. When a benefit is published for an available plan, it will appear
                here with its plan and eligible countries.
              </PlusEmptyState>
            ) : (
              <PlusCarousel
                label="Plus+ member benefits"
                hint="Swipe, scroll or use the arrow keys to browse approved benefits. Arrows appear only when the cards do not fit."
              >
                {data.benefits.map((benefit) => (
                  <li key={benefit.id} className="w-[86%] min-w-0 flex-none snap-start sm:w-[48%] lg:w-[31.5%]">
                    <PlusBenefitCard benefit={benefit} />
                  </li>
                ))}
              </PlusCarousel>
            )}
          </div>
        </section>

        <section aria-labelledby="plus-promotions-heading" className={SECTION_PAD}>
          <SectionHeading
            id="plus-promotions-heading"
            eyebrow="Offers and announcements"
            title="Approved promotions"
            description="House promotions and sponsored placements appear only after the required approval and publication steps. Sponsored cards always carry their disclosure label."
            aside={<CountChip>{unavailable ? "Unavailable" : `${promotionCount}`}</CountChip>}
          />
          <div className="mt-5">
            {unavailable ? (
              <PlusEmptyState
                testId="promotions-unavailable"
                icon={<Info className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Promotions unavailable"
                title="Promotions cannot be confirmed right now."
              >
                The server could not read published promotions. No sponsor, offer or announcement is invented.
              </PlusEmptyState>
            ) : data.promotions.length === 0 ? (
              <PlusEmptyState
                testId="promotions-empty"
                icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
                eyebrow="Promotions · none"
                title="No promotions are published right now."
              >
                There is no house announcement or sponsored placement in the current schedule.
              </PlusEmptyState>
            ) : (
              <PlusCarousel
                label="Plus+ promotions"
                hint="Swipe, scroll or use the arrow keys to browse promotions. Sponsored content is labelled. Arrows appear only when the cards do not fit."
              >
                {data.promotions.map((promotion) => (
                  <li key={promotion.id} className="w-[86%] min-w-0 flex-none snap-start sm:w-[48%] lg:w-[31.5%]">
                    <PlusPromotionCard promotion={promotion} />
                  </li>
                ))}
              </PlusCarousel>
            )}
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
                  This is the complete public register. A benefit can only move into it after publication for an available plan, and it must name the plan it belongs to.
                </p>
              </div>
              <CountChip>Current server state</CountChip>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <RegisterCard
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                label="Member benefits"
                value={unavailable ? "Unavailable" : `${benefitCount} published`}
                body="No benefit is created by visiting this page."
              />
              <RegisterCard
                icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
                label="Plans and prices"
                value={status.plan}
                body="Priced plans need approved, effective terms before activation."
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
            description="The rest of the ecosystem has its own pricing and terms. Opening a service does not create a Plus+ membership."
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#dbe6d8] bg-white p-5">
              <h3 className="font-display text-[18px] font-extrabold leading-tight">Real services, separate from Plus+</h3>
              <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
                Marketplace, rides, food, deliveries, services, stays and the rest of the ecosystem operate on their own published terms. They are not
                included with this membership.
              </p>
              <Link
                href="/#services"
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#07351f] px-4 py-2 text-[12px] font-extrabold text-white transition hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                See the service directory
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
            <div className="rounded-2xl border border-[#dbe6d8] bg-white p-5">
              <h3 className="font-display text-[18px] font-extrabold leading-tight">Continue to the marketplace</h3>
              <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
                Browse the marketplace on its current terms. Nothing here changes an existing order, wallet or service agreement.
              </p>
              <Link
                href="/naijashop"
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#cbdacb] bg-white px-4 py-2 text-[12px] font-extrabold text-[#14241b] transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Go to NaijaShop
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </div>
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
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#F2D48C]">No payment. No signup.</p>
              <h2 id="plus-close-heading" className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">
                {unavailable ? "Membership status is unavailable." : data.flags.membershipOpen ? "Membership is open where shown." : "Membership is not open yet."}
              </h2>
              <p className="mt-2 text-[12.5px] leading-6 text-[#d6e7d7]">
                {unavailable
                  ? "The Plus+ configuration could not be read for this request. No country is marked eligible and no plan is asserted."
                  : data.flags.membershipOpen
                    ? "A plan is enabled for at least one country, but this page still has no checkout. Opening a service does not create a Plus+ membership."
                    : "There is nothing to buy and nothing to opt in to. Keep using the marketplace and the other services on their current terms; this page changes only when an approved plan exists."}
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
          <p className="mt-3 text-[10.5px] text-[#4b5b51]">Status reflects the current server configuration, not a static page build.</p>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
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
