"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Lock, Send, ShieldCheck } from "lucide-react";
import { apiClient, ApiRequestError, koboToNaira } from "@/lib/api-client";

type Step = "form" | "review" | "sending" | "done" | "failed";
type BalanceState = { availableKobo?: string | number; currency?: string } | null;

function randomIdempotencyKey() {
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

/**
 * Send Money screen (approved mockup) wired to the real gated transfers API.
 * Every amount is validated client-side for UX only; the server re-validates
 * and remains the sole authority. While ENABLE_P2P_TRANSFERS is off, the
 * confirm step returns the honest "not active yet" message — no simulation.
 */
export function NaijaPaySendPage() {
  const [step, setStep] = useState<Step>("form");
  const [wallet, setWallet] = useState<BalanceState>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [result, setResult] = useState<{ reference?: string; message?: string }>({});
  const [formError, setFormError] = useState("");

  useEffect(() => {
    apiClient
      .getWallet()
      .then((data) => setWallet(data as BalanceState))
      .catch(() => setWallet(null))
      .finally(() => setWalletLoaded(true));
  }, []);

  const currency = wallet?.currency ?? "NGN";
  const kobo = nairaToKobo(amount);

  function startReview() {
    setFormError("");
    const parsed = nairaToKobo(amount);
    if (!recipient.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      setFormError("Enter the recipient's NaijaDeals email address.");
      return;
    }
    if (!parsed) {
      setFormError("Enter a valid amount, e.g. 2500 or 2500.50.");
      return;
    }
    if (wallet && parsed > Number(wallet.availableKobo ?? 0)) {
      setFormError(`That is more than your available balance of ${koboToNaira(String(wallet.availableKobo), currency)}.`);
      return;
    }
    setStep("review");
  }

  async function confirmSend() {
    const parsed = nairaToKobo(amount);
    if (!parsed) return;
    const key = randomIdempotencyKey();
    setIdempotencyKey(key);
    setStep("sending");
    try {
      const res = await fetch("/api/pay/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientEmail: recipient.trim(), amountKobo: parsed, idempotencyKey: key, note: note.trim() || undefined })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ reference: body.reference });
        setStep("done");
        return;
      }
      setResult({ message: body.error ?? `Transfer failed (HTTP ${res.status}).` });
      setStep("failed");
    } catch (caught) {
      setResult({ message: caught instanceof Error ? caught.message : "Network error — the transfer was not sent." });
      setStep("failed");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/wallet" aria-label="Back to wallet" className="rounded-full border border-black/10 bg-white p-2.5 text-pay-ink transition hover:bg-pay-mint">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-pay-ink">Send money</h1>
          <p className="text-xs text-pay-ink-muted">Wallet-to-wallet on the NaijaDeals ledger.</p>
        </div>
      </header>

      {step === "form" && (
        <section className="space-y-4 rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
          <div className="rounded-2xl bg-gradient-to-br from-pay-deep to-pay-green p-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-widest text-pay-gold">From your balance</p>
            <p className="mt-1 font-display text-2xl font-extrabold">
              {walletLoaded && wallet ? koboToNaira(String(wallet.availableKobo ?? 0), currency) : "Sign-in required"}
            </p>
          </div>

          <label className="block text-xs font-bold uppercase tracking-wide text-pay-ink-muted">
            Recipient email
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full rounded-xl border border-black/10 bg-pay-mint/40 px-4 py-3 text-sm font-semibold text-pay-ink placeholder:text-pay-ink-muted focus:border-pay-green focus:outline-none"
            />
          </label>
          <span className="block text-[11px] text-pay-ink-muted">The recipient must have a NaijaDeals account with a NaijaPay wallet.</span>

          <label className="block text-xs font-bold uppercase tracking-wide text-pay-ink-muted">
            Amount (₦)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="2500.00"
              className="mt-1 w-full rounded-xl border border-black/10 bg-pay-mint/40 px-4 py-3 text-sm font-semibold text-pay-ink placeholder:text-pay-ink-muted focus:border-pay-green focus:outline-none"
            />
          </label>
          {kobo !== null && <p className="text-xs font-bold text-pay-green">{koboToNaira(String(kobo), currency)}</p>}

          <label className="block text-xs font-bold uppercase tracking-wide text-pay-ink-muted">
            Note (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={80}
              placeholder="What is it for?"
              className="mt-1 w-full rounded-xl border border-black/10 bg-pay-mint/40 px-4 py-3 text-sm font-semibold text-pay-ink placeholder:text-pay-ink-muted focus:border-pay-green focus:outline-none"
            />
          </label>

          {formError && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {formError}
            </p>
          )}

          <button
            type="button"
            onClick={startReview}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-pay-green px-6 py-3.5 text-sm font-bold text-white shadow-lift transition hover:bg-pay-deep"
          >
            Review transfer <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {step === "review" && kobo !== null && (
        <section className="space-y-4 rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-pay-green" aria-hidden="true" />
            <h2 className="font-display text-lg font-extrabold text-pay-ink">Review</h2>
          </div>
          <dl className="divide-y divide-pay-mint text-sm">
            <div className="flex justify-between py-3">
              <dt className="text-pay-ink-muted">To</dt>
              <dd className="font-bold text-pay-ink">{recipient.trim()}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-pay-ink-muted">Amount</dt>
              <dd className="font-black text-pay-ink">{koboToNaira(String(kobo), currency)}</dd>
            </div>
            {note.trim() && (
              <div className="flex justify-between py-3">
                <dt className="text-pay-ink-muted">Note</dt>
                <dd className="font-semibold text-pay-ink">{note.trim()}</dd>
              </div>
            )}
            <div className="flex justify-between py-3">
              <dt className="text-pay-ink-muted">Fee</dt>
              <dd className="font-bold text-pay-green">₦0 — no fee</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 rounded-xl bg-pay-mint p-3 text-xs text-pay-ink-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Transfers post one balanced ledger entry and cannot be reversed after confirmation. Double-check the recipient.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("form")}
              className="flex-1 rounded-full border border-black/10 px-6 py-3.5 text-sm font-bold text-pay-ink transition hover:bg-pay-mint"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void confirmSend()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-pay-green px-6 py-3.5 text-sm font-bold text-white shadow-lift transition hover:bg-pay-deep"
            >
              <Send className="h-4 w-4" aria-hidden="true" /> Confirm & send
            </button>
          </div>
        </section>
      )}

      {step === "sending" && (
        <section className="rounded-3xl border border-black/5 bg-white p-10 text-center shadow-soft" aria-busy="true">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-pay-green" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-pay-ink">Sending {kobo !== null ? koboToNaira(String(kobo), currency) : ""}…</p>
          <p className="mt-1 text-xs text-pay-ink-muted">Idempotency key {idempotencyKey.slice(0, 8)}… guards this attempt.</p>
        </section>
      )}

      {step === "done" && (
        <section className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pay-green">
            <Check className="h-7 w-7 text-white" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-xl font-extrabold text-pay-ink">Transfer sent</h2>
          <p className="mt-1 text-sm text-pay-ink-muted">
            {kobo !== null ? koboToNaira(String(kobo), currency) : ""} to {recipient.trim()}
          </p>
          {result.reference && <p className="mt-2 text-xs font-bold text-pay-ink-muted">Reference {result.reference}</p>}
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/wallet" className="rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep">
              View transactions
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setAmount("");
                setNote("");
              }}
              className="rounded-full border border-black/10 px-6 py-3 text-sm font-bold text-pay-ink transition hover:bg-pay-mint"
            >
              Send another
            </button>
          </div>
        </section>
      )}

      {step === "failed" && (
        <section className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-soft">
            <AlertCircle className="h-7 w-7 text-amber-strong" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-xl font-extrabold text-pay-ink">Not sent</h2>
          <p className="mt-2 text-sm text-pay-ink-muted">{result.message}</p>
          <p className="mt-1 text-xs text-pay-ink-muted">No money left your wallet for this attempt.</p>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="mt-5 rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep"
          >
            Back to form
          </button>
        </section>
      )}
    </div>
  );
}
