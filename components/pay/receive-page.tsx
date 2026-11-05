"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, QrCode, Share2 } from "lucide-react";

/**
 * Receive money screen. Today it shows the account's real payment identifiers
 * (NaijaDeals email + wallet reference) with copy/share actions. Amount
 * requests and personal QR issuance activate with the transfers rollout —
 * shown honestly rather than simulated.
 */
export function NaijaPayReceivePage() {
  const [email, setEmail] = useState("");
  const [walletRef, setWalletRef] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (!body?.user) {
          setSignedOut(true);
          return;
        }
        setEmail(String(body.user.email ?? ""));
      })
      .catch(() => setSignedOut(true));
    fetch("/api/wallet", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.id) setWalletRef(String(body.id));
      })
      .catch(() => undefined);
  }, []);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }

  async function share() {
    if (!email) return;
    const text = `Pay me on NaijaPay (NaijaDeals): ${email}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My NaijaPay payment handle", text });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    void copy("handle", text);
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/wallet" aria-label="Back to wallet" className="rounded-full border border-black/10 bg-white p-2.5 text-pay-ink transition hover:bg-pay-mint">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-pay-ink">Receive money</h1>
          <p className="text-xs text-pay-ink-muted">Share your payment handle to get paid to your wallet.</p>
        </div>
      </header>

      {signedOut ? (
        <section className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-8 text-center text-white">
          <QrCode className="mx-auto mb-3 h-10 w-10 text-pay-gold" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold">Sign in to see your payment handle</h2>
          <Link href="/login?next=/pay/receive" className="mt-5 inline-block rounded-full bg-pay-gold px-6 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110">
            Open NaijaPay →
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-black/5 bg-white p-6 text-center shadow-soft">
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-3xl bg-pay-mint">
              <QrCode className="h-16 w-16 text-pay-green" aria-hidden="true" />
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-pay-ink-muted">Your NaijaPay handle</p>
            <p className="mt-1 break-all font-display text-xl font-extrabold text-pay-ink">{email || "…"}</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void copy("handle", email)}
                className="inline-flex items-center gap-2 rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pay-deep"
              >
                {copied === "handle" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === "handle" ? "Copied" : "Copy handle"}
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex items-center gap-2 rounded-full border border-pay-green/30 px-5 py-2.5 text-sm font-bold text-pay-green transition hover:bg-pay-mint"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share
              </button>
            </div>
          </section>

          {walletRef && (
            <section className="mt-4 rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
              <p className="text-[11px] font-bold uppercase tracking-widest text-pay-ink-muted">Wallet reference (support)</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="break-all font-mono text-xs font-bold text-pay-ink">{walletRef}</p>
                <button
                  type="button"
                  onClick={() => void copy("ref", walletRef)}
                  aria-label="Copy wallet reference"
                  className="shrink-0 rounded-lg border border-black/10 p-2 text-pay-ink transition hover:bg-pay-mint"
                >
                  {copied === "ref" ? <Check className="h-4 w-4 text-pay-green" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </section>
          )}

          <section className="mt-4 rounded-3xl border border-pay-gold/30 bg-pay-gold-soft/40 p-5">
            <h2 className="font-display text-base font-extrabold text-pay-ink">Coming with the transfers rollout</h2>
            <ul className="mt-2 space-y-1 text-xs text-pay-ink-muted">
              <li>• Personal QR code (server-generated, signed)</li>
              <li>• Request a specific amount and track its status</li>
              <li>• Payment links you can send to anyone</li>
            </ul>
            <p className="mt-2 text-xs text-pay-ink-muted">
              These activate together with Send money so every payment lands on the same reconciled ledger.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
