"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

type Prefs = {
  personalised: boolean;
  useSavedPreferences: boolean;
  savedPreferences: unknown;
  preferredCity: string | null;
  preferredArea: string | null;
};

/**
 * Privacy and personalisation controls.
 *
 * Each control states its effect plainly. Turning personalisation off clears the
 * stored preferences server-side rather than freezing them, and "delete all
 * conversations" removes this user's conversations and plans — never anyone
 * else's.
 */
export function AuraPreferencesForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [counts, setCounts] = useState({ conversationCount: 0, savedCount: 0 });
  const [notes, setNotes] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/aura/preferences", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body) return;
        setPrefs(body.preferences);
        setCounts({ conversationCount: body.conversationCount ?? 0, savedCount: body.savedCount ?? 0 });
        setCity(body.preferences?.preferredCity ?? "");
        setArea(body.preferences?.preferredArea ?? "");
        const saved = body.preferences?.savedPreferences as { notes?: string } | null;
        setNotes(saved?.notes ?? "");
      })
      .catch(() => setError("Could not load your settings."));
  }, []);

  async function save(next: Prefs) {
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/aura/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...next, savedPreferences: notes, preferredCity: city, preferredArea: area })
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError("That could not be saved.");
      return;
    }
    const body = await res.json();
    setPrefs({
      personalised: body.preferences.personalised,
      useSavedPreferences: body.preferences.useSavedPreferences,
      savedPreferences: body.preferences.savedPreferences,
      preferredCity: body.preferences.preferredCity,
      preferredArea: body.preferences.preferredArea
    });
    setMessage("Saved.");
  }

  async function clearAll() {
    if (!window.confirm("Delete every Aura conversation and plan on this account? This cannot be undone.")) return;
    const res = await fetch("/api/aura/preferences?scope=conversations", { method: "DELETE", credentials: "include" }).catch(() => null);
    if (!res?.ok) {
      setError("Could not delete them.");
      return;
    }
    const body = await res.json();
    setCounts((c) => ({ ...c, conversationCount: 0 }));
    setMessage(`Deleted ${body.removed ?? 0} conversation(s).`);
  }

  if (!prefs) return <p className="mt-6 text-sm text-aura-muted">Loading…</p>;

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-2xl border border-aura-border bg-aura-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Personalised suggestions</p>
            <p className="mt-0.5 text-xs text-aura-muted">Off by default. When off, stored preferences are deleted, not just ignored.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.personalised}
            aria-label="Personalised suggestions"
            onClick={() => void save({ ...prefs, personalised: !prefs.personalised })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${prefs.personalised ? "bg-aura-mint" : "bg-aura-border"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-aura-canvas transition ${prefs.personalised ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>

        {prefs.personalised && (
          <div className="mt-4 space-y-3 border-t border-aura-border pt-4">
            <label className="block">
              <span className="text-xs font-semibold text-aura-text/85">What Aura may remember about your preferences</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Quiet places, mainly vegetarian, budget around ₦40,000 a weekend."
                className="mt-1 w-full rounded-xl border border-aura-border bg-aura-canvas px-3 py-2 text-sm text-aura-text placeholder:text-aura-muted/60"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-aura-text/85">Preferred city</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Abuja"
                  className="mt-1 w-full rounded-xl border border-aura-border bg-aura-canvas px-3 py-2 text-sm text-aura-text"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-aura-text/85">Preferred area</span>
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Wuse 2"
                  className="mt-1 w-full rounded-xl border border-aura-border bg-aura-canvas px-3 py-2 text-sm text-aura-text"
                />
              </label>
            </div>
            <p className="text-[11px] text-aura-muted">
              Aura never reads your device location. A city typed here is the only location it uses.
            </p>
            <button
              type="button"
              onClick={() => void save(prefs)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-aura-mint px-4 py-2 text-sm font-bold text-aura-canvas disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Save preferences
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-aura-border bg-aura-surface p-4">
        <p className="text-sm font-bold">Your data</p>
        <p className="mt-1 text-xs text-aura-muted">
          {counts.conversationCount} conversation{counts.conversationCount === 1 ? "" : "s"} · {counts.savedCount} saved answer
          {counts.savedCount === 1 ? "" : "s"}. Conversations are visible only to you.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void clearAll()} className="rounded-full border border-aura-danger/40 px-4 py-2 text-xs font-bold text-aura-danger">
            Delete all conversations
          </button>
          <a href="/aura-ai" className="rounded-full border border-aura-border px-4 py-2 text-xs font-semibold text-aura-text/85">
            Back to chat
          </a>
        </div>
      </section>

      {message && (
        <p className="flex items-center gap-1.5 text-xs text-aura-mint" role="status">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> {message}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-aura-danger" role="alert">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
