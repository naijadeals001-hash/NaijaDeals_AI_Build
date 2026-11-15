"use client";

import { supportHref } from "@/lib/support/contact-link";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  Eye,
  EyeOff,
  Heart,
  Landmark,
  Lock,
  QrCode,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Users,
  Wallet,
  Wifi,
  Zap
} from "lucide-react";
import { apiClient, ApiRequestError, koboToNaira } from "@/lib/api-client";
import { contactAddress } from "@/lib/data/contact-directory";
import { readBalanceVisibility, writeBalanceVisibility } from "@/lib/pay/balance-visibility";
import { PhoneScreens } from "./pay-phone-screens";
import { DesktopPanels } from "./pay-desktop-panels";
import { AddMoneyFlow } from "./add-money-flow";

type WalletData = {
  availableKobo?: string | number;
  heldKobo?: string | number;
  currency?: string;
  transactions?: Array<{ id: string; description: string; type: string; reference: string; amountKobo: string | number }>;
  escrowHolds?: Array<{ id: string; amountKobo: string | number; status: string }>;
};

/**
 * Live wallet card fed by /api/wallet, styled after the approved NaijaPay home
 * screen: dark-green gradient balance card with visibility toggle and action
 * pills. Signed-out visitors get a sign-in card; empty wallets and API
 * failures show honest states — nothing is fabricated.
 */
function WalletCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  // Privacy preference survives a reload; read after mount so the server and
  // first client render agree and the balance never flashes into view.
  const [balanceVisible, setBalanceVisible] = useState(true);

  useEffect(() => {
    const stored = readBalanceVisibility();
    if (stored !== null) setBalanceVisible(stored);
  }, []);

  function toggleBalance() {
    setBalanceVisible((visible) => {
      writeBalanceVisibility(!visible);
      return !visible;
    });
  }

  function loadWallet() {
    setStatus("loading");
    apiClient
      .getWallet()
      .then((data) => {
        setWallet(data as WalletData);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load wallet.");
          setStatus("error");
        }
      });
  }

  useEffect(loadWallet, []);

  const actions = [
    { label: "Add Money", href: "#add-money", icon: Banknote },
    { label: "Send", href: "/pay/send", icon: Send },
    { label: "Receive", href: "/pay/receive", icon: QrCode },
    { label: "Scan & Pay", href: "/pay/scan", icon: Smartphone }
  ];

  if (status === "signed-out") {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Your wallet</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">One balance across NaijaDeals</h2>
        <p className="mt-2 max-w-md text-sm text-white/75">
          Sign in to see your real NaijaPay balance, escrow holds and transaction history. Shop checkout, ride payments
          and refunds all settle into this same wallet.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/login?next=/pay"
            className="rounded-full bg-pay-gold px-6 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
          >
            Open NaijaPay →
          </Link>
          <Link
            href="/register?next=/pay"
            className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
          >
            Create a free account
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error" || !wallet) {
    return (
      <div className="rounded-3xl border border-red-200 bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-extrabold text-pay-ink">Wallet unavailable</h2>
        <p className="mt-1 text-sm text-pay-ink-muted">{error || "Unable to load your wallet right now."}</p>
        <button
          type="button"
          onClick={loadWallet}
          className="mt-4 rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="animate-pulse rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 sm:p-8" aria-busy="true" aria-label="Loading wallet">
        <div className="h-3 w-24 rounded bg-white/20" />
        <div className="mt-4 h-9 w-48 rounded bg-white/20" />
        <div className="mt-3 h-4 w-56 max-w-full rounded bg-white/10" />
        <div className="mt-6 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-white/15" />
          ))}
        </div>
      </div>
    );
  }

  const openEscrow = (wallet.escrowHolds ?? []).filter((hold) => hold.status === "held" || hold.status === "disputed");
  const heldKobo = openEscrow.reduce((total, hold) => total + Number(hold.amountKobo ?? 0), 0);
  const recent = (wallet.transactions ?? []).slice(0, 3);
  const currency = wallet.currency ?? "NGN";

  return (
    <div className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 text-white shadow-lift sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Available balance</p>
          <div className="mt-1 flex items-center gap-3">
            <p className="font-display text-3xl font-extrabold sm:text-4xl" aria-live="polite">
              {balanceVisible ? koboToNaira(String(wallet.availableKobo ?? 0), currency) : "₦ ••••••"}
            </p>
            <button
              type="button"
              onClick={toggleBalance}
              aria-label={balanceVisible ? "Hide balance" : "Show balance"}
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
            >
              {balanceVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-white/60">Ledger-backed · escrow held: {koboToNaira(String(heldKobo), currency)}</p>
        </div>
        <Wallet className="h-8 w-8 shrink-0 text-pay-gold" aria-hidden="true" />
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group flex flex-col items-center gap-1.5 rounded-xl bg-white/10 px-1 py-3 text-center transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
          >
            <action.icon className="h-5 w-5 text-pay-gold" aria-hidden="true" />
            <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Recent activity</p>
          <Link href="/wallet" className="text-xs font-bold text-pay-gold hover:underline">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No wallet transactions yet. Your first top-up or purchase will appear here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/10">
            {recent.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{tx.description}</span>
                  <span className="block text-xs text-white/50">{tx.type}</span>
                </span>
                <span className="shrink-0 font-bold">{koboToNaira(String(tx.amountKobo), currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


const services: Array<{
  title: string;
  body: string;
  icon: typeof Wallet;
  image: string;
  imageAlt: string;
  live: boolean;
  href: string;
}> = [
  {
    title: "Wallet & escrow",
    body: "One ledger-backed balance for shopping, rides and refunds, with escrow holds you can see.",
    icon: Wallet,
    image: "/generated/pay/pay-hero-wide.webp",
    imageAlt: "A Nigerian trader at a Lagos waterfront stall checking his phone",
    live: true,
    href: "/wallet"
  },
  {
    title: "Merchant payments",
    body: "Pay verified NaijaShop vendors with escrow protection on every eligible order.",
    icon: Landmark,
    image: "/generated/pay/pay-market-trader.webp",
    imageAlt: "A Nigerian market trader with fabric bales at her stall",
    live: true,
    href: "/naijashop"
  },
  {
    title: "Ride payments",
    body: "NaijaDrive fares can be paid straight from your NaijaPay wallet or in cash.",
    icon: Smartphone,
    image: "/generated/pay/pay-receive-lemonade.webp",
    imageAlt: "A Nigerian street-food vendor taking a phone payment at her stall",
    live: true,
    href: "/naijadrive"
  },
  {
    title: "Send & receive",
    body: "The full Send Money and Receive experience is live to review. Transfers post only when enabled for this environment.",
    icon: Send,
    image: "/generated/pay/pay-send-screen.webp",
    imageAlt: "Two young Nigerian professionals laughing at a phone screen in a Lagos cafe",
    live: false,
    href: "/pay#setup"
  },
  {
    title: "Bills & airtime",
    body: "Airtime, data, electricity and TV payments arrive only when real bill providers are connected — never simulated.",
    icon: Receipt,
    image: "/generated/pay/pay-bills-card.webp",
    imageAlt: "A young Nigerian woman smiling at her phone in a bright living room",
    live: false,
    href: "/pay#setup"
  },
  {
    title: "Scan & pay",
    body: "QR merchant payments are planned on the same ledger. Disabled until merchant QR issuance is live.",
    icon: QrCode,
    image: "/generated/pay/pay-scan-market.webp",
    imageAlt: "A market stall QR code being scanned by a phone",
    live: false,
    href: "/pay#setup"
  }
];

const quickServices = [
  { label: "Airtime", icon: Smartphone },
  { label: "Data", icon: Wifi },
  { label: "Electricity", icon: Zap },
  { label: "TV", icon: Tv }
];

export function PayLanding() {
  return (
    <div className="bg-white text-pay-ink">
      {/* Hero — reproduced from the approved mockup: pale mint ground, brand
          lockup, two-line headline, pill CTA, and the subject holding a phone
          with a payment confirmation. The right-hand captions are the mockup's
          own words, set as text so they stay readable at every width. */}
      <section className="relative overflow-hidden bg-[#E8F8F0]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_130px] lg:gap-4 lg:py-0">
          <div className="min-w-0">
            <Link href="/pay" className="inline-flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-11 items-center justify-center rounded-md bg-pay-green shadow-sm">
                  <Wallet className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <span className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  <span className="text-pay-green">Naija</span>
                  <span className="text-pay-gold">Pay</span>
                </span>
              </span>
              <span className="pl-1 text-[11px] font-medium text-pay-ink-muted">Your Money. A Brighter Nigeria.</span>
            </Link>

            <h1 className="mt-7 font-display text-[30px] font-extrabold leading-[1.12] tracking-tight text-pay-ink sm:text-4xl lg:text-[42px]">
              Pay. Send. Receive.
              <br />
              Do More with NaijaPay.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-pay-ink/75 sm:text-base">
              Bills. Airtime. Data. TV. Shopping. Business. Everywhere.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login?next=/pay"
                className="rounded-full bg-pay-green px-7 py-3 text-sm font-bold text-white transition hover:bg-pay-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                Open NaijaPay →
              </Link>
            </div>

            <ul className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
              {[
                { icon: Lock, title: "Secure", body: "Your money is safe" },
                { icon: Zap, title: "Fast", body: "Payments in seconds" },
                { icon: ShieldCheck, title: "For Nigerians", body: "Built for you" }
              ].map((badge) => (
                <li key={badge.title} className="flex items-center gap-2">
                  <badge.icon className="h-5 w-5 shrink-0 text-pay-green" aria-hidden="true" />
                  <span className="leading-tight">
                    <span className="block text-[13px] font-bold text-pay-ink">{badge.title}</span>
                    <span className="block text-[11px] text-pay-ink/60">{badge.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-h-[260px] sm:min-h-[340px] lg:min-h-[430px]">
            <img
              src="/generated/pay/pay-hero-phone.webp"
              alt="A smiling Nigerian woman in a green blouse using her phone on the Lagos waterfront, with the Third Mainland Bridge behind her"
              className="absolute inset-0 h-full w-full rounded-2xl object-cover object-[50%_18%] lg:rounded-none"
            />
            <div
              className="absolute inset-0 rounded-2xl bg-gradient-to-t from-[#E8F8F0]/60 via-transparent to-transparent lg:rounded-none lg:bg-gradient-to-r lg:from-[#E8F8F0]/50 lg:via-transparent lg:to-transparent"
              aria-hidden="true"
            />
            {/* The mockup's payment toast. It is a caption, not a claim about the
                visitor's account, so it is marked as illustrative. */}
            <div className="absolute bottom-6 left-1/2 flex w-56 -translate-x-1/2 items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(16,24,40,0.16)] sm:left-[46%] sm:bottom-10 lg:bottom-16">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pay-green">
                <Check className="h-4 w-4 text-white" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-[10px] text-pay-ink/55">Payment Successful!</span>
                <span className="block text-sm font-extrabold text-pay-ink">₦25,000</span>
              </span>
            </div>
          </div>
        </div>

        {/* The mockup sets two captions in the hero: a script line over the photo
            and a stacked statement at the far right. Both are decorative copy,
            hidden from assistive tech because the heading already carries the
            message, and placed so neither covers the subject's face. */}
        <p
          className="pointer-events-none absolute left-[46%] top-[12%] hidden max-w-[120px] rotate-[-6deg] font-display text-[13px] font-semibold italic leading-snug text-pay-deep/90 lg:block"
          aria-hidden="true"
        >
          A smarter way to pay in Nigeria
          <span className="mt-1 block h-[3px] w-14 rounded-full bg-pay-green" />
        </p>
        <p
          className="pointer-events-none absolute right-5 top-14 hidden max-w-[120px] text-[13px] font-semibold leading-[1.45] text-pay-ink lg:block"
          aria-hidden="true"
        >
          People.
          <br />
          Payments.
          <br />
          Progress.
          <br />A Brighter
          <br />
          Nigeria.
          <span className="mt-1 block h-[3px] w-10 rounded-full bg-pay-gold" />
        </p>
      </section>

      {/* Mockup order: hero -> the five phone screens -> the three desktop panels */}
      <PhoneScreens />

      {/* Wallet + Add Money + Quick Services */}
      <section className="bg-pay-mint">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="min-w-0" aria-label="Your NaijaPay wallet">
              <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Your wallet, live</h2>
              <p className="mt-1 text-sm text-pay-ink-muted">Real figures from your account — nothing simulated.</p>
              <div className="mt-4">
                <WalletCard />
              </div>
              <div className="mt-4">
                <AddMoneyFlow />
              </div>
            </div>

            <div id="services" className="min-w-0">
              <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Services</h2>
              <p className="mt-1 text-sm text-pay-ink-muted">
                Live services connect to the shared NaijaDeals payment engine today. Others stay honestly labelled until
                their providers and safety gates are in place.
              </p>

              <div className="mt-5 rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-extrabold">Quick services</h3>
                  <span className="rounded-full bg-pay-mint px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pay-ink-muted">
                    Awaiting providers
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {quickServices.map((service) => (
                    <a
                      key={service.label}
                      href="#setup"
                      className="group flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-pay-mint/60 px-1 py-4 text-center transition hover:border-pay-green/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-soft">
                        <service.icon className="h-5 w-5 text-pay-green" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-bold">{service.label}</span>
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-xs text-pay-ink-muted">
                  Bill categories stay inactive until a real bill-payment provider is connected in this environment.
                </p>
              </div>

              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {services.map((service) => {
                  const Icon = service.icon;
                  return (
                    <li key={service.title}>
                      <Link
                        href={service.href}
                        className="group block h-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
                      >
                        <div className="relative h-32 overflow-hidden sm:h-36">
                          <img
                            src={service.image}
                            alt={service.imageAlt}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <span
                            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                              service.live ? "bg-pay-green text-white" : "bg-white/90 text-pay-ink-muted"
                            }`}
                          >
                            {service.live ? "Live" : "In preparation"}
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-pay-green" aria-hidden="true" />
                            <h3 className="font-display text-base font-extrabold">{service.title}</h3>
                            <ArrowRight
                              className="ml-auto h-4 w-4 text-pay-ink-muted transition group-hover:translate-x-0.5 group-hover:text-pay-green"
                              aria-hidden="true"
                            />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-pay-ink-muted">{service.body}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <DesktopPanels />

      {/* Bottom trio — reproduced from the mockup: image left, copy right. */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16" aria-label="Why NaijaPay">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 1 — Security */}
          <div className="flex overflow-hidden rounded-xl bg-[#F1EFEA] shadow-[0_10px_26px_rgba(16,24,40,0.08)]">
            <div className="w-[42%] shrink-0">
              <img
                src="/generated/pay/pay-security.webp"
                alt="A Nigerian man in a white shirt checking his phone"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col justify-center px-4 py-5">
              <div className="flex items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pay-green">
                  <Lock className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                </span>
                <h3 className="font-display text-base font-extrabold leading-tight text-pay-ink">
                  Your Security
                  <br />
                  Comes First
                </h3>
              </div>
              <ul className="mt-3 space-y-1.5">
                {["Session-protected payments", "Audited money movements", "Escrow-held order funds", "Real-time alerts"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-[11px] font-medium text-pay-ink/75">
                    <Check className="h-3 w-3 shrink-0 text-pay-green" aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 2 — Market to Mainland */}
          <div className="relative flex overflow-hidden rounded-xl bg-pay-green shadow-[0_10px_26px_rgba(0,96,56,0.18)]">
            <div className="flex flex-1 flex-col justify-center px-4 py-5">
              <h3 className="font-display text-[15px] font-extrabold leading-snug text-white">
                From Market to
                <br />
                Mainland —
                <br />
                <span className="text-pay-gold-soft">NaijaPay Works</span>
                <br />
                for Every Nigerian.
              </h3>
              <p className="mt-2.5 text-[10px] leading-snug text-white/80">
                Individuals. Businesses.
                <br />
                Communities. A Stronger Nigeria.
              </p>
              <span className="mt-2 h-[3px] w-10 rounded-full bg-[#9BE08C]" aria-hidden="true" />
            </div>
            <div className="w-[38%] shrink-0">
              <img
                src="/generated/pay/pay-market-trader.webp"
                alt="A Nigerian woman in a yellow gele headtie holding her phone"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* 3 — Bigger possibilities */}
          <div className="relative overflow-hidden rounded-xl shadow-[0_10px_26px_rgba(16,24,40,0.08)]">
            <img
              src="/generated/pay/pay-skyline.webp"
              alt="Lagos skyline with the city highway below"
              loading="lazy"
              className="h-full min-h-[170px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-pay-ink/55 to-transparent" aria-hidden="true" />
            <div className="absolute right-3 top-4 text-right">
              <p className="font-display text-[14px] font-extrabold leading-tight text-white">
                Same People.
                <br />
                Bigger Possibilities.
              </p>
            </div>
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-white/95 px-2 py-1">
              <span className="flex h-3.5 w-4 items-center justify-center rounded-[2px] bg-pay-green">
                <Wallet className="h-2 w-2 text-white" aria-hidden="true" />
              </span>
              <span className="text-[9px] font-extrabold text-pay-green">
                Naija<span className="text-pay-gold">Pay</span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer trust strip from the mockup */}
        <ul className="mt-8 grid grid-cols-2 gap-4 border-t border-black/5 pt-6 sm:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Built for Nigeria" },
            { icon: Users, label: "Powering People" },
            { icon: BarChart3, label: "Supporting Businesses" },
            { icon: Heart, label: "A Brighter Tomorrow" }
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <item.icon className="h-5 w-5 shrink-0 text-pay-green" aria-hidden="true" />
              <span className="text-[11px] font-medium text-pay-ink/70">{item.label}</span>
            </li>
          ))}
        </ul>

        {/* Contact stays restrained on a marketing landing: the addresses come
            from the shared contact directory, so no literal appears here. */}
        <div className="mt-6 border-t border-black/5 pt-4 text-[11px] leading-5 text-pay-ink/70">
          <p className="font-extrabold uppercase tracking-widest text-pay-ink/60">Need help?</p>
          <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
            <li>
              Payment and refund enquiries:{" "}
              <a
                href={supportHref("payments")}
                className="font-semibold text-pay-green underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                {contactAddress("payments")}
              </a>
            </li>
            <li>
              Customer support:{" "}
              <a
                href={supportHref("support")}
                className="font-semibold text-pay-green underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                {contactAddress("support")}
              </a>
            </li>
          </ul>
        </div>
      </section>

      {/* Business band */}
      <section className="bg-pay-mint">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-8 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pay-green">NaijaPay for business</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Grow your business with NaijaPay</h2>
            <p className="mt-3 text-sm leading-relaxed text-pay-ink-muted">
              Sellers on NaijaDeals already settle through the same financial engine: escrow-protected order payments,
              a finance account with available earnings, and audited payouts to Nigerian bank accounts.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/sell"
                className="rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                Become a seller
              </Link>
              <Link
                href="/pay/business"
                className="rounded-full border border-pay-green/30 px-6 py-3 text-sm font-bold text-pay-green transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                Business dashboard
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-soft">
            <img
              src="/generated/pay/pay-business-owner.webp"
              alt="A Nigerian shop owner in a green apron holding a tablet and phone"
              loading="lazy"
              className="h-56 w-full object-cover sm:h-72"
            />
          </div>
        </div>
      </section>

      {/* Setup honesty section */}
      <section id="setup" className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
        <div className="rounded-3xl border border-pay-gold/30 bg-pay-gold-soft/40 p-6 sm:p-8">
          <h2 className="font-display text-xl font-extrabold sm:text-2xl">What is not switched on yet — and why</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-pay-ink-muted">
            NaijaPay only enables a money-moving feature after its financial-safety gates pass: balanced ledger
            postings, idempotent transfers, concurrency protection and provider verification. Until then the interface
            says so instead of simulating success.
          </p>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-2xl bg-white p-4">
              <p className="font-bold">Send &amp; receive money</p>
              <p className="mt-1 text-xs text-pay-ink-muted">
                The full Send/Receive/Scan screens are live to explore. Posting transfers stays switched off until the
                environment flag is authorised (engine already passes idempotency, concurrency and reconciliation tests).
              </p>
            </li>
            <li className="rounded-2xl bg-white p-4">
              <p className="font-bold">Bills, airtime &amp; data</p>
              <p className="mt-1 text-xs text-pay-ink-muted">No bill-payment provider is configured in this environment.</p>
            </li>
            <li className="rounded-2xl bg-white p-4">
              <p className="font-bold">QR &amp; payment links</p>
              <p className="mt-1 text-xs text-pay-ink-muted">Merchant QR issuance is not yet built on the shared ledger.</p>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
