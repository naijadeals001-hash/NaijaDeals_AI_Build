"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Circle, ShieldCheck } from "lucide-react";
import { apiClient, ApiRequestError, koboToNaira } from "@/lib/api-client";

type EscrowEvent = { id: string; from: string | null; to: string; note: string | null; createdAt: string };
type Hold = {
  id: string;
  amountKobo: string;
  status: string;
  reason: string;
  createdAt: string;
  order: { orderNumber?: string; status?: string } | null;
  events?: EscrowEvent[];
};

/**
 * Customer escrow protection view over the existing engine: every escrow hold
 * on the signed-in customer's orders with its full event timeline. Read-only.
 */
export function NaijaPayEscrowPage() {
  const [holds, setHolds] = useState<Hold[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .getWallet()
      .then((data) => {
        setHolds(((data as { escrowHolds?: Hold[] }).escrowHolds ?? []));
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load escrow.");
          setStatus("error");
        }
      });
  }, []);

  if (status === "signed-out") {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-8 text-center text-white">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-pay-gold" aria-hidden="true" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view your escrow protection</h1>
        <Link href="/login?next=/pay/escrow" className="mt-5 inline-block rounded-full bg-pay-gold px-6 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110">
          Open NaijaPay →
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8">
        <h1 className="font-display text-xl font-extrabold text-pay-ink">Escrow unavailable</h1>
        <p className="mt-1 text-sm text-pay-ink-muted">{error}</p>
      </div>
    );
  }

  if (status === "loading") {
    return <div className="h-64 animate-pulse rounded-3xl bg-pay-mint" aria-busy="true" aria-label="Loading escrow" />;
  }

  const open = (holds ?? []).filter((hold) => ["pending", "held", "disputed"].includes(hold.status));
  const totalProtected = open.reduce((sum, hold) => sum + Number(hold.amountKobo ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-pay-ink">Escrow protection</h1>
          <p className="text-sm text-pay-ink-muted">Money held safely on your orders until delivery is confirmed.</p>
        </div>
        <Link href="/wallet" className="rounded-full border border-pay-green/30 px-5 py-2.5 text-sm font-bold text-pay-green transition hover:bg-pay-mint">
          ← Wallet
        </Link>
      </header>

      <section className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 text-white shadow-lift sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Currently protected</p>
        <p className="mt-1 font-display text-4xl font-extrabold">{koboToNaira(String(totalProtected))}</p>
        <p className="mt-1 text-xs text-white/60">
          {open.length} open hold{open.length === 1 ? "" : "s"} · {(holds ?? []).length} total on your orders
        </p>
      </section>

      {(holds ?? []).length === 0 ? (
        <section className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-pay-green" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold text-pay-ink">No escrow holds yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-pay-ink-muted">
            When you pay for an eligible order with NaijaPay, the funds are held here and released to the seller only
            after you confirm delivery.
          </p>
          <Link href="/naijashop" className="mt-5 inline-block rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep">
            Shop with escrow protection
          </Link>
        </section>
      ) : (
        <ul className="space-y-4">
          {(holds ?? []).map((hold) => (
            <li key={hold.id} className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-extrabold text-pay-ink">{hold.order?.orderNumber ?? "Order"}</p>
                  <p className="text-xs text-pay-ink-muted">Order status: {String(hold.order?.status ?? "—")}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-black text-pay-ink">{koboToNaira(String(hold.amountKobo))}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      hold.status === "released" ? "bg-pay-green/10 text-pay-green" : hold.status === "disputed" ? "bg-red-50 text-red-600" : "bg-amber-soft text-amber-strong"
                    }`}
                  >
                    {hold.status}
                  </span>
                </div>
              </div>
              {hold.events && hold.events.length > 0 && (
                <ol className="mt-4 space-y-3 border-l-2 border-pay-mint pl-5">
                  {hold.events.map((event) => (
                    <li key={event.id} className="relative">
                      <Circle className="absolute -left-[27px] top-1 h-3 w-3 fill-pay-green text-pay-green" aria-hidden="true" />
                      <p className="text-sm font-bold text-pay-ink">
                        {String(event.from ?? "start")} → {event.to}
                      </p>
                      <p className="text-xs text-pay-ink-muted">
                        {event.note ?? "—"} · {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
