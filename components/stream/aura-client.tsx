"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

type Result = { kind: string; title: string; subtitle: string; href: string };
type Answer = { answer: string; groundedOn: string; results: Result[] };

const SUGGESTIONS = ["Play relaxing Afrobeats", "Find gospel artists", "What podcasts are there?", "Any live events coming up?", "Amapiano playlists"];

/**
 * Aura — grounded discovery over the real NaijaStream catalogue. Answers are
 * assembled from records that exist; the "grounded on" line shows exactly which
 * items produced the answer so nothing is invented.
 */
export function AuraClient() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/stream/aura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Aura could not answer right now.");
      setAnswer(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aura could not answer right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about music, artists, podcasts or events…"
          aria-label="Ask Aura a question"
          maxLength={300}
          className="h-11 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-[13px] text-white outline-none placeholder:text-white/40 focus:border-emerald-400/50"
        />
        <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 text-[12.5px] font-bold text-black disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Ask
        </button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                void ask(suggestion);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] font-semibold text-white/70 hover:border-emerald-400/40 hover:text-emerald-300"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-[12px] text-red-200">{error}</p> : null}

      {answer ? (
        <section className="mt-5 rounded-2xl border border-emerald-400/20 bg-[#101613] p-5">
          <p className="text-[13px] leading-7 text-white/85">{answer.answer}</p>
          {answer.results.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {answer.results.map((result) => (
                <li key={result.href}>
                  <Link href={result.href} className="block rounded-xl bg-white/5 p-3 hover:bg-white/10">
                    <p className="text-[12.5px] font-bold">{result.title}</p>
                    <p className="text-[10.5px] text-white/45">{result.subtitle}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-white/35">
            Grounded on catalogue records only — Aura does not invent artists, counts or earnings.
          </p>
        </section>
      ) : null}
    </div>
  );
}
