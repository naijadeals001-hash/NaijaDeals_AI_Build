"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Send, X } from "lucide-react";

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
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    // Speech recognition is a browser capability. Report what this device has
    // rather than rendering a button that cannot work.
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceAvailable(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, variant === "desktop" ? 120 : 140)}px`;
  }, [value, variant]);

  const TEXT_TYPES = /\.(txt|md|markdown|csv|json|log)$/i;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!TEXT_TYPES.test(file.name)) {
      setNotice("Attach a text file (.txt, .md, .csv, .json, .log). Images and PDFs cannot be read yet.");
      return;
    }
    if (file.size > 200_000) {
      setNotice("That file is larger than 200 KB. Attach a shorter extract.");
      return;
    }
    const text = await file.text();
    setAttachment({ name: file.name, text: text.slice(0, 8000) });
    setNotice(`Attached ${file.name}. Aura will read it as context when you send.`);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    type Recognition = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setNotice("This browser has no speech recognition. Typing works as usual.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = document.documentElement.lang || "en-NG";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
      setValue((prev) => `${prev}${prev ? " " : ""}${transcript}`.trim());
    };
    recognition.onerror = () => {
      setListening(false);
      setNotice("Voice input stopped. You can type instead.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setNotice("");
  }

  function submit() {
    const text = value.trim();
    if (!text || streaming) return;
    const message = attachment ? `${text}

[Attached file: ${attachment.name}]
"""
${attachment.text}
"""` : text;
    setValue("");
    setAttachment(null);
    setNotice("");
    onSend(message);
  }

  const desktop = variant === "desktop";

  return (
    <div className="w-full">
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.csv,.json,.log,text/plain"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
        aria-hidden="true"
        tabIndex={-1}
      />
      {attachment && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-aura-mint/30 bg-aura-highlight/40 px-3 py-1.5 text-[12px] text-white/85">
          <Paperclip className="h-3.5 w-3.5 text-aura-mint" aria-hidden="true" />
          <span className="truncate">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="ml-auto text-white/60 hover:text-white">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={
          desktop
            ? "flex items-center gap-2 rounded-xl border border-aura-mint bg-aura-composer py-2 pl-5 pr-2 focus-within:border-aura-mint"
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
          className="min-h-[42px] flex-1 resize-none self-center bg-transparent py-2.5 text-[15.5px] leading-snug text-white placeholder:text-white/55 focus:outline-none"
        />
        {desktop && <span className="mb-2 h-6 w-px shrink-0 bg-white/20" aria-hidden="true" />}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a text file"
          title="Attach a text file (.txt, .md, .csv, .json, .log)"
          className="mb-0.5 shrink-0 rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
        >
          <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={listening ? "Stop voice input" : "Speak instead of typing"}
          aria-pressed={listening}
          title={voiceAvailable ? (listening ? "Stop listening" : "Speak instead of typing") : "This browser has no speech recognition"}
          className={`mb-0.5 shrink-0 rounded-lg p-2 transition hover:bg-white/5 ${listening ? "text-aura-mint" : voiceAvailable ? "text-white/80" : "text-white/35"}`}
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
              desktop ? "h-11 w-11 rounded-lg" : "h-10 w-10 rounded-full"
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
