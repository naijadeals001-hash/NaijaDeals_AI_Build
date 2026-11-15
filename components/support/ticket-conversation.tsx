"use client";

import { useState } from "react";

type Message = { id: string; author: "CUSTOMER" | "STAFF" | "SYSTEM"; body: string; createdAt: string };

/**
 * Customer conversation. Bodies are rendered as text (never HTML) and replies
 * are appended only after the server confirms them.
 */
export function TicketConversation({
  reference,
  initialMessages,
  canReply
}: {
  reference: string;
  initialMessages: Message[];
  canReply: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || reply.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(reference)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply })
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; createdAt?: string; message?: string };
      if (!response.ok || !data.id || !data.createdAt) {
        setError(data.message ?? "Your reply was not sent. Your text is still here.");
        return;
      }
      setMessages((current) => [...current, { id: data.id!, author: "CUSTOMER", body: reply.trim(), createdAt: data.createdAt! }]);
      setReply("");
    } catch {
      setError("The connection failed. Your reply is still here.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {messages.map((message) => {
          const mine = message.author === "CUSTOMER";
          return (
            <li key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <article
                className={
                  mine
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#0b5c33] p-3 text-white"
                    : message.author === "SYSTEM"
                      ? "max-w-[85%] rounded-2xl bg-[#eef1ee] p-3 text-[#3f4d45]"
                      : "max-w-[85%] rounded-2xl rounded-bl-md bg-white p-3 ring-1 ring-[#e4ebe2]"
                }
              >
                <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${mine ? "text-white/70" : "text-[#6b7a70]"}`}>
                  {mine ? "You" : message.author === "STAFF" ? "NaijaDeals support" : "System"}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-6">{message.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-[#8a938d]"}`}>
                  {new Date(message.createdAt).toLocaleString()}
                </p>
              </article>
            </li>
          );
        })}
      </ol>

      {canReply ? (
        <form onSubmit={send} className="rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2]">
          <label htmlFor="ticket-reply" className="text-[11.5px] font-bold text-[#24382b]">Reply</label>
          <textarea
            id="ticket-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            maxLength={8000}
            className="mt-1 w-full rounded-lg border border-[#d8e2d4] px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
          />
          {error ? <p role="alert" className="mt-1 text-[11.5px] font-semibold text-[#b42318]">{error}</p> : null}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={sending || reply.trim().length === 0}
              className="inline-flex min-h-9 items-center rounded-full bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
            <span className="text-[10.5px] text-[#6b7a70]">Plain text only. Never send passwords or card details.</span>
          </div>
        </form>
      ) : (
        <p className="rounded-xl bg-[#eef1ee] p-3 text-[11.5px] text-[#3f4d45]">
          This ticket is closed. Send a new enquiry from <a href="/contact" className="font-bold text-[#0b5c33] underline">Contact support</a> if you need more help.
        </p>
      )}
    </div>
  );
}
