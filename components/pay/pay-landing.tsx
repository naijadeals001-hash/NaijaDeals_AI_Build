"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  QrCode,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  Zap
} from "lucide-react";
import { apiClient, ApiRequestError, koboToNaira } from "@/lib/api-client";

type WalletData = {
  availableKobo?: string | number;
  heldKobo?: string | number;
  currency?: string;
  transactions?: Array<{ id: string; description: string; type: string; reference: string; amountKobo: string | number }>;
  escrowHolds?: Array<{ id: string; amountKobo: string | number; status: string }>;
};

/**
 * Live wallet summary fed by /api/wallet. Signed-out visitors see a sign-in
 * card; signed-in visitors see their real ledger-backed balance, held escrow
 * and latest transactions. Nothing is fabricated: empty wallets show empty
 * states, and API failures show an honest error with a retry.
 */
function WalletCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [balanceVisible, setBalanceVisible] = useState(true);

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

  if (status === "signed-out") {
    return (
      <div className="rounded-3xl bg-pay-deep p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Your wallet</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">One balance across NaijaDeals</h2>
        <p className="mt-2 max-w-md text-sm text-white/70">
          Sign in to see your real NaijaPay balance, escrow holds and transaction history. Shop checkout, ride payments
          and refunds all settle into this same wallet.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/login?next=/pay"
            className="rounded-xl bg-pay-gold px-5 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
          >
            Sign in to NaijaPay
          </Link>
          <Link
            href="/register?next=/pay"
            className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
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
          className="mt-4 rounded-xl bg-pay-green px-4 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="animate-pulse rounded-3xl bg-pay-deep p-6 sm:p-8" aria-busy="true" aria-label="Loading wallet">
        <div className="h-3 w-24 rounded bg-white/20" />
        <div className="mt-4 h-8 w-48 rounded bg-white/20" />
        <div className="mt-3 h-4 w-64 max-w-full rounded bg-white/10" />
        <div className="mt-5 h-11 w-40 rounded-xl bg-white/20" />
      </div>
    );
  }

  const openEscrow = (wallet.escrowHolds ?? []).filter((hold) => hold.status === "held" || hold.status === "disputed");
  const heldKobo = openEscrow.reduce((total, hold) => total + Number(hold.amountKobo ?? 0), 0);
  const recent = (wallet.transactions ?? []).slice(0, 3);
  const currency = wallet.currency ?? "NGN";

  return (
    <div className="rounded-3xl bg-pay-deep p-6 text-white sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Available balance</p>
          <div className="mt-1 flex items-center gap-3">
            <p className="font-display text-3xl font-extrabold sm:text-4xl" aria-live="polite">
              {balanceVisible ? koboToNaira(String(wallet.availableKobo ?? 0), currency) : "₦ ••••••"}
            </p>
            <button
              type="button"
              onClick={() => setBalanceVisible((visible) => !visible)}
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

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/wallet"
          className="rounded-xl bg-pay-gold px-5 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
        >
          Open full wallet
        </Link>
        <Link
          href="/wallet"
          className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
        >
          Add money
        </Link>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">Recent activity</p>
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

/**
 * Add Money panel fed by /api/payments/methods. Providers are listed only as
 * the server reports them configured; when nothing is configured the panel
 * says so instead of offering a fake top-up.
 */
function AddMoneyPanel() {
  const [methods, setMethods] = useState<Array<{ id: string; label: string; configured: boolean; supportsCountry: boolean; reason?: string }> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/payments/methods?country=NG&all=true")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Unable to load payment methods."))))
      .then((data) => {
        setMethods(data.methods ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const fundingMethods = (methods ?? []).filter((m) => m.id !== "wallet");

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft sm:p-8">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-pay-green" aria-hidden="true" />
        <h3 className="font-display text-xl font-extrabold">Add money</h3>
      </div>
      {status === "loading" && <div className="mt-4 h-16 animate-pulse rounded-xl bg-pay-mint" aria-busy="true" />}
      {status === "error" && (
        <p className="mt-3 text-sm text-pay-ink-muted">
          Payment providers could not be checked right now. Try again in a moment — nothing is charged from this panel.
        </p>
      )}
      {status === "ready" && (
        <>
          {fundingMethods.length === 0 && (
            <p className="mt-3 text-sm text-pay-ink-muted">
              No card or transfer provider is available in this environment yet. Top-up opens as soon as a verified
              provider is configured — the panel never simulates a deposit.
            </p>
          )}
          {fundingMethods.length > 0 && (
            <ul className="mt-4 space-y-2">
              {fundingMethods.map((method) => (
                <li key={method.id} className="flex items-start justify-between gap-3 rounded-xl border border-black/5 p-3">
                  <div>
                    <p className="text-sm font-bold">{method.label}</p>
                    <p className="text-xs text-pay-ink-muted">{method.reason ?? "Available for wallet top-up."}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      method.configured && method.supportsCountry ? "bg-pay-green text-white" : "bg-pay-mint text-pay-ink-muted"
                    }`}
                  >
                    {method.configured && method.supportsCountry ? "Ready" : "Not configured"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-pay-ink-muted">
            Card and bank top-ups settle through signature-verified provider webhooks into the same ledger-backed wallet.
          </p>
        </>
      )}
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
    image: "/real-photography/module-wallet.jpg",
    imageAlt: "Nigerian naira notes arranged in a fan",
    live: true,
    href: "/wallet"
  },
  {
    title: "Merchant payments",
    body: "Pay verified NaijaShop vendors with escrow protection on every eligible order.",
    icon: Landmark,
    image: "/real-photography/NaijaFresh Nigerian Market Stall.jpg",
    imageAlt: "A Nigerian market stall with fresh produce",
    live: true,
    href: "/naijashop"
  },
  {
    title: "Ride payments",
    body: "NaijaDrive fares can be paid straight from your NaijaPay wallet or in cash.",
    icon: Smartphone,
    image: "/brand-photography/drive-sedan-lagos.jpg",
    imageAlt: "A sedan on a Lagos street",
    live: true,
    href: "/naijadrive"
  },
  {
    title: "Send & receive",
    body: "Wallet-to-wallet transfers are built and pass financial-safety tests; they stay switched off here until enabled for this environment.",
    icon: Send,
    image: "/brand-photography/aura-concierge-lagos.jpg",
    imageAlt: "A customer using an app on her phone in Lagos",
    live: false,
    href: "/pay#setup"
  },
  {
    title: "Bills & airtime",
    body: "Airtime, data, electricity and TV payments arrive only when real bill providers are connected — never simulated.",
    icon: Receipt,
    image: "/brand-photography/eats-jollof-delivery.jpg",
    imageAlt: "A Nigerian meal being delivered",
    live: false,
    href: "/pay#setup"
  },
  {
    title: "Scan & pay",
    body: "QR merchant payments are planned on the same ledger. Disabled until merchant QR issuance is live.",
    icon: QrCode,
    image: "/brand-photography/fresh-market-groceries.jpg",
    imageAlt: "Fresh groceries packed for a customer",
    live: false,
    href: "/pay#setup"
  }
];

export function PayLanding() {
  return (
    <div className="bg-white text-pay-ink">
      {/* Hero */}
      <section className="relative overflow-hidden bg-pay-deep">
        <img
          src="/real-photography/hero-ecosystem.jpg"
          alt="Lagos skyline over the water at dusk"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-pay-deep via-pay-deep/80 to-pay-deep/30" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-pay-gold/40 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-pay-gold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> NaijaPay by NaijaDeals
          </p>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            Your Money. A Brighter Nigeria.
          </h1>
          <p className="mt-3 text-lg font-semibold text-pay-gold sm:text-xl">Pay. Send. Receive. Do More.</p>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
            NaijaPay is the wallet at the centre of the NaijaDeals ecosystem. One balance for shopping, rides, refunds
            and escrow — every naira backed by a balanced ledger entry.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/login?next=/pay"
              className="rounded-xl bg-pay-gold px-6 py-3.5 text-sm font-bold text-pay-ink shadow-lift transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
            >
              Get started with NaijaPay
            </Link>
            <a
              href="#services"
              className="rounded-xl border border-white/30 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
            >
              Explore services
            </a>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Why NaijaPay" className="border-b border-pay-mint bg-pay-mint">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-4">
          {[
            { icon: Lock, label: "Secure payments", body: "Signature-verified provider webhooks" },
            { icon: Zap, label: "Fast checkout", body: "One wallet across every vertical" },
            { icon: ShieldCheck, label: "Escrow protected", body: "Funds held until delivery is confirmed" },
            { icon: Banknote, label: "Balanced ledger", body: "Every entry reconciles debit for credit" }
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-pay-green" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">{item.label}</p>
                <p className="text-xs text-pay-ink-muted">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live wallet + services */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0" aria-label="Your NaijaPay wallet">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Your wallet, live</h2>
            <p className="mt-1 text-sm text-pay-ink-muted">Real figures from your account — nothing simulated.</p>
            <div className="mt-4">
              <WalletCard />
            </div>
            <div className="mt-4">
              <AddMoneyPanel />
            </div>
          </div>

          <div id="services" className="min-w-0">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Services</h2>
            <p className="mt-1 text-sm text-pay-ink-muted">
              Live services connect to the shared NaijaDeals payment engine today. Others stay honestly labelled until
              their providers and safety gates are in place.
            </p>
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
      </section>

      {/* Business band */}
      <section className="bg-pay-mint">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
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
                className="rounded-xl bg-pay-green px-5 py-3 text-sm font-bold text-white transition hover:bg-pay-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                Become a seller
              </Link>
              <Link
                href="/seller"
                className="rounded-xl border border-pay-green/30 px-5 py-3 text-sm font-bold text-pay-green transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
              >
                Seller dashboard
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-soft">
            <img
              src="/real-photography/NaijaFresh Nigerian Market Stall.jpg"
              alt="A Nigerian market vendor's stall stocked with produce"
              loading="lazy"
              className="h-56 w-full object-cover sm:h-72"
            />
          </div>
        </div>
      </section>

      {/* Setup honesty section */}
      <section id="setup" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
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
                Built and covered by idempotency, concurrency and reconciliation tests; disabled until the environment
                flag is switched on with authorisation.
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
