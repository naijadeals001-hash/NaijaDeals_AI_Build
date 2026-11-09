"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGrid, X } from "lucide-react";

/**
 * First-visit cookie issuer and the "Change homepage design" control.
 *
 * The server cannot set cookies while rendering a Server Component, so this
 * calls /api/home/visit once. It also records one aggregate impression.
 */
export function DesignSwitcher({ current, manual, visitorId }: { current: string; manual: boolean; visitorId: string | null }) {
  // Collapsed by default on small screens so it never covers the cards.
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visitorId) return;
    void fetch("/api/home/visit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, variant: current })
    }).catch(() => null);
  }, [visitorId, current]);

  useEffect(() => {
    const payload = JSON.stringify({ variant: current, kind: "impression" });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/home/metrics", new Blob([payload], { type: "application/json" }));
  }, [current]);

  async function choose(key: string) {
    setBusy(true);
    await fetch("/api/home/design", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant: key })
    }).catch(() => null);
    window.location.reload();
  }

  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} className="fixed bottom-20 left-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-[#0b3d21] text-white shadow-lg lg:bottom-4" aria-label="Change homepage design">
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <aside aria-label="Change homepage design" className="fixed bottom-[4.6rem] left-3 right-3 z-30 rounded-xl bg-white p-2 shadow-xl ring-1 ring-[#e6ebe7] sm:left-auto sm:right-4 sm:w-[300px] lg:bottom-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-extrabold text-[#0b3d21]">
          Homepage design {manual ? <span className="font-normal text-[#6b7a70]">· your choice</span> : <span className="font-normal text-[#6b7a70]">· assigned to you</span>}
        </p>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide design switcher" className="rounded p-0.5 text-[#6b7a70] hover:bg-[#f2f9f0]"><X className="h-3.5 w-3.5" aria-hidden /></button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {[["original", "Original"], ["africa-super-app", "Super-App"], ["mobility", "Mobility"], ["commerce", "Commerce"]].map(([key, label]) => (
          <button key={key} type="button" disabled={busy} onClick={() => void choose(key)} aria-pressed={current === key} className={`rounded-lg px-2 py-1.5 text-[10.5px] font-bold ${current === key ? "bg-[#0b3d21] text-white" : "bg-[#f6f8f6] text-[#14241b] hover:bg-[#e8f3e4]"}`}>
            {label}
          </button>
        ))}
      </div>
      <Link href="/designs" className="mt-1.5 block text-center text-[10px] font-bold text-[#0b5c33] underline">Preview all four designs</Link>
    </aside>
  );
}
