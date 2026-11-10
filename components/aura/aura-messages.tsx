"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Copy, Check, RefreshCw } from "lucide-react";
import { renderInline, type ChatMessage, type PendingAction } from "@/lib/aura/client";
import { AuraActionCard, AuraCardRow, AuraOrb } from "./aura-visuals";

/**
 * The conversation transcript.
 *
 * Assistant text is announced politely to screen readers as it streams, the
 * streamed region is marked live only once per finished message so a long answer
 * is not read out token by token.
 */
export function AuraMessages({
  messages,
  status,
  onRetry,
  onSave,
  onConfirmAction,
  actionState
}: {
  messages: ChatMessage[];
  status: string | null;
  onRetry: (index: number) => void;
  onSave: (messageId: string, saved: boolean) => void;
  onConfirmAction: (action: PendingAction) => void;
  actionState: { id: string; state: "idle" | "confirming" | "done" | "failed" } | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  return (
    <div className="space-y-5">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-aura-surface px-4 py-2.5 text-[15px] leading-relaxed text-aura-text">
              {message.content}
            </p>
          </div>
        ) : (
          <div key={message.id} className="flex gap-3">
            <AuraOrb size={30} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-aura-muted">Aura</p>
              {message.streaming && status && (
                <p className="mt-1 flex items-center gap-2 text-xs text-aura-mint" aria-live="polite">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-aura-mint" aria-hidden="true" />
                  {status}
                </p>
              )}
              <div
                className="mt-1 space-y-2 text-[15px] leading-relaxed text-aura-text/90"
                aria-live={message.streaming ? "off" : "polite"}
              >
                {message.content.split("\n").filter(Boolean).map((line, lineIndex) => {
                  if (/^\s*[-*]\s+/.test(line)) {
                    return (
                      <p key={lineIndex} className="flex gap-2 pl-1">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-aura-mint" aria-hidden="true" />
                        <span>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</span>
                      </p>
                    );
                  }
                  if (/^\s*\d+\.\s+/.test(line)) {
                    return (
                      <p key={lineIndex} className="pl-1">
                        {renderInline(line)}
                      </p>
                    );
                  }
                  return <p key={lineIndex}>{renderInline(line)}</p>;
                })}
                {message.streaming && !message.content && !status && (
                  <span className="inline-flex gap-1 py-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aura-muted [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aura-muted [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-aura-muted [animation-delay:240ms]" />
                  </span>
                )}
              </div>

              {message.cards && message.cards.length > 0 && <AuraCardRow cards={message.cards} />}

              {message.action && (
                <AuraActionCard
                  action={message.action}
                  onConfirm={onConfirmAction}
                  state={actionState?.id === message.action.id ? actionState.state : "idle"}
                />
              )}

              {message.planId && (
                <a
                  href={`/aura-ai/plans/${message.planId}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-aura-gold/40 px-4 py-2 text-xs font-bold text-aura-gold transition hover:bg-aura-gold/10"
                >
                  Open your draft plan
                </a>
              )}

              {!message.streaming && message.id && !message.id.startsWith("pending") && (
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(message.content).catch(() => {});
                      setCopied(message.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                    aria-label="Copy this answer"
                    className="rounded-md p-1.5 text-aura-muted transition hover:bg-aura-surface hover:text-aura-text"
                  >
                    {copied === message.id ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(message.id, !message.saved)}
                    aria-label={message.saved ? "Remove from saved" : "Save this answer"}
                    className="rounded-md p-1.5 text-aura-muted transition hover:bg-aura-surface hover:text-aura-text"
                  >
                    {message.saved ? <BookmarkCheck className="h-3.5 w-3.5 text-aura-mint" aria-hidden="true" /> : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  {message.failed && (
                    <button
                      type="button"
                      onClick={() => onRetry(index)}
                      className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-aura-mint transition hover:bg-aura-surface"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}
