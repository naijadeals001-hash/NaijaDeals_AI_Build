"use client";

import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { SellerCategoryRequest } from "@/lib/taxonomy-api";

type NodeOption = { id: string; name: string; path: string };

const STATUS_STYLE: Record<SellerCategoryRequest["status"], string> = {
  PENDING: "border-[#F2D48C]/40 bg-[#F2D48C]/10 text-[#F2D48C]",
  APPROVED: "border-[#00E676]/40 bg-[#00E676]/10 text-[#B7FFD4]",
  REJECTED: "border-[#F85149]/50 bg-[#F85149]/10 text-[#FFB4AE]"
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Seller category-request queue. Every resolution is sent to the audited
 * resolve endpoint; a successful response is the only thing that produces the
 * success message (the workspace reloads the tree afterwards).
 */
export function TaxonomyRequestsPanel({
  requests,
  filter,
  onFilterChange,
  nodes,
  canWrite,
  scopeCountryCode = null,
  busy,
  loading,
  error,
  onRetry,
  onResolve
}: {
  requests: SellerCategoryRequest[];
  filter: "PENDING" | "ALL";
  onFilterChange: (filter: "PENDING" | "ALL") => void;
  nodes: NodeOption[];
  canWrite: boolean;
  /** Server already limits this list to the administrator's country/city scope. */
  scopeCountryCode?: string | null;
  busy: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onResolve: (
    id: string,
    input: {
      action: "APPROVED" | "REJECTED";
      categoryId?: string | null;
      note?: string | null;
      createCategory?: { name: string; parentId?: string | null } | null;
    }
  ) => Promise<boolean>;
}) {
  const pending = requests.filter((request) => request.status === "PENDING");

  return (
    <section aria-labelledby="taxonomy-requests-heading" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="taxonomy-requests-heading" className="text-lg font-extrabold">
            Seller category requests
          </h2>
          <p className="mt-1 text-xs text-[#8B949E]">
            {pending.length} pending. Approving maps the request to an existing node or creates a new one — it never
            publishes a seller product.
          </p>
          {scopeCountryCode ? (
            <p className="mt-1 text-[10.5px] leading-4 text-[#9ECBFF]">
              Showing requests from sellers in {scopeCountryCode.toUpperCase()} only. The server applies the same region
              scope; resolving a request outside it returns 403.
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-lg border border-[#30363D] p-0.5" role="group" aria-label="Request filter">
          {(["PENDING", "ALL"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
              className={`min-h-8 rounded-md px-2.5 text-[11px] font-bold ${
                filter === value ? "bg-[#161B22] text-[#F0F6FC]" : "text-[#8B949E]"
              }`}
            >
              {value === "PENDING" ? "Pending" : "All"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-3 rounded-xl border border-[#F85149]/50 bg-[#F85149]/10 p-3 text-sm text-[#FFB4AE]">
          {error}
          <button type="button" onClick={onRetry} className="ml-2 min-h-9 rounded-lg border border-[#F85149]/50 px-2 text-xs font-bold">
            Try again
          </button>
        </div>
      ) : null}

      {loading && requests.length === 0 ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#8B949E]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading seller requests…
        </p>
      ) : null}

      {!loading && !error && requests.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[#30363D] p-3 text-sm text-[#8B949E]">
          No {filter === "PENDING" ? "pending " : ""}seller requests. The queue is empty.
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {requests.map((request) => (
          <li key={request.id}>
            <RequestCard request={request} nodes={nodes} canWrite={canWrite} busy={busy} onResolve={onResolve} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestCard({
  request,
  nodes,
  canWrite,
  busy,
  onResolve
}: {
  request: SellerCategoryRequest;
  nodes: NodeOption[];
  canWrite: boolean;
  busy: boolean;
  onResolve: (
    id: string,
    input: {
      action: "APPROVED" | "REJECTED";
      categoryId?: string | null;
      note?: string | null;
      createCategory?: { name: string; parentId?: string | null } | null;
    }
  ) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [categoryId, setCategoryId] = useState("");
  const [newName, setNewName] = useState(request.suggestedName);
  const [newParentId, setNewParentId] = useState(request.parentId ?? "");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  const isPending = request.status === "PENDING";

  async function approve() {
    setLocalError("");
    if (!note.trim()) {
      setLocalError("Add a short note so the seller knows how the request was resolved.");
      return;
    }
    if (mode === "existing") {
      if (!categoryId) {
        setLocalError("Choose the existing category this request should resolve to.");
        return;
      }
      await onResolve(request.id, { action: "APPROVED", categoryId, note: note.trim() });
      return;
    }
    if (newName.trim().length < 3) {
      setLocalError("The new category name must be at least 3 characters.");
      return;
    }
    await onResolve(request.id, {
      action: "APPROVED",
      note: note.trim(),
      createCategory: { name: newName.trim(), parentId: newParentId || null }
    });
  }

  async function reject() {
    setLocalError("");
    if (note.trim().length < 3) {
      setLocalError("Explain why the request was rejected; the seller sees this note.");
      return;
    }
    await onResolve(request.id, { action: "REJECTED", note: note.trim() });
  }

  const StatusIcon = request.status === "PENDING" ? Clock : request.status === "APPROVED" ? CheckCircle2 : XCircle;

  return (
    <article className="rounded-xl border border-[#21262D] bg-[#0D1117] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#F0F6FC]">{request.suggestedName || "Category request"}</p>
          <p className="mt-0.5 text-[11px] text-[#8B949E]">
            {request.seller?.name ? `${request.seller.name} · ` : ""}
            {formatDate(request.createdAt) || "Date unavailable"}
            {request.parentPath ? ` · proposed parent: ${request.parentPath}` : " · no proposed parent"}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLE[request.status]}`}>
          <StatusIcon className="h-3 w-3" aria-hidden />
          {request.status}
        </span>
      </div>

      {request.description ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#C9D1D9]">{request.description}</p>
      ) : null}

      {request.imageUrl ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[#8B949E]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={request.imageUrl} alt="" className="h-12 w-16 rounded object-cover" />
          <span className="break-all">{request.imageUrl}</span>
        </div>
      ) : null}

      {!isPending ? (
        <div className="mt-2 rounded-lg border border-[#21262D] bg-[#0B0E14] p-2 text-[11px] leading-4 text-[#C9D1D9]">
          <p>
            <span className="font-bold">Response: </span>
            {request.adminNote?.trim() || "Resolved without a note."}
          </p>
          {request.resolvedCategoryPath ? (
            <p className="mt-0.5">
              <span className="font-bold">Resolved to: </span>
              {request.resolvedCategoryPath}
            </p>
          ) : null}
        </div>
      ) : null}

      {isPending && canWrite ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Resolution type for ${request.suggestedName}`}>
            <button
              type="button"
              aria-pressed={mode === "existing"}
              onClick={() => setMode("existing")}
              className={`min-h-8 rounded-lg border px-2.5 text-[11px] font-bold ${
                mode === "existing" ? "border-[#00E676]/50 text-[#00E676]" : "border-[#30363D] text-[#8B949E]"
              }`}
            >
              Map to existing category
            </button>
            <button
              type="button"
              aria-pressed={mode === "create"}
              onClick={() => setMode("create")}
              className={`min-h-8 rounded-lg border px-2.5 text-[11px] font-bold ${
                mode === "create" ? "border-[#00E676]/50 text-[#00E676]" : "border-[#30363D] text-[#8B949E]"
              }`}
            >
              Create a new category
            </button>
          </div>

          {mode === "existing" ? (
            <label className="block text-[10px] font-bold text-[#8B949E]">
              Existing category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1 min-h-9 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-2 text-xs text-[#F0F6FC]"
              >
                <option value="">Choose category…</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.path}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              <label className="text-[10px] font-bold text-[#8B949E]">
                New category name
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value.slice(0, 80))}
                  className="mt-1 min-h-9 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-2 text-xs text-[#F0F6FC]"
                />
              </label>
              <label className="text-[10px] font-bold text-[#8B949E]">
                Parent
                <select
                  value={newParentId}
                  onChange={(event) => setNewParentId(event.target.value)}
                  className="mt-1 min-h-9 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-2 text-xs text-[#F0F6FC]"
                >
                  <option value="">Top-level department</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block text-[10px] font-bold text-[#8B949E]">
            Note to the seller (required)
            <textarea
              value={note}
              rows={2}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-2 py-1.5 text-xs text-[#F0F6FC]"
            />
          </label>

          {localError ? (
            <p role="alert" className="flex items-start gap-1 text-[11px] font-bold text-[#FFB4AE]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {localError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void approve()}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#00E676] px-3 text-xs font-extrabold text-[#04140B] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {mode === "existing" ? "Approve and map" : "Approve and create"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reject()}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#F85149]/50 px-3 text-xs font-bold text-[#FFB4AE] disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden /> Reject
            </button>
            {busy ? <Loader2 className="mt-1.5 h-4 w-4 animate-spin text-[#8B949E]" aria-hidden /> : null}
          </div>
        </div>
      ) : null}

      {isPending && !canWrite ? (
        <p className="mt-2 text-[11px] text-[#F2D48C]">
          Read-only: `products:moderate` is required to resolve requests. The queue and the seller&apos;s evidence stay
          visible; the server refuses the resolution without the permission.
        </p>
      ) : null}
    </article>
  );
}
