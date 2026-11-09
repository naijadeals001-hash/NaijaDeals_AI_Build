"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CloudOff, Loader2, RefreshCw, Trash2, Wifi } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";
import { isExpired, listOutbox, pruneForUser, removeItem, replayIntent, updateItem, type OutboxItem } from "@/lib/pay/outbox";

/**
 * Offline outbox panel for the wallet screen.
 *
 * Shows payment intents that were prepared without a connection. It never says
 * "sent" from local state: the only path to `sent` is a server confirmation, and
 * a successful replay shows the server's reference. Everything else is honest
 * about waiting.
 */
export function OutboxPanel({ currentUserId }: { currentUserId: string }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    setItems(pruneForUser(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    refresh();
    const setStatus = () => setOnline(navigator.onLine);
    setStatus();
    window.addEventListener("online", setStatus);
    window.addEventListener("offline", setStatus);
    return () => {
      window.removeEventListener("online", setStatus);
      window.removeEventListener("offline", setStatus);
    };
  }, [refresh]);

  async function retry(item: OutboxItem) {
    setBusy(item.id);
    setMessage("");
    const result = await replayIntent(
      item,
      async (payload) => {
        const res = await fetch("/api/pay/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recipientEmail: payload.target, amountKobo: Number(payload.amountKobo), idempotencyKey: payload.idempotencyKey, note: payload.note })
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, body };
      },
      async () => {
        // Re-validate against the server before replaying: the balance may have
        // changed while the device was offline.
        const res = await fetch("/api/pay/transfers", { credentials: "include" });
        if (res.status === 401) return { allowed: false, reason: "Sign in again to send this." };
        if (!res.ok) return { allowed: false, reason: "Could not check your account." };
        const limits = await res.json();
        const amount = Number(item.amountKobo);
        if (limits?.limits) {
          if (amount < Number(limits.limits.minKobo) || amount > Number(limits.limits.maxKobo)) {
            return { allowed: false, reason: "This amount is outside the current transfer limits." };
          }
        }
        const wallet = await fetch("/api/wallet", { credentials: "include" }).then((r) => (r.ok ? r.json() : null));
        if (wallet && Number(wallet.availableKobo) < amount) {
          return { allowed: false, reason: "Your available balance no longer covers this transfer." };
        }
        return { allowed: true };
      }
    );
    setBusy("");
    if (result.outcome === "sent") setMessage(`Sent. Reference ${result.reference}.`);
    else if (result.outcome === "already_sent") setMessage("This was already sent.");
    else if (result.outcome === "needs_confirmation") setMessage(result.reason ?? "Please review this before sending.");
    else if (result.outcome === "signed_out") setMessage("Your session ended. Sign in again and retry.");
    else if (result.outcome === "offline") setMessage("Still offline. Nothing was sent.");
    else if (result.outcome === "failed") setMessage(String(result.message ?? "The server refused this transfer."));
    refresh();
  }

  const pending = items.filter((item) => !["sent", "cancelled"].includes(item.status));

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6" aria-labelledby="outbox-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CloudOff className="h-5 w-5 text-pay-green" aria-hidden="true" />
          <h2 id="outbox-heading" className="font-display text-lg font-extrabold text-pay-ink">
            Waiting to send
          </h2>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-soft text-amber-strong"}`}>
          {online ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <CloudOff className="h-3 w-3" aria-hidden="true" />}
          {online ? "Online" : "Offline"}
        </span>
      </div>

      {pending.length === 0 ? (
        <p className="mt-3 text-sm text-pay-ink-muted">
          Nothing queued. Transfers prepared without a connection appear here until they can be confirmed.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pending.map((item) => {
            const expired = isExpired(item);
            const statusLabel =
              item.status === "sending"
                ? "Sending…"
                : item.status === "needs_confirmation"
                  ? "Needs your confirmation"
                  : expired
                    ? "Expired — confirm again"
                    : "Queued — awaiting connection";
            return (
              <li key={item.id} className="rounded-xl border border-black/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-pay-ink">
                      {koboToNaira(item.amountKobo, "NGN")} to {item.target}
                    </p>
                    <p className="text-xs text-pay-ink-muted">{statusLabel}</p>
                    {item.lastError && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-amber-strong">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {item.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void retry(item)}
                      disabled={busy === item.id || !online}
                      className="inline-flex items-center gap-1 rounded-full bg-pay-green px-3 py-1.5 text-xs font-bold text-white transition hover:bg-pay-deep disabled:opacity-50"
                    >
                      {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                      {online ? "Retry" : "Offline"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeItem(item.id);
                        refresh();
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-pay-ink transition hover:bg-pay-mint"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" /> Cancel
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {message && (
        <p className="mt-3 rounded-lg bg-pay-mint px-3 py-2 text-xs font-semibold text-pay-ink" role="status">
          {message}
        </p>
      )}
      <p className="mt-3 text-[11px] text-pay-ink-muted">
        A queued transfer is not settled money. Only the server can confirm it was sent, and retrying reuses the same key
        so it cannot send twice.
      </p>
    </section>
  );
}

/** Queue helper used by the send screen when the device is offline. */
export function queueTransferIntent(input: { ownerUserId: string; recipientEmail: string; amountKobo: string; note?: string }) {
  // Imported lazily to keep this module free of storage access on the server.
  return import("@/lib/pay/outbox").then((mod) =>
    mod.queueIntent({ kind: "transfer", target: input.recipientEmail, amountKobo: input.amountKobo, note: input.note, ownerUserId: input.ownerUserId })
  );
}

/** Exposed for tests: mark an item as needing a fresh confirmation. */
export function requireConfirmation(id: string, reason: string) {
  updateItem(id, { status: "needs_confirmation", lastError: reason });
}
