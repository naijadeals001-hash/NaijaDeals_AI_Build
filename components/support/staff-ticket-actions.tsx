"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Assignee = { id: string; name: string };

export function StaffTicketActions({
  ticketId,
  status,
  priority,
  assignedToId,
  isGuest,
  assignees
}: {
  ticketId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  isGuest: boolean;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessLink, setAccessLink] = useState<string | null>(null);

  async function call(path: string, init: RequestInit, label: string) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
      const data = (await response.json().catch(() => ({}))) as { message?: string; token?: string };
      if (!response.ok) {
        setError(data.message ?? "The action failed.");
        return null;
      }
      router.refresh();
      return data;
    } catch {
      setError("The connection failed. Nothing was changed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2]">
      <h2 className="text-[12.5px] font-extrabold">Ticket actions</h2>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] font-bold text-[#24382b]">
          Status
          <select
            defaultValue={status}
            disabled={Boolean(busy)}
            onChange={(event) => call(`/api/admin/support/tickets/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }, "status")}
            className="mt-1 w-full rounded-lg border border-[#d8e2d4] px-2 py-1.5 text-[12px]"
          >
            {["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-bold text-[#24382b]">
          Priority
          <select
            defaultValue={priority}
            disabled={Boolean(busy)}
            onChange={(event) => call(`/api/admin/support/tickets/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ priority: event.target.value }) }, "priority")}
            className="mt-1 w-full rounded-lg border border-[#d8e2d4] px-2 py-1.5 text-[12px]"
          >
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-bold text-[#24382b]">
          Assignee
          <select
            defaultValue={assignedToId ?? ""}
            disabled={Boolean(busy)}
            onChange={(event) => call(`/api/admin/support/tickets/${ticketId}/assign`, { method: "POST", body: JSON.stringify({ assigneeId: event.target.value || null }) }, "assign")}
            className="mt-1 w-full rounded-lg border border-[#d8e2d4] px-2 py-1.5 text-[12px]"
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
        </label>
      </div>

      {isGuest ? (
        <div className="rounded-lg bg-[#eef5ea] p-2.5">
          <p className="text-[11px] font-bold text-[#24382b]">Guest access</p>
          {accessLink ? (
            <p className="mt-1 break-all rounded bg-white px-2 py-1 font-mono text-[10.5px] text-[#14241b] ring-1 ring-[#dbe7d7]">{accessLink}</p>
          ) : (
            <p className="mt-0.5 text-[10.5px] leading-4 text-[#4b5b51]">A new single-use link expires in 7 days. Only share it with the address the guest used. Email delivery is not configured, so nothing is sent automatically.</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                const data = await call(`/api/admin/support/tickets/${ticketId}/access`, { method: "POST", body: JSON.stringify({ action: "issue" }) }, "access");
                if (data?.token) setAccessLink(`${window.location.origin}/support/access?token=${encodeURIComponent(data.token)}`);
              }}
              className="rounded-full bg-[#0b5c33] px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-60"
            >
              Issue access link
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => { setAccessLink(null); call(`/api/admin/support/tickets/${ticketId}/access`, { method: "POST", body: JSON.stringify({ action: "revoke" }) }, "revoke"); }}
              className="rounded-full px-3 py-1 text-[11px] font-extrabold text-[#8f1d1d] ring-1 ring-[#e5b4b4] disabled:opacity-60"
            >
              Revoke all links
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-[11px] font-semibold text-[#b42318]">{error}</p> : null}
    </section>
  );
}

export function StaffReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || body.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body, internal })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "The message was not saved. Your text is still here.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("The connection failed. Your text is still here.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="rounded-2xl bg-white p-4 ring-1 ring-[#e4ebe2]">
      <label htmlFor="staff-message" className="text-[11.5px] font-bold text-[#24382b]">
        {internal ? "Internal note (never shown to the customer)" : "Public reply (shown to the customer)"}
      </label>
      <textarea
        id="staff-message"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        maxLength={8000}
        className="mt-1 w-full rounded-lg border border-[#d8e2d4] px-3 py-2 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
      />
      <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-[#3f4d45]">
        <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
        Internal note
      </label>
      {error ? <p role="alert" className="mt-1 text-[11px] font-semibold text-[#b42318]">{error}</p> : null}
      <button
        type="submit"
        disabled={sending || body.trim().length === 0}
        className={`mt-2 inline-flex min-h-9 items-center rounded-full px-4 text-[11.5px] font-extrabold text-white disabled:opacity-60 ${internal ? "bg-[#7a4a10]" : "bg-[#0b5c33]"}`}
      >
        {sending ? "Saving…" : internal ? "Save note" : "Send reply"}
      </button>
    </form>
  );
}
