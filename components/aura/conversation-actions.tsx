"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Pencil, Trash2 } from "lucide-react";

/** Rename, archive and delete, all server-authorised by ownership. */
export function ConversationActions({ id, archived, title }: { id: string; archived: boolean; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [error, setError] = useState("");

  async function call(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(method);
    setError("");
    const res = await fetch(method === "DELETE" ? `/api/aura/conversations?id=${encodeURIComponent(id)}` : "/api/aura/conversations", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: method === "DELETE" ? undefined : JSON.stringify({ id, ...body })
    }).catch(() => null);
    setBusy("");
    if (!res?.ok) {
      setError("That did not work.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={`/aura-ai?c=${id}`}
        className="rounded-md px-2 py-1 text-[11px] font-bold text-aura-mint hover:bg-aura-highlight/40"
      >
        Open
      </a>
      {renaming ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("PATCH", { title: name })) setRenaming(false);
          }}
          className="flex items-center gap-1"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New title"
            className="w-36 rounded-md border border-aura-border bg-aura-canvas px-2 py-1 text-xs text-aura-text"
          />
          <button type="submit" className="rounded-md bg-aura-mint px-2 py-1 text-[11px] font-bold text-aura-canvas">
            Save
          </button>
          <button type="button" onClick={() => setRenaming(false)} className="px-1 text-[11px] text-aura-muted">
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => setRenaming(true)} aria-label={`Rename ${title}`} className="rounded-md p-1.5 text-aura-muted hover:bg-aura-surface hover:text-aura-text">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void call("PATCH", { archived: !archived })}
            aria-label={archived ? `Unarchive ${title}` : `Archive ${title}`}
            className="rounded-md p-1.5 text-aura-muted hover:bg-aura-surface hover:text-aura-text"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${title}"? This removes the conversation permanently.`)) void call("DELETE");
            }}
            aria-label={`Delete ${title}`}
            className="rounded-md p-1.5 text-aura-muted hover:bg-aura-danger/10 hover:text-aura-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </>
      )}
      {busy && <span className="text-[11px] text-aura-muted">…</span>}
      {error && <span className="text-[11px] text-aura-danger">{error}</span>}
    </div>
  );
}
