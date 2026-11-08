"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";

type Note = { id: string; kind: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function StreamNotifications() {
  const [items, setItems] = useState<Note[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    fetch("/api/stream/notifications", { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((b) => Promise.reject(Object.assign(new Error(b.error ?? "Failed"), { status: res.status })))
      )
      .then((body) => {
        setItems(body.items ?? []);
        setUnread(body.unread ?? 0);
        setState("ready");
      })
      .catch((err) => setState(err.status === 401 ? "signed-out" : "error"));
  }, []);

  useEffect(load, [load]);

  async function markAll() {
    const res = await fetch("/api/stream/notifications", { method: "POST", credentials: "include" });
    const body = await res.json().catch(() => ({}));
    setNotice(res.ok ? `${body.updated} notification(s) marked read.` : "Could not update notifications.");
    if (res.ok) load();
  }

  if (state === "signed-out") {
    return (
      <div className="rounded-xl border border-white/10 bg-[#101613] p-8 text-center">
        <h2 className="font-display text-lg font-extrabold">Sign in for notifications</h2>
        <p className="mt-1 text-[12px] text-white/55">New releases from artists you follow appear here.</p>
        <Link href="/login?next=/naijastream/notifications" className="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
          Sign in
        </Link>
      </div>
    );
  }
  if (state === "loading") {
    return <Loader2 className="mx-auto my-12 h-7 w-7 animate-spin text-emerald-400" aria-label="Loading" />;
  }
  if (state === "error" || items === null) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-[12.5px] text-red-200">
        Notifications could not be loaded. <button type="button" onClick={load} className="font-bold underline">Try again</button>
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-white/50">{unread} unread</p>
        {unread > 0 ? (
          <button type="button" onClick={() => void markAll()} className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-[11.5px] font-bold text-white/80 hover:bg-white/5">
            <Check className="h-3.5 w-3.5" aria-hidden /> Mark all read
          </button>
        ) : null}
      </div>
      {notice ? <p role="status" className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-[11.5px] text-emerald-200">{notice}</p> : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          <Bell className="mx-auto mb-2 h-6 w-6 text-white/30" aria-hidden />
          No notifications yet. Follow artists to hear about new releases.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5">
          {items.map((note) => {
            const content = (
              <div className={`flex items-start gap-3 rounded-lg px-3 py-3 ${note.readAt ? "text-white/60" : "bg-white/[0.04] text-white"}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${note.readAt ? "bg-white/20" : "bg-emerald-400"}`} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">{note.title}</span>
                  {note.body ? <span className="block text-[11.5px] text-white/50">{note.body}</span> : null}
                  <span className="mt-0.5 block text-[10.5px] text-white/35">{new Date(note.createdAt).toLocaleString("en-NG")}</span>
                </span>
              </div>
            );
            return <li key={note.id}>{note.href ? <Link href={note.href} className="block hover:bg-white/5">{content}</Link> : content}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
