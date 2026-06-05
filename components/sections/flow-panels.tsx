import Link from "next/link";
import { ArrowRight, Banknote, CheckCircle2, CreditCard, MessageCircle, PackageCheck, QrCode, ShieldCheck, Truck, Wallet } from "lucide-react";

const cartItems = [
  ["Oraimo Watch Pro from Balogun Market", "NGN 42,500", "Verified vendor, escrow eligible"],
  ["Mama Cass Surulere party jollof bowl", "NGN 4,800", "Kitchen ready, rider dispatch in 6 min"],
  ["Cold-chain delivery Yaba to Ajah", "NGN 3,500", "QR pickup, temperature proof"]
];

export function RouteSpecificPanel({ slug }: { slug: string }) {
  if (slug === "cart") return <CartPanel />;
  if (slug === "checkout") return <CheckoutPanel />;
  if (slug === "wallet" || slug === "payments") return <WalletPanel />;
  if (slug === "orders") return <OrdersPanel />;
  if (slug === "help" || slug === "aura-ai") return <SupportPanel />;
  if (slug === "returns" || slug === "safety" || slug === "shipping") return <TrustOpsPanel slug={slug} />;
  return null;
}

function CartPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-2xl font-extrabold">Multi-vertical cart review</h2>
        <p className="mt-2 text-sm text-muted">One basket can hold marketplace items, food, courier jobs, bookings, gigs, and creator access with clear trust rules.</p>
        <div className="mt-4 space-y-3">
          {cartItems.map(([name, price, badge]) => (
            <div key={name} className="flex flex-col gap-3 rounded-xl bg-surface-low p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold">{name}</h3>
                <p className="text-sm text-muted">{badge}</p>
              </div>
              <p className="font-display text-lg font-extrabold text-primary">{price}</p>
            </div>
          ))}
        </div>
      </div>
      <FlowSummary title="Cart total" value="NGN 50,800" cta="Checkout with escrow" href="/checkout" />
    </section>
  );
}

function CheckoutPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {[
        ["1", "Delivery and mission address", "Lekki Phase 1, Lagos with rider notes, gate code, low-data confirmation, and masked contact."],
        ["2", "NaijaPay funding source", "Wallet balance first, then card or transfer fallback. High-trust items enter escrow automatically."],
        ["3", "Proof and payout rules", "Fees, refunds, QR proof, delivery SLA, and merchant payout timing shown before payment."]
      ].map(([step, title, body]) => (
        <div key={step} className="rounded-2xl border border-border-soft bg-canvas p-5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-black text-white">{step}</span>
          <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm text-muted">{body}</p>
        </div>
      ))}
    </section>
  );
}

function WalletPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-2xl bg-night p-5 text-white">
        <Wallet className="h-7 w-7 text-primary-live" />
        <p className="mt-5 text-sm text-white/70">Available NaijaPay balance</p>
        <p className="font-display text-4xl font-extrabold">NGN 284,900</p>
        <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm">
          <p className="font-bold text-primary-live">NGN 42,500 in escrow</p>
          <p className="mt-1 text-white/70">Pending QR delivery proof from Balogun vendor.</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href="/checkout" className="rounded-xl bg-primary-live px-4 py-3 text-center text-sm font-bold">Pay</Link>
          <Link href="/business/shop" className="rounded-xl bg-white/10 px-4 py-3 text-center text-sm font-bold">Payouts</Link>
        </div>
      </div>
      <div className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-2xl font-extrabold">Ledger activity</h2>
        {[
          ["Escrow hold", "NGN 42,500", "Balogun Watch Pro pending delivery proof"],
          ["Refund received", "NGN 8,200", "Damaged phone case dispute resolved"],
          ["Creator tip", "NGN 1,000", "Afrobeats live room fan payment"],
          ["Driver payout", "NGN 16,400", "Airport corridor mission completed"]
        ].map(([name, amount, status]) => (
          <div key={name} className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-surface-low p-4">
            <div>
              <h3 className="font-bold">{name}</h3>
              <p className="text-sm text-muted">{status}</p>
            </div>
            <p className="font-bold text-primary">{amount}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrdersPanel() {
  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5">
      <h2 className="font-display text-2xl font-extrabold">Unified activity timeline</h2>
      {[
        ["Marketplace order", "Packed at Balogun Market, QR pickup scheduled", "Track package"],
        ["NaijaDrive ride", "Driver arriving in 4 minutes, route score 92", "Open ride"],
        ["NaijaGigs milestone", "Solar installer submitted inverter test proof", "Review milestone"],
        ["NaijaStay booking", "Lekki host confirmed QR access and generator status", "View stay"]
      ].map(([title, body, action]) => (
        <Link key={title} href="/tracking/mission-2843" className="mt-3 flex flex-col gap-3 rounded-xl bg-surface-low p-4 hover:bg-primary-soft sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-sm text-muted">{body}</p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
            {action} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ))}
    </section>
  );
}

function SupportPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-2xl font-extrabold">Aura support assistant</h2>
        <div className="mt-4 space-y-3">
          {["Find me the best verified phone deal under NGN 80k in Computer Village.", "My rider is delayed in the rain, should I request another dispatch?", "Prepare a refund case for a damaged Alaba Market item."].map((text) => (
            <div key={text} className="rounded-xl bg-surface-low p-4 text-sm font-semibold text-muted">{text}</div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-primary-soft p-5">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h3 className="mt-4 font-display text-xl font-bold">Human handoff ready</h3>
        <p className="mt-2 text-sm text-muted">Aura can collect evidence, language preference, order IDs, and urgency before routing to a support agent.</p>
      </div>
    </section>
  );
}

function TrustOpsPanel({ slug }: { slug: string }) {
  const items = slug === "shipping"
      ? [["Pickup scan", "Balogun vendor QR verified"], ["In transit", "GPS route active through Third Mainland corridor"], ["Delivery proof", "Customer barcode pending"]]
    : slug === "returns"
      ? [["Evidence", "Video unboxing and item photos uploaded"], ["Merchant window", "24 hours remaining for response"], ["Refund rule", "Escrow release paused until decision"]]
      : [["KYC checks", "Vendor, rider, host, and creator verification active"], ["Fraud scoring", "Wallet velocity and refund ratio monitored"], ["Route risk", "Rain, traffic, and corridor anomalies watched"]];

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {items.map(([title, body]) => (
        <div key={title} className="rounded-2xl border border-border-soft bg-canvas p-5">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-display text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm text-muted">{body}</p>
        </div>
      ))}
    </section>
  );
}

function FlowSummary({ title, value, cta, href }: { title: string; value: string; cta: string; href: string }) {
  return (
    <aside className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
      <CreditCard className="h-6 w-6 text-primary" />
      <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
      <p className="mt-2 font-display text-3xl font-extrabold text-primary">{value}</p>
      <div className="mt-4 space-y-2 text-sm text-muted">
        <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Escrow protection available</p>
        <p className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> QR delivery verification</p>
        <p className="flex items-center gap-2"><Banknote className="h-4 w-4 text-primary" /> Refund-ready ledger</p>
        <p className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-primary" /> Order tracking included</p>
        <p className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> NaijaSend dispatch eligible</p>
      </div>
      <Link href={href} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white">
        {cta} <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
  );
}
