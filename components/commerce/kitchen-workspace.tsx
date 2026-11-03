"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KitchenOrders } from "./kitchen-orders";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  priceKobo: string;
  published: boolean;
  available: boolean;
}
interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  market: string;
  status: "PENDING" | "VERIFIED" | "SUSPENDED";
  isSample: boolean;
}
interface Application {
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  kitchenName: string;
  note: string | null;
}

export function KitchenWorkspace() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [edits, setEdits] = useState<Record<string, { name: string; price: string }>>({});
  const [draft, setDraft] = useState({ name: "", description: "", price: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const appRes = await fetch("/api/restaurant/application", { cache: "no-store" });
      const appBody = await appRes.json().catch(() => null);
      setApplication(appBody?.application ?? null);
      setRestaurant(appBody?.restaurant ?? null);
      if (appBody?.restaurant) {
        const menuRes = await fetch("/api/restaurant/menu", { cache: "no-store" });
        const menuBody = await menuRes.json().catch(() => null);
        if (menuRes.ok) {
          setItems(Array.isArray(menuBody.items) ? menuBody.items : []);
          setEdits(Object.fromEntries((menuBody.items ?? []).map((item: MenuItem) => [item.id, { name: item.name, price: String(Number(item.priceKobo) / 100) }])));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your kitchen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createItem() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/restaurant/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, description: draft.description, priceNaira: draft.price })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Create failed with HTTP ${res.status}`);
      setDraft({ name: "", description: "", price: "" });
      setNotice("Draft item created. Publish it when it is ready for customers.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the item.");
    } finally {
      setBusy("");
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>, message: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/restaurant/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Update failed with HTTP ${res.status}`);
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the item.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="rounded-2xl border border-border-soft bg-canvas p-6 text-sm text-muted">Loading your kitchen…</p>;

  if (!restaurant) {
    return (
      <section className="rounded-2xl border border-border-soft bg-canvas p-6">
        <p className="text-xs font-black uppercase tracking-wide text-primary">NaijaEats partner</p>
        <h1 className="font-display text-2xl font-extrabold">{application ? application.kitchenName : "No kitchen yet"}</h1>
        <p className="mt-1 text-sm text-muted">
          {application?.status === "SUBMITTED"
            ? "Your application is waiting for administrator review."
            : application?.status === "REJECTED"
              ? `Your application was rejected: ${application.note ?? "No reason given."}`
              : "Apply to operate a kitchen before you can publish a menu."}
        </p>
        <Link href="/restaurant/apply" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">
          {application?.status === "REJECTED" ? "Correct and resubmit" : "Kitchen application"}
        </Link>
      </section>
    );
  }

  const suspended = restaurant.status !== "VERIFIED";

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border-soft bg-canvas p-5">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Kitchen workspace</p>
        <h1 className="font-display text-2xl font-extrabold">{restaurant.name}</h1>
        <p className="text-sm text-muted">{restaurant.cuisine} · {restaurant.market}</p>
        <p className="mt-1 inline-flex rounded-full bg-surface-low px-2.5 py-1 text-[11px] font-bold">{suspended ? "Suspended — menu writes blocked" : "Verified partner"}</p>
      </header>

      {notice ? <p role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">{error}</p> : null}

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-lg font-extrabold">Menu</h2>
        <p className="text-xs text-muted">Prices are entered in naira. Draft items stay private until you publish them.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Item name" aria-label="New item name" className="min-h-10 rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold" />
          <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="Price ₦" aria-label="New item price in naira" inputMode="decimal" className="min-h-10 w-28 rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold" />
          <button type="button" disabled={busy === "create" || !draft.name || !draft.price || suspended} onClick={() => void createItem()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">Add draft</button>
        </div>
        <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description (optional)" aria-label="New item description" className="mt-2 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold" />

        {items.length === 0 ? <p className="mt-4 text-sm text-muted">No menu items yet.</p> : (
          <ul className="mt-4 divide-y divide-border-soft">
            {items.map((item) => {
              const edit = edits[item.id] ?? { name: item.name, price: String(Number(item.priceKobo) / 100) };
              return (
                <li key={item.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={edit.name} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, name: e.target.value } })} aria-label={`Name for ${item.name}`} className="min-h-9 min-w-40 flex-1 rounded-lg border border-border-soft bg-surface-low px-2 text-sm font-semibold" />
                    <input value={edit.price} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, price: e.target.value } })} aria-label={`Price in naira for ${item.name}`} inputMode="decimal" className="min-h-9 w-24 rounded-lg border border-border-soft bg-surface-low px-2 text-sm font-semibold" />
                    <button type="button" disabled={busy === item.id || suspended} onClick={() => void patchItem(item.id, { name: edit.name, priceNaira: edit.price }, `${edit.name} saved.`)} className="rounded-lg border border-border-soft px-2.5 py-1.5 text-xs font-bold">Save</button>
                    <button type="button" disabled={busy === item.id || suspended} onClick={() => void patchItem(item.id, { published: !item.published }, item.published ? "Item unpublished." : "Item published.")} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">{item.published ? "Unpublish" : "Publish"}</button>
                    <button type="button" disabled={busy === item.id || suspended} onClick={() => void patchItem(item.id, { available: !item.available }, item.available ? "Item marked unavailable." : "Item marked available.")} className="rounded-lg border border-border-soft px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">{item.available ? "Mark unavailable" : "Mark available"}</button>
                    <span className="rounded-full bg-surface-low px-2 py-1 text-[10px] font-bold uppercase">{item.published ? (item.available ? "Live" : "Unavailable") : "Draft"}</span>
                  </div>
                  {item.description ? <p className="mt-1 text-xs text-muted">{item.description}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <KitchenOrders />
    </div>
  );
}
