"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Profile = { id: string; name: string; slug: string; bio: string | null; avatarUrl: string | null; coverUrl: string | null; genres: string[] };

/** Editable creator profile. Every save persists to the artist record. */
export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "signed-out" | "no-artist">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/stream/profile", { credentials: "include" })
      .then((res) =>
        res.ok ? res.json() : res.json().then((b) => Promise.reject(Object.assign(new Error(b.code ?? "error"), { status: res.status, code: b.code })))
      )
      .then((body) => {
        setProfile(body.artist);
        setState("ready");
      })
      .catch((err) => setState(err.status === 401 || err.code === "signed_out" ? "signed-out" : err.code === "no_artist" ? "no-artist" : "error"));
  }, []);

  useEffect(load, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/stream/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: profile.name, bio: profile.bio, avatarUrl: profile.avatarUrl, coverUrl: profile.coverUrl, genres: profile.genres })
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setProfile(body);
      setMessage("Profile saved.");
    } else {
      setMessage(body.error ?? "Could not save the profile.");
    }
  }

  if (state === "signed-out") {
    return (
      <p className="text-[12.5px] text-white/60">
        <Link href="/login?next=/naijastream/studio/settings" className="font-bold text-emerald-400">Sign in</Link> to manage your creator profile.
      </p>
    );
  }
  if (state === "no-artist") {
    return (
      <p className="text-[12.5px] leading-7 text-white/60">
        Your account is a listener account, so there is no artist profile to edit. Creator profiles are provisioned by the platform team and then
        appear in <Link href="/naijastream/studio" className="font-bold text-emerald-400">Studio</Link>.
      </p>
    );
  }
  if (state === "loading") return <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-label="Loading profile" />;
  if (state === "error" || !profile) return <p className="text-[12.5px] text-red-300">Profile could not be loaded.</p>;

  return (
    <form onSubmit={save} className="mt-4 max-w-xl space-y-4">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
        Artist name
        <input
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          maxLength={80}
          required
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
        />
      </label>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
        Bio
        <textarea
          value={profile.bio ?? ""}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          rows={4}
          maxLength={1000}
          className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
          Avatar URL
          <input
            value={profile.avatarUrl ?? ""}
            onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
            placeholder="/generated/stream/opt/stream-artist-adaeze.jpg"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
          />
        </label>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
          Cover URL
          <input
            value={profile.coverUrl ?? ""}
            onChange={(e) => setProfile({ ...profile, coverUrl: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
          />
        </label>
      </div>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
        Genres (comma separated, max 5)
        <input
          value={profile.genres.join(", ")}
          onChange={(e) => setProfile({ ...profile, genres: e.target.value.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 5) })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-full bg-emerald-500 px-6 py-2.5 text-[12.5px] font-bold text-black disabled:opacity-60">
          {saving ? "Saving…" : "Save profile"}
        </button>
        <Link href={`/naijastream/artists/${profile.slug}`} className="text-[12px] font-bold text-emerald-400 hover:underline">
          View public profile →
        </Link>
      </div>
      {message ? <p role="status" className="text-[12px] font-semibold text-emerald-300">{message}</p> : null}
    </form>
  );
}
