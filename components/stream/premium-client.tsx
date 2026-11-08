"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Crown, Loader2 } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Plan = { id: string; code: string; name: string; description: string | null; priceKobo: string; interval: string; features: string[] };
type Sub = { id: string; status: string; currentPeriodEnd: string; plan: Plan } | null;
type State = { subscription: Sub; history: Array<{ id: string; amountKobo: string; periodStart: string; periodEnd: string; status: string; ledgerReference: string }>; providers: string[]; cardBillingEnabled: boolean };

export function PremiumPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/stream/premium/plans").then((r) => (r.ok ? r.json() : { plans: [] })),
      fetch("/api/stream/premium", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : Promise.reject(Object.assign(new Error("auth"), { status: r.status }))
      )
    ])
      .then(([planBody, stateBody]) => {
        setPlans(planBody.plans ?? []);
        setState(stateBody);
        setStatus("ready");
      })
      .catch((err) => setStatus(err.status === 401 ? "signed-out" : "error"));
  }, []);

  useEffect(load, [load]);

  async function subscribe(code: string) {
    setBusy(code);
    setMessage("");
    const res = await fetch("/api/stream/premium", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "subscribe", planCode: code })
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    if (res.ok) {
      setMessage(body.charged ? `Subscribed to ${body.subscription?.plan?.name ?? code}.` : "You already have this plan.");
      load();
    } else {
      setMessage(body.error ?? "Could not start the subscription.");
    }
  }

  async function cancel() {
    setBusy("cancel");
    const res = await fetch("/api/stream/premium", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "cancel" })
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    setMessage(res.ok ? "Subscription cancelled. You keep access until the period ends." : body.error ?? "Could not cancel.");
    if (res.ok) load();
  }

  if (status === "loading") return <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-label="Loading plans" />;
  if (status === "error") return <p className="text-[12.5px] text-red-300">Plans could not be loaded.</p>;

  return (
    <div>
      {status === "signed-out" ? (
        <p className="rounded-xl border border-white/10 bg-[#101613] p-4 text-[12.5px] text-white/70">
          <Link href="/login?next=/naijastream/premium" className="font-bold text-emerald-400">Sign in</Link> to subscribe. Premium is paid from your NaijaPay wallet.
        </p>
      ) : null}

      {status === "ready" && state?.subscription ? (
        <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-[12.5px] text-emerald-100">
          <p className="flex items-center gap-2 font-extrabold">
            <Crown className="h-4 w-4" aria-hidden /> {state.subscription.plan.name} active
          </p>
          <p className="mt-1 text-emerald-100/80">
            Renews {new Date(state.subscription.currentPeriodEnd).toLocaleDateString("en-NG")} · paid from your NaijaPay wallet
          </p>
          <button type="button" onClick={() => void cancel()} disabled={busy === "cancel"} className="mt-3 rounded-full border border-white/25 px-4 py-2 text-[11.5px] font-bold text-white">
            {busy === "cancel" ? "Cancelling…" : "Cancel subscription"}
          </button>
        </div>
      ) : null}

      {message ? <p role="status" className="mb-4 rounded-lg bg-white/5 p-3 text-[12px] font-semibold text-white/80">{message}</p> : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = state?.subscription?.plan?.code === plan.code;
          const free = Number(plan.priceKobo) === 0;
          return (
            <li key={plan.id} className={`flex flex-col rounded-2xl border p-5 ${isCurrent ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-[#101613]"}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{plan.name}</p>
              <p className="mt-2 font-display text-2xl font-extrabold">
                {free ? "Free" : koboToNaira(plan.priceKobo)}
                {!free ? <span className="text-[11px] font-semibold text-white/45"> / {plan.interval.toLowerCase()}</span> : null}
              </p>
              {plan.description ? <p className="mt-1 text-[11.5px] text-white/55">{plan.description}</p> : null}
              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[11.5px] text-white/70">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden /> {feature}
                  </li>
                ))}
              </ul>
              {free ? (
                <p className="mt-4 rounded-full border border-white/15 py-2 text-center text-[11.5px] font-bold text-white/60">Included free</p>
              ) : (
                <button
                  type="button"
                  disabled={busy === plan.code || isCurrent || status !== "ready"}
                  onClick={() => void subscribe(plan.code)}
                  className="mt-4 rounded-full bg-emerald-500 py-2 text-[11.5px] font-bold text-black disabled:opacity-50"
                >
                  {isCurrent ? "Current plan" : busy === plan.code ? "Processing…" : `Pay ${koboToNaira(plan.priceKobo)} from wallet`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {status === "ready" && state ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#101613] p-4 text-[11.5px] leading-5 text-white/55">
          {state.cardBillingEnabled
            ? "Card and bank billing are configured for this environment."
            : "Card and bank billing are not configured yet, so Premium is paid from your NaijaPay wallet balance only. No card is charged here."}
        </p>
      ) : null}

      {state && state.history.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Billing history</h2>
          <ul className="mt-2 divide-y divide-white/5 text-[12px]">
            {state.history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-white/70">
                  {new Date(row.periodStart).toLocaleDateString("en-NG")} → {new Date(row.periodEnd).toLocaleDateString("en-NG")}
                </span>
                <span className="font-bold">{koboToNaira(row.amountKobo)}</span>
                <span className="text-[10.5px] uppercase text-emerald-300">{row.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
