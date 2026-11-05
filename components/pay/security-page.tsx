"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, KeyRound, Loader2, Lock, MonitorSmartphone, ShieldCheck } from "lucide-react";

type SessionRow = { id: string; userAgent: string | null; createdAt: string; expiresAt: string; current: boolean };

/**
 * Security & protection screen. Real capabilities today: review this
 * account's active sessions and revoke any other device (ownership-scoped
 * API). Transaction PIN is designed in the approved mockup but requires a
 * product decision on storage and challenge flow — shown as pending, not
 * faked.
 */
export function NaijaPaySecurityPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    fetch("/api/account/sessions", { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((body) => Promise.reject(Object.assign(new Error(body.error ?? "Unable to load sessions."), { status: res.status })))
      )
      .then((body) => {
        setSessions(body.sessions ?? []);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load sessions.");
          setStatus("error");
        }
      });
  }, []);

  useEffect(load, [load]);

  async function revoke(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Failed (HTTP ${res.status}).`);
      setMessage("Device signed out.");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke that session.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/wallet" aria-label="Back to wallet" className="rounded-full border border-black/10 bg-white p-2.5 text-pay-ink transition hover:bg-pay-mint">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-pay-ink">Security &amp; protection</h1>
          <p className="text-xs text-pay-ink-muted">Your money is safe. Every action here is real and audited.</p>
        </div>
      </header>

      {status === "signed-out" ? (
        <section className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-8 text-center text-white">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-pay-gold" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold">Sign in to manage security</h2>
          <Link href="/login?next=/pay/security" className="mt-5 inline-block rounded-full bg-pay-gold px-6 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110">
            Open NaijaPay →
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5 text-pay-green" aria-hidden="true" />
              <h2 className="font-display text-lg font-extrabold text-pay-ink">Active devices</h2>
            </div>
            <p className="mt-1 text-xs text-pay-ink-muted">Sessions signed into this account. Signing out a device ends it immediately.</p>

            {status === "loading" && (
              <p className="mt-4 flex items-center gap-2 text-sm text-pay-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading sessions…
              </p>
            )}
            {status === "error" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
            {message && <p role="status" className="mt-4 rounded-xl bg-pay-green/10 p-3 text-sm font-bold text-pay-green">{message}</p>}

            {status === "ready" && sessions !== null && (
              sessions.length === 0 ? (
                <p className="mt-4 text-sm text-pay-ink-muted">No active sessions.</p>
              ) : (
                <ul className="mt-4 divide-y divide-pay-mint">
                  {sessions.map((session) => (
                    <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-pay-ink">{session.userAgent ?? "Unknown device"}</p>
                        <p className="text-xs text-pay-ink-muted">
                          Signed in {new Date(session.createdAt).toLocaleDateString()} · expires {new Date(session.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      {session.current ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-pay-green/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-pay-green">
                          <Check className="h-3 w-3" aria-hidden="true" /> This device
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === session.id}
                          onClick={() => void revoke(session.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          {busyId === session.id ? "Signing out…" : "Sign out device"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>

          <section className="mt-4 rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-pay-green" aria-hidden="true" />
              <h2 className="font-display text-lg font-extrabold text-pay-ink">How NaijaPay protects you</h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-pay-ink-muted">
              {[
                "Balanced double-entry ledger — every naira is accounted for",
                "Signature-verified payment provider webhooks",
                "Session-protected APIs with server-side ownership checks",
                "Escrow holds on eligible orders until delivery",
                "Audited money movements and administrative actions"
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-pay-green" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-4 rounded-3xl border border-pay-gold/30 bg-pay-gold-soft/40 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-strong" aria-hidden="true" />
              <h2 className="font-display text-lg font-extrabold text-pay-ink">Transaction PIN — pending decision</h2>
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-pay-ink-muted">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-strong" aria-hidden="true" />
              A transaction PIN before money-moving actions is planned with the transfers rollout. It requires a decision on
              secure storage (hashed, never raw) and the challenge flow before activation — so it is not enabled here.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
