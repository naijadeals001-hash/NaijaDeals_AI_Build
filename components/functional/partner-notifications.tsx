"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function PartnerNotifications() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/notifications", { cache: "no-store" });
      if (res.status === 401) {
        setLoading(false);
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setRows(Array.isArray(body?.notifications) ? body.notifications : []);
      setUnread(Number(body?.unread ?? 0));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load updates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    await fetch("/api/partner/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true })
    });
    await load();
  }

  if (loading) return null;

  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5" aria-label="Partner updates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">
          Updates {unread > 0 ? <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-white">{unread}</span> : null}
        </h2>
        {unread > 0 ? (
          <button type="button" onClick={() => void markAllRead()} className="text-xs font-bold text-primary underline">
            Mark all read
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-crimson">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No partner updates yet. Application decisions, assignments and account changes will appear here.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.slice(0, 6).map((row) => (
            <li key={row.id} className={`rounded-xl border p-3 ${row.readAt ? "border-border-soft bg-surface-low" : "border-primary/30 bg-primary-soft"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold">{row.title}</p>
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{new Date(row.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              {row.body ? <p className="mt-1 text-xs text-muted">{row.body}</p> : null}
              {row.href ? (
                <Link href={row.href} className="mt-1 inline-block text-xs font-bold text-primary underline">
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
