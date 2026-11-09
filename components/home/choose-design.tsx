"use client";

import { useState } from "react";

/** Applies a manual homepage choice and reloads. */
export function ChooseDesign({ designKey, disabled, current }: { designKey: string; disabled: boolean; current: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/home/design", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant: designKey })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not change the design.");
      return;
    }
    window.location.assign("/");
  }

  if (current) return <span className="rounded-full bg-[#e8f3e4] px-3 py-1.5 text-[11px] font-extrabold text-[#0b5c33]">You are using this</span>;

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void choose()} disabled={disabled || busy} className="rounded-full bg-[#f26b21] px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50">
        {busy ? "Switching…" : "Use this design"}
      </button>
      {error ? <span role="alert" className="mt-1 text-[10px] font-semibold text-[#a3480f]">{error}</span> : null}
    </span>
  );
}
