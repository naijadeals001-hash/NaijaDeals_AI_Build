"use client";

import Link from "next/link";
import { useState } from "react";
import { Trash2 } from "lucide-react";

type Plan = { id: string; title: string; city: string | null; status: string; updatedAt: string };

/** Plan list with an explicit delete; deletion is server-authorised by ownership. */
export function SavedPlanList({ plans }: { plans: Plan[] }) {
  const [items, setItems] = useState(plans);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function remove(id: string) {
    setBusy(id);
    setError("");
    const res = await fetch(`/api/aura/saved?planId=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError("That plan could not be removed.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <ul className="mt-2 space-y-2">
        {items.map((plan) => (
          <li key={plan.id} className="flex items-center justify-between gap-2 rounded-xl border border-aura-border bg-aura-surface px-4 py-3">
            <Link href={`/aura-ai/plans/${plan.id}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-aura-text">{plan.title}</span>
              <span className="block text-[11px] text-aura-muted">
                {plan.city ? `${plan.city} · ` : ""}
                {plan.status} · {new Date(plan.updatedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void remove(plan.id)}
              disabled={busy === plan.id}
              aria-label={`Delete plan ${plan.title}`}
              className="rounded-md p-1.5 text-aura-muted transition hover:bg-aura-danger/10 hover:text-aura-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-aura-danger">{error}</p>}
    </div>
  );
}
