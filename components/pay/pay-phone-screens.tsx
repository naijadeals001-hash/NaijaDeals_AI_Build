"use client";

import Link from "next/link";
import {
  Banknote,
  LayoutGrid,
  Lock,
  QrCode,
  Receipt,
  ScanLine,
  Send,
  Smartphone,
  Tv,
  Wallet,
  Wifi,
  Zap
} from "lucide-react";

/**
 * The five phone previews from the approved NaijaPay mockup.
 *
 * These are *illustrations of the screens that exist in this app*, drawn in DOM
 * rather than pasted as images, so they stay sharp at any size and keep working
 * with keyboard and screen readers. Every figure inside them is labelled as a
 * preview: real balances live on /wallet, and showing a fake ₦125,450 as if it
 * were the visitor's money would be exactly the fabricated state the project
 * rules forbid.
 */

const PREVIEW_PLACEHOLDER = "••••••";

type ScreenProps = { className?: string };

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex w-[186px] shrink-0 snap-start flex-col items-center lg:w-[200px] xl:w-[210px]">
      <div
        className="relative w-full overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-[0_16px_36px_rgba(16,24,40,0.14)]"
        role="img"
        aria-label={`${label} screen preview`}
      >
        {/* status bar */}
        <div className="flex items-center justify-between px-3 pb-0.5 pt-2 text-[8px] font-semibold text-pay-ink/70">
          <span>9:41</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="inline-block h-1.5 w-2.5 rounded-[1px] bg-pay-ink/40" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-pay-ink/40" />
            <span className="inline-block h-1.5 w-2 rounded-[1px] bg-pay-ink/40" />
          </span>
        </div>
        <div className="h-[318px] px-3 pb-2" aria-hidden="true">
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-[13px] font-semibold text-pay-ink">{label}</figcaption>
    </figure>
  );
}

function BrandMark({ sizes = "sm" }: { sizes?: "sm" | "xs" }) {
  return (
    <div className={`flex items-center gap-1 ${sizes === "xs" ? "text-[9px]" : "text-[10px]"}`}>
      <span className="flex h-4 w-5 items-center justify-center rounded-[3px] bg-pay-green">
        <Wallet className="h-2.5 w-2.5 text-white" />
      </span>
      <span className="font-display font-extrabold text-pay-green">
        Naija<span className="text-pay-gold">Pay</span>
      </span>
    </div>
  );
}

function BalanceCard() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-pay-deep to-pay-green p-2.5 text-white">
      <div className="flex items-center justify-between text-[8px] text-white/75">
        <span>Available Balance</span>
        <Lock className="h-2.5 w-2.5" />
      </div>
      <p className="mt-0.5 font-display text-[15px] font-extrabold leading-tight">{PREVIEW_PLACEHOLDER}</p>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[
          { icon: Banknote, label: "Add" },
          { icon: Send, label: "Send" },
          { icon: QrCode, label: "Receive" },
          { icon: ScanLine, label: "Scan" }
        ].map((action) => (
          <div key={action.label} className="flex flex-col items-center gap-0.5 rounded-md bg-white/12 py-1">
            <action.icon className="h-2.5 w-2.5" />
            <span className="text-[6px] font-semibold">{action.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 1 — Home */
function HomeScreen() {
  return (
    <>
      <BrandMark />
      <div className="mt-1.5">
        <BalanceCard />
      </div>
      <div className="relative mt-1.5 overflow-hidden rounded-lg bg-pay-gold-soft/70 p-2">
        <p className="max-w-[58%] font-display text-[9px] font-extrabold leading-tight text-pay-deep">
          Pay your bills in seconds
        </p>
        <p className="mt-0.5 max-w-[58%] text-[6px] leading-snug text-pay-ink/70">Stay connected, powered and entertained.</p>
        <span className="mt-1 inline-block rounded-full bg-pay-green px-1.5 py-0.5 text-[6px] font-bold text-white">
          Pay Now
        </span>
        <img
          src="/generated/pay/pay-phone-bills.webp"
          alt=""
          className="absolute -right-1 bottom-0 h-[74%] w-[42%] rounded-tl-xl object-cover"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[8px] font-extrabold text-pay-ink">
        <span>Quick Services</span>
        <span className="text-[7px] font-semibold text-pay-green">See All</span>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {[
          { icon: Smartphone, label: "Airtime", tint: "bg-sky-50 text-sky-600" },
          { icon: Wifi, label: "Data", tint: "bg-emerald-50 text-pay-green" },
          { icon: Zap, label: "Electric", tint: "bg-amber-50 text-amber-600" },
          { icon: Tv, label: "TV", tint: "bg-violet-50 text-violet-600" }
        ].map((service) => (
          <div key={service.label} className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 ${service.tint}`}>
            <service.icon className="h-3 w-3" />
            <span className="text-[6px] font-semibold">{service.label}</span>
          </div>
        ))}
      </div>
      <TabBar active="Home" />
    </>
  );
}

function TabBar({ active }: { active: string }) {
  const items = [
    { icon: LayoutGrid, label: "Home" },
    { icon: Wallet, label: "Wallet" },
    { icon: QrCode, label: "Pay" },
    { icon: Receipt, label: "Activity" },
    { icon: Banknote, label: "More" }
  ];
  return (
    <div className="absolute inset-x-3 bottom-1 flex items-end justify-between border-t border-black/5 pt-1">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex flex-col items-center gap-0.5 text-[5px] font-semibold ${item.label === active ? "text-pay-green" : "text-pay-ink/40"}`}
        >
          <item.icon className="h-2.5 w-2.5" />
          {item.label}
        </div>
      ))}
    </div>
  );
}

/** 2 — Send Money */
function SendScreen() {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-pay-ink">
        <span className="text-pay-ink/40">‹</span> Send Money
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[6px] font-semibold">
        <span className="rounded-full bg-pay-green py-0.5 text-center text-white">Phone</span>
        <span className="py-0.5 text-center text-pay-ink/60">NaijaDeals</span>
        <span className="py-0.5 text-center text-pay-ink/60">Bank</span>
      </div>
      <p className="mt-2 text-[6px] font-semibold text-pay-ink/60">Recipient</p>
      <div className="mt-0.5 rounded-md border border-black/10 px-1.5 py-1 text-[7px] text-pay-ink/35">Enter phone number</div>
      <p className="mt-1.5 text-[6px] font-semibold text-pay-ink/60">Amount</p>
      <div className="mt-0.5 rounded-md border border-black/10 px-1.5 py-1 font-display text-[10px] font-bold text-pay-ink/30">₦0.00</div>
      <p className="mt-1.5 text-[6px] font-semibold text-pay-ink/60">Add a note (optional)</p>
      <div className="mt-0.5 rounded-md border border-black/10 px-1.5 py-1 text-[6px] text-pay-ink/30">E.g. Lunch, Rent, Support…</div>
      <div className="mt-2 rounded-md bg-pay-green py-1 text-center text-[7px] font-bold text-white">Continue</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[7px] font-extrabold text-pay-ink">Recent Recipients</span>
        <span className="text-[6px] text-pay-green">See all</span>
      </div>
      <p className="mt-1 text-[6px] text-pay-ink/50">Your saved recipients appear here after your first transfer.</p>
    </>
  );
}

/** 3 — Receive Money (QR) */
function ReceiveScreen() {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-pay-ink">
        <span className="text-pay-ink/40">‹</span> Receive Money
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[6px] font-semibold">
        <span className="rounded-full bg-pay-green py-0.5 text-center text-white">My QR</span>
        <span className="rounded-full border border-black/10 py-0.5 text-center text-pay-ink/60">Payment Link</span>
      </div>
      <div className="mx-auto mt-2 grid h-[92px] w-[92px] grid-cols-7 gap-[2px] rounded-md bg-white p-1 ring-1 ring-black/10">
        {Array.from({ length: 49 }).map((_, index) => (
          <span
            key={index}
            className={`rounded-[1px] ${
              // A deterministic pattern: a stylised QR, not a scannable code.
              [0, 1, 2, 5, 6, 7, 8, 9, 11, 13, 14, 16, 18, 20, 21, 23, 24, 25, 27, 29, 30, 32, 34, 35, 37, 39, 40, 41, 42, 44, 46, 47, 48].includes(index)
                ? "bg-pay-deep"
                : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-center text-[7px] font-semibold text-pay-ink">Scan to pay me</p>
      <p className="mt-0.5 text-center text-[5.5px] text-pay-ink/50">Your NaijaPay ID</p>
      <div className="mt-1 rounded-md bg-pay-mint px-1.5 py-1 text-center text-[7px] font-bold text-pay-green">@your-id</div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[6px] font-semibold text-pay-ink">
        <span className="rounded-md border border-black/10 py-1 text-center">Share</span>
        <span className="rounded-md border border-black/10 py-1 text-center">Download</span>
      </div>
      <div className="mt-1.5 rounded-md border border-black/10 p-1">
        <p className="text-[6px] font-bold text-pay-ink">Request a specific amount</p>
        <p className="text-[5.5px] text-pay-ink/50">Create a payment request</p>
      </div>
    </>
  );
}

/** 4 — Pay Bills */
function BillsScreen() {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-pay-ink">
        <span className="text-pay-ink/40">‹</span> Pay Bills
      </div>
      <div className="relative mt-1.5 overflow-hidden rounded-lg bg-pay-green p-2 text-white">
        <p className="max-w-[62%] font-display text-[10px] font-extrabold leading-tight">Keep Life Running</p>
        <p className="mt-0.5 max-w-[62%] text-[6px] text-white/80">Airtime, Data, Electricity, TV.</p>
        <img
          src="/generated/pay/pay-bills-woman.webp"
          alt=""
          className="absolute inset-y-0 right-0 h-full w-[42%] object-cover"
        />
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1 text-[6px] font-semibold">
        {["Airtime", "Data", "Electricity", "TV"].map((tab, index) => (
          <span key={tab} className={`rounded-full py-0.5 text-center ${index === 0 ? "bg-pay-green text-white" : "bg-pay-mint text-pay-ink/60"}`}>
            {tab}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[6px] font-semibold text-pay-ink/60">Select Network</p>
      <div className="mt-0.5 flex gap-1">
        {["MTN", "Airtel", "Glo", "9mobile"].map((network) => (
          <span key={network} className="flex h-5 flex-1 items-center justify-center rounded-[3px] bg-pay-mint text-[5px] font-bold text-pay-ink/70">
            {network}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[6px] font-semibold text-pay-ink/60">Enter Phone Number</p>
      <div className="mt-0.5 rounded-md border border-black/10 px-1.5 py-1 font-mono text-[7px] text-pay-ink/35">0803 123 4567</div>
      <p className="mt-1.5 text-[6px] font-semibold text-pay-ink/60">Select Amount</p>
      <div className="mt-0.5 grid grid-cols-4 gap-1 text-[6px] font-semibold">
        {["₦100", "₦200", "₦500", "₦1,000"].map((amount) => (
          <span key={amount} className="rounded-md border border-black/10 py-0.5 text-center text-pay-ink/70">
            {amount}
          </span>
        ))}
      </div>
      <div className="mt-2 rounded-md bg-pay-green py-1 text-center text-[7px] font-bold text-white">Continue</div>
    </>
  );
}

/** 5 — Scan & Pay at the market */
function ScanScreen() {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[8px] font-extrabold text-pay-ink">
        <span className="text-pay-ink/40">‹</span> Scan &amp; Pay
      </div>
      <div className="relative mt-1.5 h-[132px] overflow-hidden rounded-md">
        <img src="/generated/pay/pay-scan-market.webp" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-3 rounded-md border-2 border-pay-green/90" aria-hidden="true" />
        <div className="absolute left-1/2 top-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white p-1 text-center shadow">
          <span className="text-[5px] font-extrabold text-pay-green">Scan to Pay</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-pay-deep/60 py-0.5 text-center text-[5.5px] font-semibold text-white">
          Align the QR inside the frame
        </div>
      </div>
      <div className="mt-2 flex items-center justify-around">
        {[
          { icon: Zap, label: "Torch" },
          { icon: Receipt, label: "Gallery" }
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pay-mint">
              <item.icon className="h-3 w-3 text-pay-green" />
            </span>
            <span className="text-[6px] font-semibold text-pay-ink/60">{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const SCREENS: Array<{ label: string; href: string; render: (props: ScreenProps) => React.ReactNode }> = [
  { label: "NaijaPay Home", href: "/wallet", render: () => <HomeScreen /> },
  { label: "Send Money", href: "/pay/send", render: () => <SendScreen /> },
  { label: "Receive Money (QR)", href: "/pay/receive", render: () => <ReceiveScreen /> },
  { label: "Pay Bills", href: "/pay#bills", render: () => <BillsScreen /> },
  { label: "Scan & Pay", href: "/pay/scan", render: () => <ScanScreen /> }
];

export function PhoneScreens() {
  return (
    <section className="bg-white" aria-labelledby="pay-screens-heading">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pay-green">Every screen, one wallet</p>
            <h2 id="pay-screens-heading" className="mt-1 font-display text-2xl font-extrabold text-pay-ink sm:text-3xl">
              The NaijaPay app
            </h2>
          </div>
          <p className="max-w-sm text-xs text-pay-ink-muted">
            Previews of the real screens. Amounts are hidden here — open a screen to see your own figures.
          </p>
        </div>

        <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:justify-between sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SCREENS.map((screen) => (
            <Link
              key={screen.label}
              href={screen.href}
              className="shrink-0 rounded-[28px] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pay-green"
            >
              <PhoneFrame label={screen.label}>{screen.render({})}</PhoneFrame>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
