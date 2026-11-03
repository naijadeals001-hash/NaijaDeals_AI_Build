"use client";

import { useEffect, useState } from "react";

type Config = {
  announcement: string;
  heroTitle: string;
  heroSubtitle: string;
  visibleCategories: string[];
  categoryOrder: string[];
  shelfLimit: number;
  showDemoProducts: boolean;
  showHero: boolean;
  showShelves: boolean;
};

const EMPTY: Config = {
  announcement: "",
  heroTitle: "",
  heroSubtitle: "",
  visibleCategories: [],
  categoryOrder: [],
  shelfLimit: 4,
  showDemoProducts: true,
  showHero: true,
  showShelves: true
};

export function AdminStorefrontPanel() {
  const [config, setConfig] = useState<Config>(EMPTY);
  const [orderText, setOrderText] = useState("");
  const [visibleText, setVisibleText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/storefront", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Could not load storefront settings.");
        setConfig(body);
        setOrderText((body.categoryOrder ?? []).join(", "));
        setVisibleText((body.visibleCategories ?? []).join(", "));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load storefront settings."));
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          categoryOrder: orderText.split(",").map((item) => item.trim()).filter(Boolean),
          visibleCategories: visibleText.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not save storefront settings.");
      setMessage("Storefront settings saved. The storefront updates on reload.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save storefront settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
      <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Storefront controls</h2>
      <p className="text-xs text-[#8B949E]">Hero copy, announcement, visible departments, shelf order and demo inventory visibility.</p>
      {message ? <p className="mt-2 rounded bg-[#00E676]/10 p-2 text-xs font-bold text-[#00E676]">{message}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded bg-crimson/10 p-2 text-xs font-bold text-crimson">{error}</p> : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-bold text-[#8B949E]">Announcement
          <input value={config.announcement} onChange={(event) => setConfig({ ...config, announcement: event.target.value })} className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
        <label className="text-xs font-bold text-[#8B949E]">Shelf item limit (1-8)
          <input type="number" min={1} max={8} value={config.shelfLimit} onChange={(event) => setConfig({ ...config, shelfLimit: Number(event.target.value) })} className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
        <label className="text-xs font-bold text-[#8B949E]">Hero title
          <input value={config.heroTitle} onChange={(event) => setConfig({ ...config, heroTitle: event.target.value })} className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
        <label className="text-xs font-bold text-[#8B949E]">Hero subtitle
          <input value={config.heroSubtitle} onChange={(event) => setConfig({ ...config, heroSubtitle: event.target.value })} className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
        <label className="text-xs font-bold text-[#8B949E]">Visible department slugs (blank = all)
          <input value={visibleText} onChange={(event) => setVisibleText(event.target.value)} placeholder="phones-tablets, computers" className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
        <label className="text-xs font-bold text-[#8B949E]">Shelf order (slug, comma separated)
          <input value={orderText} onChange={(event) => setOrderText(event.target.value)} placeholder="computers, beauty, home-kitchen" className="mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC]" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-[#F0F6FC]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.showDemoProducts} onChange={(event) => setConfig({ ...config, showDemoProducts: event.target.checked })} /> Show demo inventory</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.showHero} onChange={(event) => setConfig({ ...config, showHero: event.target.checked })} /> Show hero</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.showShelves} onChange={(event) => setConfig({ ...config, showShelves: event.target.checked })} /> Show shelves</label>
      </div>

      <button type="button" onClick={() => void save()} disabled={busy} className="mt-3 rounded-lg bg-[#00E676] px-4 py-2 text-xs font-bold text-[#0B0E14] disabled:opacity-50">
        {busy ? "Saving…" : "Save storefront controls"}
      </button>
    </section>
  );
}
