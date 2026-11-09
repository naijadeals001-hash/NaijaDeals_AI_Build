"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Banknote, Check, Loader2, Plus, ShieldCheck } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Provider = { id: string; label: string; available: boolean; reason: string | null };
type TopUp = { id: string; provider: string; providerReference: string; status: string; amountKobo: string; currency: string; creditedAt: string | null; createdAt: string };

function randomKey() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nairaToKobo(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const kobo = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

type Step = "choose" | "amount" | "confirming" | "credited" | "failed";

/**
 * Add Money (wallet top-up).
 *
 * Providers are shown exactly as the server reports them. The local test
 * provider is visibly labelled as a test — it exists so the flow can be
 * verified without pretending a real payment happened. A real provider only
 * credits the wallet through its verified webhook, never because this screen
 * came back with a success.
 */
export function AddMoneyFlow() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [limits, setLimits] = useState<{ minKobo: string; maxKobo: string } | null>(null);
  const [recent, setRecent] = useState<TopUp[]>([]);
  const [step, setStep] = useState<Step>("choose");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/pay/topups", { credentials: "include" });
    if (res.status === 401) {
      setSignedOut(true);
      return;
    }
    if (!res.ok) {
      setProviders([]);
      return;
    }
    const body = await res.json();
    setProviders(body.providers ?? []);
    setLimits(body.limits ?? null);
    setRecent(body.topUps ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startTopUp() {
    setError("");
    const kobo = nairaToKobo(amount);
    if (!kobo) {
      setError("Enter an amount like 2500 or 2500.50.");
      return;
    }
    if (limits && (kobo < Number(limits.minKobo) || kobo > Number(limits.maxKobo))) {
      setError(`Enter between ${koboToNaira(limits.minKobo, "NGN")} and ${koboToNaira(limits.maxKobo, "NGN")}.`);
      return;
    }
    const key = randomKey();
    setIdempotencyKey(key);
    setStep("confirming");
    try {
      const res = await fetch("/api/pay/topups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "create", provider: provider?.id, amountKobo: kobo, idempotencyKey: key })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Could not start the top-up (HTTP ${res.status}).`);
        setStep("failed");
        return;
      }
      setReference(body.providerReference);
      // The local test provider confirms here; a real provider would redirect to
      // its checkout and credit only via its verified webhook.
      if (body.checkout?.kind === "inline") {
        await confirmTestProvider(body.providerReference);
      } else {
        setError("A real provider is configured but its sandbox checkout is not wired in this environment yet.");
        setStep("failed");
      }
    } catch {
      setError("The connection dropped before we heard back. Nothing was credited — check your history before retrying.");
      setStep("failed");
    }
  }

  async function confirmTestProvider(providerReference: string) {
    const res = await fetch("/api/pay/topups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "verify", providerReference })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "The top-up could not be confirmed.");
      setStep("failed");
      return;
    }
    setStep("credited");
    await load();
  }

  if (signedOut) {
    return (
      <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
        <h3 className="font-display text-xl font-extrabold text-pay-ink">Add money</h3>
        <p className="mt-2 text-sm text-pay-ink-muted">Sign in to top up your NaijaPay wallet.</p>
        <Link
          href="/login?next=/pay"
          className="mt-4 inline-flex rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const usable = (providers ?? []).filter((p) => p.available);

  return (
    <section id="add-money" className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft" aria-labelledby="add-money-heading">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-pay-green" aria-hidden="true" />
        <h3 id="add-money-heading" className="font-display text-xl font-extrabold text-pay-ink">
          Add money
        </h3>
      </div>

      {providers === null && <div className="mt-4 h-24 animate-pulse rounded-xl bg-pay-mint" aria-busy="true" />}

      {providers !== null && step === "choose" && (
        <>
          {usable.length === 0 ? (
            <div className="mt-3 rounded-xl bg-pay-gold-soft/40 p-4">
              <p className="text-sm font-bold text-pay-ink">No top-up provider is available here yet</p>
              <p className="mt-1 text-xs text-pay-ink-muted">
                Card and bank top-ups switch on when a payment provider is configured for this environment. Nothing is
                simulated in the meantime.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {usable.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProvider(p);
                      setStep("amount");
                      setError("");
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-black/10 p-3 text-left transition hover:border-pay-green/40 hover:bg-pay-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
                  >
                    <span>
                      <span className="block text-sm font-bold text-pay-ink">{p.label}</span>
                      <span className="block text-xs text-pay-ink-muted">
                        {p.id === "test" ? "Test money only — no real funds move." : "Card or bank transfer."}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-pay-green" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Unavailable providers are listed with the exact reason, not hidden. */}
          {(providers ?? []).some((p) => !p.available) && (
            <ul className="mt-3 space-y-1">
              {(providers ?? [])
                .filter((p) => !p.available)
                .map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-lg bg-pay-mint/60 px-3 py-2 text-xs text-pay-ink-muted">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-pay-ink">{p.label}</span> — {p.reason}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {step === "amount" && provider && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setStep("choose")}
            className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-pay-ink-muted hover:text-pay-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Change provider
          </button>
          {provider.id === "test" && (
            <p className="mb-3 rounded-lg bg-pay-gold-soft/50 px-3 py-2 text-xs font-semibold text-pay-ink">
              Test provider: this credits test money so you can try the journey. It is disabled in production.
            </p>
          )}
          <label htmlFor="topup-amount" className="block text-xs font-semibold text-pay-ink-muted">
            Amount
          </label>
          <div className="mt-1 flex items-center rounded-xl border border-black/10 px-3">
            <span className="text-lg font-bold text-pay-ink-muted">₦</span>
            <input
              id="topup-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent px-2 py-3 font-display text-xl font-extrabold text-pay-ink outline-none"
              aria-describedby="topup-hint"
            />
          </div>
          <p id="topup-hint" className="mt-1 text-xs text-pay-ink-muted">
            {limits ? `${koboToNaira(limits.minKobo, "NGN")} – ${koboToNaira(limits.maxKobo, "NGN")}.` : ""}
          </p>
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void startTopUp()}
            className="mt-4 w-full rounded-full bg-pay-green px-6 py-3.5 text-sm font-bold text-white shadow-lift transition hover:bg-pay-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
          >
            Add {nairaToKobo(amount) ? koboToNaira(String(nairaToKobo(amount)), "NGN") : "money"}
          </button>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-pay-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-pay-green" aria-hidden="true" />
            Your wallet is credited once, through the shared ledger.
          </p>
        </div>
      )}

      {step === "confirming" && (
        <div className="mt-4 rounded-xl bg-pay-mint p-5 text-center" aria-busy="true">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-pay-green" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-pay-ink">Confirming with the provider…</p>
          <p className="mt-1 text-xs text-pay-ink-muted">Reference {reference || "pending"}</p>
        </div>
      )}

      {step === "credited" && (
        <div className="mt-4 rounded-xl border border-pay-green/20 bg-pay-mint p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pay-green">
            <Check className="h-6 w-6 text-white" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-extrabold text-pay-ink">Wallet credited</p>
          <p className="mt-1 text-xs text-pay-ink-muted">
            {provider?.id === "test" ? "Test money added. " : ""}Reference {reference}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/wallet" className="rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white">
              View wallet
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep("choose");
                setAmount("");
                setProvider(null);
              }}
              className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-bold text-pay-ink"
            >
              Add more
            </button>
          </div>
        </div>
      )}

      {step === "failed" && (
        <div className="mt-4 rounded-xl border border-amber-strong/30 bg-amber-soft/60 p-5">
          <p className="flex items-center gap-2 text-sm font-extrabold text-pay-ink">
            <AlertCircle className="h-4 w-4 text-amber-strong" aria-hidden="true" /> Not credited
          </p>
          <p className="mt-1 text-xs text-pay-ink-muted">{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void startTopUp()}
              className="rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("choose");
                setError("");
              }}
              className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-bold text-pay-ink"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && step === "choose" && (
        <div className="mt-5 border-t border-black/5 pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-pay-ink-muted">Recent top-ups</p>
          <ul className="mt-2 space-y-1.5">
            {recent.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-pay-ink">
                  <span className="font-semibold">{koboToNaira(t.amountKobo, t.currency)}</span>
                  <span className="text-pay-ink-muted"> · {t.provider}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${
                    t.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : t.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-soft text-amber-strong"
                  }`}
                >
                  {t.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
