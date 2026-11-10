"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aura client state and the SSE stream reader.
 *
 * The stream is read with fetch + ReadableStream rather than EventSource so the
 * request can carry the session cookie and be aborted by the Stop button.
 * Nothing here decides whether an action happened: it displays what the server
 * said, including failures.
 */

export type AuraCard = {
  kind: "stay" | "meal" | "product" | "professional" | "ride" | "listening" | "wallet" | "transaction" | "status" | "plan";
  title: string;
  subtitle?: string;
  detail?: string;
  image?: string | null;
  priceNaira?: number | null;
  href?: string;
  meta?: Record<string, string | number | null>;
};

export type PendingAction = {
  id: string;
  tool: string;
  summary: string;
  review: Record<string, unknown>;
  /** Fingerprint of exactly what is shown; echoed back on confirm. */
  inputHash: string;
  expiresAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: AuraCard[];
  action?: PendingAction;
  planId?: string;
  saved?: boolean;
  toolNames?: string[];
  streaming?: boolean;
  failed?: boolean;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

const naira = (n: number | null | undefined) =>
  typeof n === "number" ? "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : null;

export { naira };

export function useAura() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/aura/conversations", { credentials: "include" }).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    setConversations(body.conversations ?? []);
  }, []);

  useEffect(() => {
    void loadConversations();
    fetch("/api/aura/capabilities", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setProviderReady(Boolean(b?.provider?.configured)))
      .catch(() => setProviderReady(false));
  }, [loadConversations]);

  const openConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/aura/conversations/${id}`, { credentials: "include" }).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    const rows = (body.conversation?.messages ?? []) as Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      attachments: { cards?: AuraCard[]; action?: PendingAction; planId?: string; tools?: string[] } | null;
      saved: boolean;
    }>;
    setConversationId(id);
    setMessages(
      rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        cards: m.attachments?.cards,
        action: m.attachments?.action,
        planId: m.attachments?.planId,
        toolNames: m.attachments?.tools,
        saved: m.saved
      }))
    );
  }, []);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setStatus(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      setError(null);
      setStatus(null);

      const pendingId = `pending-${Date.now()}`;
      setMessages((prev) => [...prev, { id: pendingId, role: "user", content: message }, { id: `${pendingId}-a`, role: "assistant", content: "", streaming: true }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/aura/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message, conversationId: conversationId ?? undefined }),
          signal: controller.signal
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Aura could not answer (HTTP ${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (event.type === "conversation") {
              setConversationId(String(event.conversationId));
            } else if (event.type === "status") {
              setStatus(String(event.text));
            } else if (event.type === "delta") {
              assistantText += String(event.text ?? "");
              setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, content: assistantText } : m)));
            } else if (event.type === "cards") {
              const cards = event.cards as AuraCard[];
              setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, cards: [...(m.cards ?? []), ...cards] } : m)));
            } else if (event.type === "action") {
              const action = event.action as PendingAction;
              setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, action } : m)));
            } else if (event.type === "plan") {
              const planId = String(event.planId);
              setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, planId } : m)));
            } else if (event.type === "error") {
              setError(String(event.message ?? "Aura could not finish that."));
            } else if (event.type === "done") {
              setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, streaming: false, id: String(event.messageId || m.id) } : m)));
            }
          }
        }
        setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, streaming: false } : m)));
      } catch (caught) {
        if ((caught as Error).name === "AbortError") {
          // The user pressed Stop: keep what streamed, mark it stopped.
          setMessages((prev) => prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, streaming: false } : m)));
        } else {
          setError(caught instanceof Error ? caught.message : "Aura could not answer.");
          setMessages((prev) =>
            prev.map((m) => (m.id === `${pendingId}-a` ? { ...m, streaming: false, failed: true, content: m.content || "I could not answer that." } : m))
          );
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStatus(null);
        void loadConversations();
      }
    },
    [conversationId, loadConversations, streaming]
  );

  const retry = useCallback(
    (index: number) => {
      // Re-send the last user message before the failed assistant turn.
      const previousUser = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
      if (previousUser) void send(previousUser.content);
    },
    [messages, send]
  );

  const toggleSaved = useCallback(async (messageId: string, saved: boolean) => {
    const res = await fetch("/api/aura/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ messageId, saved })
    }).catch(() => null);
    if (res?.ok) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, saved } : m)));
    }
  }, []);

  return {
    conversations,
    conversationId,
    messages,
    status,
    streaming,
    error,
    providerReady,
    setError,
    send,
    stop,
    retry,
    newConversation,
    openConversation,
    toggleSaved,
    loadConversations
  };
}

/** Minimal, safe markdown: bold, italic, inline code, lists and links. */
export function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) nodes.push(<strong key={key++} className="font-semibold text-aura-text">{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key++} className="rounded bg-aura-surface px-1 py-0.5 font-mono text-[0.9em] text-aura-mint">{token.slice(1, -1)}</code>);
    else if (token.startsWith("*")) nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    else {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      // Only same-site relative links are rendered as links; anything else stays text.
      if (m && m[2].startsWith("/")) {
        nodes.push(
          <a key={key++} href={m[2]} className="font-medium text-aura-mint underline decoration-aura-mint/40 underline-offset-2 hover:decoration-aura-mint">
            {m[1]}
          </a>
        );
      } else nodes.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
