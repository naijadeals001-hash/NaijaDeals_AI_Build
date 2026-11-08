"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

type Asset = { id: string; kind: string; status: string; originalName?: string | null; durationSec?: number | null; error?: string | null };

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  PROCESSING: "bg-sky-500/15 text-sky-300",
  READY: "bg-emerald-500/15 text-emerald-300",
  FAILED: "bg-red-500/15 text-red-300",
  CANCELLED: "bg-white/10 text-white/50"
};

function fmt(seconds?: number | null) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Real creator upload workflow: authenticated upload → server-side validation →
 * private storage → FFmpeg metadata processing → draft track → publish.
 * Progress is measured from the actual upload stream, and processing state is
 * polled from the server (never assumed).
 */
export function UploadStudio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "draft" | "published" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ title: "", genre: "", rights: false, explicit: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAssets = useCallback(() => {
    fetch("/api/stream/media", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((body) => setAssets(body.assets ?? []))
      .catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    loadAssets();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadAssets]);

  function uploadWithProgress(file: File, kind: "AUDIO" | "IMAGE", purpose: string) {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      body.append("purpose", purpose);
      xhr.open("POST", "/api/stream/media");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(parsed.id);
          else reject(new Error(parsed.error ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error("Upload failed."));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.send(body);
    });
  }

  async function handleAudio(file: File) {
    setPhase("uploading");
    setMessage("");
    setProgress(0);
    try {
      const id = await uploadWithProgress(file, "AUDIO", "TRACK");
      setAudioId(id);
      setProgress(100);
      setPhase("processing");
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/stream/media/${id}`, { credentials: "include" });
        const asset = await res.json().catch(() => null);
        if (!asset) return;
        loadAssets();
        if (asset.status === "READY") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("idle");
          setMessage(`Audio ready · ${fmt(asset.durationSec)}`);
        } else if (asset.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("error");
          setMessage(asset.error ?? "Audio processing failed.");
        }
      }, 1500);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!audioId) {
      setMessage("Upload an audio file first.");
      return;
    }
    if (!form.rights) {
      setMessage("You must confirm you own the rights to this recording.");
      return;
    }
    setPhase("processing");
    const res = await fetch("/api/stream/studio/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: form.title, mediaId: audioId, genre: form.genre, explicit: form.explicit, rightsDeclared: true })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPhase("error");
      setMessage(body.error ?? "Could not create the track.");
      return;
    }
    setPhase("draft");
    setMessage(`Draft saved: ${body.title}. Publish when ready.`);
    setForm({ title: "", genre: "", rights: false, explicit: false });
    setAudioId(null);
    loadAssets();
    window.sessionStorage.setItem("stream.lastDraftSlug", body.slug);
  }

  const readyAudio = assets.filter((a) => a.kind === "AUDIO");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-[26px] font-extrabold">Upload a release</h1>
      <p className="mt-1 text-[12px] text-white/50">Upload audio, we process it, you publish. Only published audio is publicly streamable.</p>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-8 text-center hover:border-emerald-400/50">
        <Upload className="mb-2 h-6 w-6 text-emerald-400" aria-hidden />
        <span className="text-[13px] font-bold">Choose an audio file</span>
        <span className="mt-1 text-[11px] text-white/45">MP3, WAV, OGG, M4A, AAC or FLAC · up to 60 MB</span>
        <input
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleAudio(file);
          }}
        />
      </label>

      {progress !== null ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-white/45">
            {phase === "processing" ? "Processing audio…" : `Uploaded ${progress}%`}
          </p>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`mt-3 rounded-lg p-3 text-[12px] font-semibold ${phase === "error" ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-200"}`}>
          {message}
        </p>
      ) : null}

      <form onSubmit={saveDraft} className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-[#101613] p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Release details</p>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            maxLength={140}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
          />
        </label>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-white/50">
          Genre
          <input
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
            placeholder="Afrobeats"
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-white outline-none focus:border-emerald-400/50"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-white/70">
          <input type="checkbox" checked={form.explicit} onChange={(e) => setForm({ ...form, explicit: e.target.checked })} className="h-4 w-4 accent-emerald-500" />
          Explicit content
        </label>
        <label className="flex items-start gap-2 text-[12px] text-white/70">
          <input type="checkbox" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} className="mt-0.5 h-4 w-4 accent-emerald-500" />
          I own the rights to this recording and have permission to distribute it on NaijaStream.
        </label>
        <button type="submit" className="rounded-full bg-emerald-500 px-6 py-2.5 text-[12.5px] font-bold text-black disabled:opacity-50">
          Save draft
        </button>
      </form>

      {phase === "draft" ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-[12px] text-emerald-100">
          <p className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Draft created
          </p>
          <p className="mt-1">Publish it from the studio catalogue when you are ready.</p>
          <Link href="/naijastream/studio" className="mt-2 inline-block rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-bold text-black">
            Go to studio
          </Link>
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Your uploads</h2>
        {readyAudio.length === 0 ? (
          <p className="mt-2 text-[12px] text-white/45">No uploads yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5">
            {readyAudio.map((asset) => (
              <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5 text-[12px]">
                <span className="min-w-0 truncate">{asset.originalName ?? asset.id}</span>
                <span className="flex items-center gap-2 text-[10.5px] text-white/40">
                  {asset.status === "PROCESSING" || asset.status === "PENDING" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                  <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_TONE[asset.status] ?? ""}`}>{asset.status}</span>
                  <span>{fmt(asset.durationSec)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
