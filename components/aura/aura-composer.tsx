"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react";

/**
 * Aura composer.
 *
 * The microphone and attachment controls are present only as clearly-disabled
 * controls: this build has no speech-to-text or file-understanding path, so
 * offering a working-looking button would be a false promise. Text is always
 * available.
 */
export function AuraComposer({
  onSend,
  onStop,
  streaming,
  placeholder = "Ask Aura anything…",
  autoFocus = false
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  // Keep the textarea height in step with the content (mobile keyboards shrink
  // the viewport, so the composer must not run away).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || streaming) return;
    setValue("");
    onSend(text);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-2xl border border-aura-border bg-aura-composer p-2 focus-within:border-aura-mint/50"
      >
        <button
          type="button"
          onClick={() => setNotice("Attachments are not supported yet — this build cannot read files.")}
          aria-label="Attach a file (not available yet)"
          className="mb-0.5 rounded-lg p-2 text-aura-muted/50 transition hover:bg-aura-surface"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="aura-composer-input">
          Ask Aura
        </label>
        <textarea
          id="aura-composer-input"
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
          className="max-h-[140px] min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug text-aura-text placeholder:text-aura-muted/70 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setNotice("Voice input is not available yet — typing works as usual.")}
          aria-label="Voice input (not available yet)"
          className="mb-0.5 rounded-lg p-2 text-aura-muted/50 transition hover:bg-aura-surface"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
        </button>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-aura-surface text-aura-text transition hover:bg-aura-border"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send message"
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-aura-mint text-aura-canvas transition hover:brightness-105 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </form>
      {notice && (
        <p className="mt-1.5 px-1 text-[11px] text-aura-muted" role="status">
          {notice}{" "}
          <button type="button" onClick={() => setNotice("")} className="underline">
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
