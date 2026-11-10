"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Send } from "lucide-react";

/**
 * Aura composer — the approved variant per surface.
 *
 * `desktop` is the mint-outlined bar from the wide mockup (paperclip, divider,
 * mic, mint send). `mobile` is the round-button bar from the phone mockup. The
 * mic and paperclip are disabled and say so: this build has no speech-to-text or
 * file-understanding path, and a control that looks live but does nothing is a
 * false promise.
 */
export function AuraComposer({
  onSend,
  onStop,
  streaming,
  placeholder = "Ask Aura anything…",
  variant = "desktop",
  autoFocus = false
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
  variant?: "desktop" | "mobile";
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, variant === "desktop" ? 120 : 140)}px`;
  }, [value, variant]);

  function submit() {
    const text = value.trim();
    if (!text || streaming) return;
    setValue("");
    onSend(text);
  }

  const desktop = variant === "desktop";

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={
          desktop
            ? "flex items-end gap-2 rounded-2xl border border-aura-mint/45 bg-aura-composer py-1.5 pl-4 pr-1.5 focus-within:border-aura-mint"
            : "flex items-center gap-2 rounded-2xl border border-aura-border bg-aura-composer px-3 py-2"
        }
      >
        <label className="sr-only" htmlFor={desktop ? "aura-composer-desktop" : "aura-composer-mobile"}>
          Ask Aura
        </label>
        <textarea
          id={desktop ? "aura-composer-desktop" : "aura-composer-mobile"}
          ref={areaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="min-h-[38px] flex-1 resize-none self-center bg-transparent py-2 text-[15px] leading-snug text-white placeholder:text-white/55 focus:outline-none"
        />
        {desktop && <span className="mb-2 h-6 w-px shrink-0 bg-white/20" aria-hidden="true" />}
        <button
          type="button"
          aria-label="Attach a file (not available yet)"
          aria-disabled="true"
          onClick={() => setNotice("Attachments are not supported yet — Aura cannot read files in this build.")}
          className="mb-0.5 shrink-0 rounded-lg p-2 text-white/45 transition hover:bg-white/5"
        >
          <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Voice input (not available yet)"
          aria-disabled="true"
          onClick={() => setNotice("Voice input is not available yet — typing works as usual.")}
          className="mb-0.5 shrink-0 rounded-lg p-2 text-white/60 transition hover:bg-white/5"
        >
          <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aura-surface text-white"
          >
            <span className="block h-3 w-3 rounded-[2px] bg-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send message"
            className={`mb-0.5 flex shrink-0 items-center justify-center bg-aura-mint text-aura-canvas transition hover:brightness-105 disabled:opacity-45 ${
              desktop ? "h-9 w-10 rounded-lg" : "h-10 w-10 rounded-full"
            }`}
          >
            <Send className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        )}
      </form>
      {notice && (
        <p className="mt-1.5 px-1 text-[11.5px] text-white/65" role="status">
          {notice}{" "}
          <button type="button" onClick={() => setNotice("")} className="underline">
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
