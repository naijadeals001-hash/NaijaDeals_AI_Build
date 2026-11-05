"use client";

import { AdminKitchenApplications } from "./admin-kitchen-applications";
import { AdminFoodOrders } from "./admin-food-orders";
import { AdminStorefrontPanel } from "./admin-storefront-panel";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { apiClient, koboToNaira, statusLabel } from "@/lib/api-client";
import type { AdminTab } from "@/lib/admin/admin-navigation";
import { COUNTRIES } from "@/lib/config/commerce";

export type Row = Record<string, any>;

interface WorkspaceTabProps {
  tab: AdminTab;
  orders: Row[];
  deliveries: Row[];
  rides: Row[];
  payouts: Row[];
  products: Row[];
  applications: Row[];
  payments: Row[];
  disputes: Row[];
  freight: Row[];
  users: Row[];
  vendors: Row[];
  couriers: Row[];
  audit: Row[];
  isSuperAdmin: boolean;
  initialQuery: string;
  onRefresh: () => void;
}

const ORDER_STATUSES = [
  "created",
  "payment_pending",
  "escrow_held",
  "vendor_notified",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "courier_assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
  "refunded"
];

const DELIVERY_SEQUENCE = [
  "pending_assignment",
  "assigned",
  "pickup_started",
  "picked_up",
  "in_transit",
  "delivery_attempted",
  "delivered"
];

function value(entry: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Row)[key];
    return undefined;
  }, entry);
}

function text(input: unknown, fallback = "—"): string {
  if (input === null || input === undefined || input === "") return fallback;
  return String(input);
}

function money(input: unknown): string {
  if (input === null || input === undefined || input === "") return "—";
  return koboToNaira(input as string | number);
}

function date(input: unknown): string {
  if (!input) return "—";
  const parsed = new Date(String(input));
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function roleNames(user: Row): string {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const names = roles
    .map((entry: Row) => entry?.role?.name ?? entry?.name)
    .filter(Boolean)
    .map((name: unknown) => statusLabel(String(name)));
  return names.length > 0 ? names.join(", ") : statusLabel(text(user.actorType, "customer"));
}

function statusClasses(status: string): string {
  const normalized = status.toLowerCase();
  if (["completed", "delivered", "paid", "approved", "active", "verified"].includes(normalized)) {
    return "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]";
  }
  if (["cancelled", "refunded", "rejected", "suspended", "failed", "archived"].includes(normalized)) {
    return "border-crimson/40 bg-crimson/10 text-crimson";
  }
  if (["pending", "requested", "submitted", "payment_pending", "pending_assignment", "draft"].includes(normalized)) {
    return "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]";
  }
  return "border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#60A5FA]";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusClasses(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="px-4 py-10 text-center text-sm text-[#8B949E]">{label}</p>;
}

function Toolbar({
  query,
  onQuery,
  placeholder,
  filters,
  filterValue,
  onFilter,
  onRefresh
}: {
  query: string;
  onQuery: (next: string) => void;
  placeholder: string;
  filters?: string[];
  filterValue?: string;
  onFilter?: (next: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#21262D] p-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative flex-1 sm:max-w-sm">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-[#21262D] bg-[#0B0E14] pl-10 pr-4 text-sm text-[#F0F6FC] placeholder:text-[#8B949E] focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30"
        />
      </label>
      <div className="flex items-center gap-2">
        {filters && filters.length > 0 && onFilter && (
          <>
            <label htmlFor="admin-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="admin-status-filter"
              value={filterValue ?? "all"}
              onChange={(event) => onFilter(event.target.value)}
              className="h-10 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-medium text-[#F0F6FC] focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30"
            >
              <option value="all">All statuses</option>
              {filters.map((entry) => (
                <option key={entry} value={entry}>
                  {statusLabel(entry)}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-10 items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-bold text-[#F0F6FC] hover:bg-[#21262D]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft">
      <div className="p-4">
        <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">{title}</h2>
        <p className="mt-1 text-sm text-[#8B949E]">{description}</p>
      </div>
      {children}
    </section>
  );
}

const PAGE_SIZE = 10;

function DataTable({
  columns,
  rows,
  emptyLabel,
  onDetail,
  selected,
  onToggleRow,
  onToggleAll
}: {
  columns: Array<{ header: string; cell: (row: Row) => React.ReactNode; className?: string }>;
  rows: Row[];
  emptyLabel: string;
  onDetail?: (row: Row) => void;
  selected?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[], checked: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const firstRowId = rows[0]?.id ?? "";
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  // Reset to the first page whenever the filtered dataset changes.
  useEffect(() => {
    setPage(0);
  }, [rows.length, firstRowId, emptyLabel]);

  if (rows.length === 0) return <EmptyState label={emptyLabel} />;

  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-y border-[#21262D] bg-[#0B0E14] text-xs uppercase tracking-wide text-[#8B949E]">
            {onToggleRow ? (
              <th scope="col" className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible rows"
                  checked={rows.length > 0 && rows.every((row) => selected?.has(String(row.id)))}
                  onChange={(event) => onToggleAll?.(rows.map((row) => String(row.id)), event.target.checked)}
                  className="h-4 w-4 accent-[#00E676]"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.header} scope="col" className={`px-4 py-3 font-bold ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
            {onDetail ? <th scope="col" className="px-4 py-3 font-bold">Details</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#21262D]">
          {visible.map((row, index) => (
            <tr key={String(row.id ?? index)} className="hover:bg-[#21262D]/50">
              {onToggleRow ? (
                <td className="px-3 py-3 align-top">
                  <input
                    type="checkbox"
                    aria-label={`Select ${text(row.name ?? row.orderNumber ?? row.id)}`}
                    checked={selected?.has(String(row.id)) ?? false}
                    onChange={() => onToggleRow(String(row.id))}
                    className="h-4 w-4 accent-[#00E676]"
                  />
                </td>
              ) : null}
              {columns.map((column) => (
                <td key={column.header} className={`px-4 py-3 align-top text-[#F0F6FC] ${column.className ?? ""}`}>
                  {column.cell(row)}
                </td>
              ))}
              {onDetail ? (
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => onDetail(row)}
                    className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
                  >
                    View
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="flex flex-col gap-3 border-t border-[#21262D] px-4 py-3 text-xs text-[#8B949E] sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min(rows.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {rows.length}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={safePage === 0}
          className="h-8 rounded-lg border border-[#21262D] px-3 font-bold text-[#F0F6FC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span aria-live="polite">
          Page {safePage + 1} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          disabled={safePage >= pageCount - 1}
          className="h-8 rounded-lg border border-[#21262D] px-3 font-bold text-[#F0F6FC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
    </>
  );
}

function ActionFeedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return (
    <div className="px-4 pb-4">
      {message && (
        <p role="status" className="rounded-xl border border-[#00E676]/30 bg-[#00E676]/10 p-3 text-sm font-bold text-[#00E676]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-crimson/30 bg-crimson/10 p-3 text-sm font-bold text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}

interface AssignableRole {
  name: string;
  description?: string | null;
}

function DisputeResolveDialog({
  row,
  onClose,
  onResolved
}: {
  row: Row;
  onClose: () => void;
  onResolved: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const order = (row.order ?? {}) as Row;
  const escrow = (row.escrow ?? null) as Row | null;
  const paymentStatus = text(order.paymentStatus, "unknown");
  const escrowStatus = escrow ? text(escrow.status, "unknown") : "none";
  const canRefund = paymentStatus === "paid";
  const canRelease = Boolean(escrow) && ["held", "disputed"].includes(escrowStatus);
  const [decision, setDecision] = useState<"refund" | "release">(canRefund ? "refund" : "release");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/disputes/${encodeURIComponent(String(row.id))}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Request failed with HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onResolved(
        `${text(order.orderNumber, "Dispute")} ${decision === "refund" ? "refunded to the buyer" : "released to the seller"}.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resolve this dispute.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={trapFocus}
      aria-labelledby="admin-dispute-title"
      className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[#21262D] bg-[#161B22] p-0 text-[#F0F6FC] shadow-soft backdrop:bg-black/70"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#21262D] px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Resolve dispute</p>
          <h2 id="admin-dispute-title" className="font-display text-lg font-extrabold">{text(order.orderNumber, "Order")}</h2>
          <p className="text-xs text-[#8B949E]">{money(order.totalKobo)} · payment {statusLabel(paymentStatus)} · escrow {statusLabel(escrowStatus)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close dispute resolution" className="rounded-lg border border-[#21262D] px-2.5 py-1 text-sm font-bold hover:bg-[#21262D]">
          &#10005;
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Decision</legend>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${decision === "refund" ? "border-[#00E676]/50 bg-[#00E676]/10" : "border-[#21262D] bg-[#0B0E14]"} ${canRefund ? "" : "opacity-50"}`}>
            <input
              type="radio"
              name="dispute-decision"
              value="refund"
              checked={decision === "refund"}
              disabled={!canRefund}
              onChange={() => setDecision("refund")}
              className="mt-0.5 h-4 w-4 accent-[#00E676]"
            />
            <span>
              <span className="block text-sm font-bold">Refund the buyer</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#8B949E]">
                Reverses the completed payment, restores escrow to refunded and marks the order refunded. Available when the order is paid.
              </span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${decision === "release" ? "border-[#00E676]/50 bg-[#00E676]/10" : "border-[#21262D] bg-[#0B0E14]"} ${canRelease ? "" : "opacity-50"}`}>
            <input
              type="radio"
              name="dispute-decision"
              value="release"
              checked={decision === "release"}
              disabled={!canRelease}
              onChange={() => setDecision("release")}
              className="mt-0.5 h-4 w-4 accent-[#00E676]"
            />
            <span>
              <span className="block text-sm font-bold">Release escrow to the seller</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#8B949E]">
                Credits the seller&apos;s payable, retains commission and completes the order. Available while escrow is held or disputed.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">
          Note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Recorded in the audit trail"
            className="mt-1 block w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-2 py-2 text-sm font-semibold text-[#F0F6FC]"
          />
        </label>

        {error ? <p role="alert" className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-xs font-bold text-[#FFB4AB]">{error}</p> : null}
        {!canRefund && !canRelease ? (
          <p role="alert" className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-xs font-bold text-[#FFB4AB]">
            This order has neither a refundable payment nor releasable escrow, so no resolution is available from the Control Center.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[#21262D] pt-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#21262D] px-4 py-2 text-sm font-bold hover:bg-[#21262D]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || (decision === "refund" ? !canRefund : !canRelease)}
            className="rounded-lg bg-[#00E676] px-4 py-2 text-sm font-extrabold text-[#0B0E14] disabled:opacity-50"
          >
            {saving ? "Resolving…" : decision === "refund" ? "Refund buyer" : "Release to seller"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function RoleDialog({ user, onClose, onSaved }: { user: Row; onClose: () => void; onSaved: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [available, setAvailable] = useState<AssignableRole[]>([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/super-admin/users/${encodeURIComponent(String(user.id))}/roles`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error ?? `Request failed with HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        setAvailable(Array.isArray(body?.assignableRoles) ? (body.assignableRoles as AssignableRole[]) : []);
        setSelected(Array.isArray(body?.user?.roles) ? body.user.roles.map((entry: { role: { name: string } }) => entry.role.name) : []);
        setCountry(String(body?.user?.scopeCountryCode ?? ""));
        setCity(String(body?.user?.scopeCityCode ?? ""));
        setLoading(false);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load roles.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/super-admin/users/${encodeURIComponent(String(user.id))}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: selected, scopeCountryCode: country || null, scopeCityCode: city || null })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Request failed with HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onSaved(`${text(user.name)} access updated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save roles.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={trapFocus}
      aria-labelledby="admin-role-title"
      className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-[#21262D] bg-[#161B22] p-0 text-[#F0F6FC] shadow-soft backdrop:bg-black/70"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#21262D] px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Role and scope</p>
          <h2 id="admin-role-title" className="font-display text-lg font-extrabold">{text(user.name)}</h2>
          <p className="text-xs text-[#8B949E]">{text(user.email)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close role editor" className="rounded-lg border border-[#21262D] px-2.5 py-1 text-sm font-bold hover:bg-[#21262D]">
          &#10005;
        </button>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-sm text-[#8B949E]">Loading roles…</p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Roles</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {available.map((role) => {
                const checked = selected.includes(role.name);
                return (
                  <label key={role.name} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${checked ? "border-[#00E676]/50 bg-[#00E676]/10" : "border-[#21262D] bg-[#0B0E14]"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked ? [...new Set([...previous, role.name])] : previous.filter((name) => name !== role.name)
                        )
                      }
                      className="mt-0.5 h-4 w-4 accent-[#00E676]"
                    />
                    <span>
                      <span className="block text-sm font-bold">{role.name}</span>
                      {role.description ? <span className="mt-0.5 block text-[11px] leading-snug text-[#8B949E]">{role.description}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">
              Country scope
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-2 text-sm font-semibold text-[#F0F6FC]"
              >
                <option value="">All countries</option>
                {Object.values(COUNTRIES).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">
              City scope
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="e.g. lagos"
                className="mt-1 block min-h-10 w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-2 text-sm font-semibold text-[#F0F6FC]"
              />
            </label>
          </div>

          {error ? <p role="alert" className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-xs font-bold text-[#FFB4AB]">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-[#21262D] pt-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#21262D] px-4 py-2 text-sm font-bold hover:bg-[#21262D]">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[#00E676] px-4 py-2 text-sm font-extrabold text-[#0B0E14] disabled:opacity-50">
              {saving ? "Saving…" : "Save access"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function RecordDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element && !element.open) element.showModal();
    // No cleanup close(): unmounting removes the dialog, and calling close() in a
    // StrictMode double-invoke would fire onClose immediately and dismiss it.
  }, []);

  function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const title = text(row.orderNumber ?? value(row, "order.orderNumber") ?? row.rideNumber ?? row.name ?? row.businessName ?? row.reference ?? row.action ?? row.id);
  const fields: Array<[string, string]> = [];
  const add = (label: string, raw: unknown, format?: (input: unknown) => string) => {
    if (raw === undefined || raw === null || raw === "") return;
    fields.push([label, format ? format(raw) : text(raw)]);
  };
  add("Status", row.status);
  add("Payment", row.paymentStatus);
  add("Total", row.totalKobo, (input) => money(input));
  add("Price", row.priceKobo, (input) => money(input));
  add("Amount", row.amountKobo, (input) => money(input));
  add("Email", row.email);
  add("Phone", row.phone);
  add("Actor type", row.actorType);
  add("Roles", Array.isArray(row.roles) ? row.roles.map((entry: Row) => entry?.role?.name).filter(Boolean).join(", ") || undefined : undefined);
  add("Customer", value(row, "customer.name"));
  add("Vendor", value(row, "vendor.name"));
  add("Category", value(row, "category.name"));
  add("Market", row.market);
  add("Owner", value(row, "owner.name"));
  add("Owner email", value(row, "owner.email"));
  add("Reference", row.reference ?? row.providerReference);
  add("Provider", row.provider);
  add("Order", value(row, "order.orderNumber") ?? row.orderNumber ?? row.rideNumber);
  add("Pickup", row.pickupAddress ?? row.pickupLabel);
  add("Drop-off", row.dropoffAddress ?? row.dropoffLabel);
  add("Courier", value(row, "courier.name"));
  add("Business", row.businessName);
  add("Applicant", value(row, "user.name"));
  add("Trust score", row.trustScore);
  add("Action", row.action);
  add("Entity", row.entity);
  add("Actor", value(row, "actor.name"));
  add("Actor email", value(row, "actor.email"));
  add("Fare", row.fareKobo, (input) => money(input));
  add("Active", typeof row.active === "boolean" ? (row.active ? "Yes" : "No") : undefined);
  add("Notes", row.note ?? row.description);
  add("Reason", row.reason);
  add("Order status", value(row, "order.status"));
  add("Escrow status", value(row, "escrow.status"));
  add("Escrow amount", value(row, "escrow.amountKobo"), (input) => money(input));
  add("Buyer email", value(row, "customer.email"));
  add("Created", row.createdAt, (input) => date(input));
  add("Products", value(row, "_count.products"));
  add("Orders", value(row, "_count.orders"));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={trapFocus}
      aria-labelledby="admin-record-title"
      className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[#21262D] bg-[#161B22] p-0 text-[#F0F6FC] shadow-soft backdrop:bg-black/70"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#21262D] px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Record details</p>
          <h2 id="admin-record-title" className="font-display text-lg font-extrabold">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded-lg border border-[#21262D] px-2.5 py-1 text-sm font-bold hover:bg-[#21262D]"
        >
          &#10005;
        </button>
      </div>
      <dl className="grid gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
        {fields.map(([label, val]) => (
          <div key={label}>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">{label}</dt>
            <dd className="mt-0.5 font-semibold text-[#F0F6FC]">{val}</dd>
          </div>
        ))}
      </dl>
      {row.metadata && typeof row.metadata === "object" ? (
        <div className="border-t border-[#21262D] px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8B949E]">Audit metadata</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[#0B0E14] p-3 text-xs text-[#8B949E]">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </div>
      ) : null}
      <div className="border-t border-[#21262D] px-5 py-3 text-right">
        <button type="button" onClick={onClose} className="rounded-lg bg-[#00E676] px-4 py-2 text-sm font-extrabold text-[#0B0E14]">
          Close
        </button>
      </div>
    </dialog>
  );
}

export function WorkspaceTabContent(props: WorkspaceTabProps) {
  const { tab, isSuperAdmin, onRefresh, initialQuery } = props;
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [roleUser, setRoleUser] = useState<Row | null>(null);
  const [disputeRow, setDisputeRow] = useState<Row | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setStatusFilter("all");
    setMessage("");
    setError("");
    setSelected(new Set());
  }, [tab, initialQuery]);

  async function bulkModerateProducts(target: "ACTIVE" | "SUSPENDED") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const verb = target === "SUSPENDED" ? "Suspend" : "Activate";
    if (!window.confirm(`${verb} ${ids.length} selected product(s)?`)) return;
    setBulkBusy(true);
    setMessage("");
    setError("");
    let changed = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await apiClient.adminModerateProduct(id, target);
        changed += 1;
      } catch (caught) {
        failures.push(caught instanceof Error ? caught.message : "request failed");
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (changed > 0) setMessage(`${changed} product(s) set to ${statusLabel(target)}.`);
    if (failures.length > 0) setError(`${failures.length} product(s) could not be updated: ${failures.slice(0, 3).join("; ")}`);
    onRefresh();
  }

  const run = useCallback(
    async (id: string, action: () => Promise<unknown>, successMessage: string) => {
      setBusyId(id);
      setMessage("");
      setError("");
      try {
        await action();
        setMessage(successMessage);
        onRefresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The action could not be completed.");
      } finally {
        setBusyId("");
      }
    },
    [onRefresh]
  );

  const matches = useCallback(
    (row: Row, fields: string[]) => {
      if (!query.trim()) return true;
      const needle = query.trim().toLowerCase();
      return fields.some((field) => text(value(row, field), "").toLowerCase().includes(needle));
    },
    [query]
  );

  const filterRows = useCallback(
    (rows: Row[], field = "status") => {
      if (statusFilter === "all") return rows;
      return rows.filter((row) => String(value(row, field)) === statusFilter);
    },
    [statusFilter]
  );

  if (tab === "orders") {
    const rows = filterRows(props.orders).filter((row) =>
      matches(row, ["orderNumber", "customer.name", "customer.email", "vendor.name", "status", "paymentStatus"])
    );
    const statuses = Array.from(new Set(props.orders.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Orders" description="Real orders from the marketplace service. Status changes go through the audited admin service.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search order number, customer, vendor…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.orders.length === 0 ? "No orders exist yet." : "No orders match this filter."}
          onDetail={setDetail}
          columns={[
            {
              header: "Order",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(row.orderNumber)}</p>
                  <p className="text-xs text-[#8B949E]">{date(row.createdAt)}</p>
                </div>
              )
            },
            { header: "Customer", cell: (row) => <span>{text(value(row, "customer.name"))}</span> },
            { header: "Vendor", cell: (row) => <span>{text(value(row, "vendor.name"))}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Payment", cell: (row) => <StatusBadge status={text(row.paymentStatus)} /> },
            { header: "Total", cell: (row) => <span className="font-bold">{money(row.totalKobo)}</span>, className: "text-right" },
            {
              header: "Change status",
              cell: (row) => {
                const busy = busyId === String(row.id);
                return (
                  <select
                    aria-label={`Change status for order ${text(row.orderNumber)}`}
                    disabled={busy}
                    value=""
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!next) return;
                      const risky = next === "cancelled" || next === "refunded";
                      if (risky && !window.confirm(`Set ${text(row.orderNumber)} to ${statusLabel(next)}? This may issue a refund.`)) return;
                      void run(String(row.id), () => apiClient.adminOrderStatus(String(row.id), next), `Order ${text(row.orderNumber)} set to ${statusLabel(next)}.`);
                    }}
                    className="h-9 w-36 rounded-lg border border-[#21262D] bg-[#0B0E14] px-2 text-xs font-bold text-[#F0F6FC] disabled:opacity-50"
                  >
                    <option value="">{busy ? "Updating…" : "Select…"}</option>
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "deliveries") {
    const rows = filterRows(props.deliveries).filter((row) => matches(row, ["orderNumber", "status", "courier.name", "pickupAddress", "dropoffAddress"]));
    const statuses = Array.from(new Set(props.deliveries.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Deliveries" description="Delivery records attached to real orders. Courier names appear only when assigned.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search order, courier, address…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.deliveries.length === 0 ? "No delivery records exist yet." : "No deliveries match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Order", cell: (row) => <span className="font-bold">{text(row.orderNumber)}</span> },
            { header: "Courier", cell: (row) => <span>{text(value(row, "courier.name"), "Unassigned")}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Pickup", cell: (row) => <span className="text-xs text-[#8B949E]">{text(row.pickupAddress)}</span> },
            { header: "Drop-off", cell: (row) => <span className="text-xs text-[#8B949E]">{text(row.dropoffAddress)}</span> },
            {
              header: "Next step",
              cell: (row) => {
                const current = DELIVERY_SEQUENCE.indexOf(String(row.status));
                const next = current >= 0 ? DELIVERY_SEQUENCE[current + 1] : undefined;
                if (!next) return <span className="text-xs text-[#8B949E]">No further step</span>;
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        String(row.id),
                        () => apiClient.adminDeliveryStatus(String(row.id), next),
                        `Delivery ${text(row.orderNumber)} advanced to ${statusLabel(next)}.`
                      )
                    }
                    className="rounded-lg border border-[#21262D] bg-[#0B0E14] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
                  >
                    {busy ? "Working…" : `Mark ${statusLabel(next)}`}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      <AdminFoodOrders />
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "rides") {
    const rows = filterRows(props.rides).filter((row) =>
      matches(row, ["rideNumber", "rider.name", "driver.user.name", "status", "pickupLabel", "dropoffLabel"])
    );
    const statuses = Array.from(new Set(props.rides.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Trips" description="NaijaDrive ride records from the drive service.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search ride number, rider, driver…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.rides.length === 0 ? "No trips have been requested yet." : "No trips match this filter."}
          onDetail={setDetail}
          columns={[
            {
              header: "Trip",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(row.rideNumber)}</p>
                  <p className="text-xs text-[#8B949E]">{text(row.vehicleClass)}</p>
                </div>
              )
            },
            {
              header: "Route",
              cell: (row) => (
                <span className="text-xs text-[#8B949E]">
                  {text(row.pickupLabel)} → {text(row.dropoffLabel)}
                </span>
              )
            },
            { header: "Rider", cell: (row) => <span>{text(value(row, "rider.name"))}</span> },
            { header: "Driver", cell: (row) => <span>{text(value(row, "driver.user.name"), "Unassigned")}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Fare", cell: (row) => <span className="font-bold">{money(row.fareKobo)}</span>, className: "text-right" },
            {
              header: "Action",
              cell: (row) => {
                const status = String(row.status);
                if (["completed", "cancelled"].includes(status)) return <span className="text-xs text-[#8B949E]">Closed</span>;
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Cancel trip ${text(row.rideNumber)}?`)) return;
                      void run(String(row.id), () => apiClient.adminCancelRide(String(row.id), "Cancelled by administrator."), `Trip ${text(row.rideNumber)} cancelled.`);
                    }}
                    className="rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1.5 text-xs font-bold text-crimson hover:bg-crimson/20 disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Cancel"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "payouts") {
    const rows = filterRows(props.payouts).filter((row) => matches(row, ["reference", "vendor.name", "status"]));
    const statuses = Array.from(new Set(props.payouts.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Payouts" description="Vendor payouts created from real paid orders. Marking paid debits the vendor wallet.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search reference, vendor…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.payouts.length === 0 ? "No payouts have been created yet." : "No payouts match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Reference", cell: (row) => <span className="font-bold">{text(row.reference)}</span> },
            { header: "Vendor", cell: (row) => <span>{text(value(row, "vendor.name"))}</span> },
            { header: "Period", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.periodStart)} – {date(row.periodEnd)}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Amount", cell: (row) => <span className="font-bold">{money(row.amountKobo)}</span>, className: "text-right" },
            {
              header: "Action",
              cell: (row) => {
                if (String(row.status) === "PAID") return <span className="text-xs text-[#8B949E]">Settled</span>;
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Mark payout ${text(row.reference)} as paid?`)) return;
                      void run(String(row.id), () => apiClient.adminPayPayout(String(row.id)), `Payout ${text(row.reference)} marked paid.`);
                    }}
                    className="rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 py-1.5 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Mark paid"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "products") {
    const rows = filterRows(props.products).filter((row) => matches(row, ["name", "vendor.name", "status"]));
    const statuses = Array.from(new Set(props.products.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Products" description="Marketplace catalogue. Suspending a product removes it from sale and is written to the audit log.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search product or vendor…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        {selected.size > 0 ? (
          <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[#21262D] bg-[#0B0E14] px-4 py-2.5 text-xs font-bold text-[#F0F6FC]">
            <span className="mr-1">{selected.size} selected</span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkModerateProducts("SUSPENDED")}
              className="rounded-lg border border-crimson/50 bg-crimson/10 px-3 py-1.5 text-crimson hover:bg-crimson/20 disabled:opacity-50"
            >
              Suspend selected
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void bulkModerateProducts("ACTIVE")}
              className="rounded-lg border border-[#00E676]/50 bg-[#00E676]/10 px-3 py-1.5 text-[#00E676] hover:bg-[#00E676]/20 disabled:opacity-50"
            >
              Activate selected
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-[#21262D] px-3 py-1.5 text-[#8B949E] hover:bg-[#21262D]"
            >
              Clear
            </button>
          </div>
        ) : null}
        <DataTable
          rows={rows}
          emptyLabel={props.products.length === 0 ? "No products exist yet." : "No products match this filter."}
          onDetail={setDetail}
          selected={selected}
          onToggleRow={(id) =>
            setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onToggleAll={(ids, checked) =>
            setSelected((previous) => {
              const next = new Set(previous);
              for (const id of ids) {
                if (checked) next.add(id);
                else next.delete(id);
              }
              return next;
            })
          }
          columns={[
            {
              header: "Product",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(row.name)}</p>
                  <p className="text-xs text-[#8B949E]">{text(value(row, "vendor.name"))}</p>
                </div>
              )
            },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Price", cell: (row) => <span className="font-bold">{money(row.priceKobo)}</span>, className: "text-right" },
            {
              header: "Stock",
              cell: (row) => {
                const stock = row.stock as Row | null | undefined;
                return <span>{stock && stock.quantity !== undefined ? String(stock.quantity) : "—"}</span>;
              },
              className: "text-right"
            },
            {
              header: "Action",
              cell: (row) => {
                const status = String(row.status);
                const target = status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        String(row.id),
                        () => apiClient.adminModerateProduct(String(row.id), target),
                        `${text(row.name)} set to ${statusLabel(target)}.`
                      )
                    }
                    className="rounded-lg border border-[#21262D] bg-[#0B0E14] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
                  >
                    {busy ? "Working…" : target === "ACTIVE" ? "Activate" : "Suspend"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      <AdminStorefrontPanel />
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "applications") {
    const rows = filterRows(props.applications).filter((row) => matches(row, ["businessName", "user.name", "user.email", "market", "status"]));
    const statuses = Array.from(new Set(props.applications.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Seller applications" description="Applications submitted through the customer account flow. Approval creates a verified vendor.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search business, applicant, market…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.applications.length === 0 ? "No seller applications have been submitted." : "No applications match this filter."}
          onDetail={setDetail}
          columns={[
            {
              header: "Business",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(row.businessName)}</p>
                  <p className="text-xs text-[#8B949E]">{text(row.market)} · {text(row.pickupAddress)}</p>
                </div>
              )
            },
            { header: "Applicant", cell: (row) => <span>{text(value(row, "user.name"))}<br /><span className="text-xs text-[#8B949E]">{text(value(row, "user.email"))}</span></span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            {
              header: "Action",
              cell: (row) => {
                if (String(row.status) !== "SUBMITTED") return <span className="text-xs text-[#8B949E]">Reviewed</span>;
                const busy = busyId === String(row.id);
                return (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(String(row.id), () => apiClient.adminReviewApplication(String(row.id), "approve"), `${text(row.businessName)} approved.`)}
                      className="rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 py-1.5 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Reject ${text(row.businessName)}?`)) return;
                        void run(String(row.id), () => apiClient.adminReviewApplication(String(row.id), "reject"), `${text(row.businessName)} rejected.`);
                      }}
                      className="rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1.5 text-xs font-bold text-crimson hover:bg-crimson/20 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                );
              }
            }
          ]}
        />
      </Panel>
      <AdminKitchenApplications />
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "payments") {
    const rows = filterRows(props.payments).filter((row) => matches(row, ["reference", "provider", "providerReference", "status", "order.orderNumber"]));
    const statuses = Array.from(new Set(props.payments.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Payments" description="Payment records with provider references. Provider credentials are configured outside Git.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search reference, provider, order…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <DataTable
          rows={rows}
          emptyLabel={props.payments.length === 0 ? "No payments have been recorded." : "No payments match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Reference", cell: (row) => <span className="font-bold">{text(row.reference ?? row.providerReference)}</span> },
            { header: "Order", cell: (row) => <span>{text(value(row, "order.orderNumber"))}</span> },
            { header: "Provider", cell: (row) => <span className="uppercase">{text(row.provider)}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Amount", cell: (row) => <span className="font-bold">{money(row.amountKobo)}</span>, className: "text-right" },
            { header: "Recorded", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt ?? row.verifiedAt)}</span> }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "users") {
    const rows = props.users.filter((row) => matches(row, ["name", "email", "actorType", "phone"]) && (statusFilter === "all" || String(row.actorType) === statusFilter));
    const actorTypes = Array.from(new Set(props.users.map((row) => String(row.actorType)))).sort();
    return (
      <>
      <Panel title="Users" description="Every account in the platform, including roles and linked vendors. Passwords are never exposed.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search name, email or phone…"
          filters={actorTypes}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.users.length === 0 ? "No users exist yet." : "No users match this filter."}
          onDetail={setDetail}
          columns={[
            {
              header: "User",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(row.name)}</p>
                  <p className="text-xs text-[#8B949E]">{text(row.email)}</p>
                </div>
              )
            },
            { header: "Actor type", cell: (row) => <StatusBadge status={text(row.actorType)} /> },
            { header: "Roles", cell: (row) => <span className="text-xs">{roleNames(row)}</span> },
            {
              header: "Vendors",
              cell: (row) => {
                const vendors = Array.isArray(row.vendors) ? row.vendors : [];
                if (vendors.length === 0) return <span className="text-xs text-[#8B949E]">—</span>;
                return (
                  <span className="text-xs">
                    {vendors.map((vendor: Row) => `${text(vendor.name)} (${statusLabel(text(vendor.status))})`).join(", ")}
                  </span>
                );
              }
            },
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> },
            ...(isSuperAdmin
              ? [
                  {
                    header: "Access",
                    cell: (row: Row) => (
                      <button
                        type="button"
                        onClick={() => setRoleUser(row)}
                        className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
                      >
                        Manage
                      </button>
                    )
                  }
                ]
              : [])
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      {roleUser ? (
        <RoleDialog
          user={roleUser}
          onClose={() => setRoleUser(null)}
          onSaved={(message) => {
            setRoleUser(null);
            setMessage(message);
            setError("");
            onRefresh();
          }}
        />
      ) : null}
      </>
    );
  }

  if (tab === "vendors") {
    const rows = filterRows(props.vendors).filter((row) => matches(row, ["name", "slug", "market", "status", "owner.name", "owner.email"]));
    const statuses = Array.from(new Set(props.vendors.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Vendors" description="Seller accounts created by approved applications.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search vendor, owner, market…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <DataTable
          rows={rows}
          emptyLabel={props.vendors.length === 0 ? "No vendors exist yet." : "No vendors match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Vendor", cell: (row) => <span className="font-bold">{text(row.name)}</span> },
            { header: "Owner", cell: (row) => <span>{text(value(row, "owner.name"))}<br /><span className="text-xs text-[#8B949E]">{text(value(row, "owner.email"))}</span></span> },
            { header: "Market", cell: (row) => <span>{text(row.market)}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Products", cell: (row) => <span>{text(value(row, "_count.products"), "0")}</span>, className: "text-right" },
            { header: "Orders", cell: (row) => <span>{text(value(row, "_count.orders"), "0")}</span>, className: "text-right" },
            {
              header: "Access",
              cell: (row) => {
                const status = String(row.status);
                if (status === "PENDING") return <span className="text-xs text-[#8B949E]">Pending</span>;
                const suspended = status === "SUSPENDED";
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (suspended) {
                        if (!window.confirm(`Reactivate ${text(row.name)}? Its products return to the catalogue.`)) return;
                        void run(String(row.id), () => apiClient.adminSetVendorStatus(String(row.id), "VERIFIED"), `${text(row.name)} reactivated.`);
                        return;
                      }
                      const reason = window.prompt(`Reason for suspending ${text(row.name)}?`);
                      if (!reason || !reason.trim()) return;
                      void run(
                        String(row.id),
                        () => apiClient.adminSetVendorStatus(String(row.id), "SUSPENDED", reason.trim()),
                        `${text(row.name)} suspended.`
                      );
                    }}
                    className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
                  >
                    {busy ? "Working…" : suspended ? "Reactivate" : "Suspend"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "couriers") {
    const rows = props.couriers.filter((row) => matches(row, ["name", "phone", "user.name", "user.email"]) && (statusFilter === "all" || (statusFilter === "active" ? row.active === true : row.active === false)));
    return (
      <>
      <Panel title="Couriers" description="Courier operators available for delivery assignment.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search courier…"
          filters={["active", "inactive"]}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <DataTable
          rows={rows}
          emptyLabel={props.couriers.length === 0 ? "No couriers exist yet." : "No couriers match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Courier", cell: (row) => <span className="font-bold">{text(row.name)}</span> },
            { header: "Phone", cell: (row) => <span>{text(row.phone)}</span> },
            { header: "Account", cell: (row) => <span className="text-xs text-[#8B949E]">{text(value(row, "user.email"))}</span> },
            { header: "Active", cell: (row) => <StatusBadge status={row.active ? "active" : "inactive"} /> },
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> },
            {
              header: "Access",
              cell: (row) => {
                const active = row.active === true;
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (active) {
                        const reason = window.prompt(`Reason for suspending ${text(row.name)}?`);
                        if (!reason || !reason.trim()) return;
                        void run(String(row.id), () => apiClient.adminSetCourierStatus(String(row.id), false, reason.trim()), `${text(row.name)} suspended.`);
                        return;
                      }
                      if (!window.confirm(`Reactivate ${text(row.name)}? They can take new deliveries again.`)) return;
                      void run(String(row.id), () => apiClient.adminSetCourierStatus(String(row.id), true), `${text(row.name)} reactivated.`);
                    }}
                    className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
                  >
                    {busy ? "Working…" : active ? "Suspend" : "Reactivate"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "drivers") {
    const drivers = props.users.filter((row) => {
      const roles = Array.isArray(row.roles) ? row.roles.map((entry: Row) => entry?.role?.name) : [];
      return roles.includes("driver") || row.actorType === "DRIVER";
    });
    const rows = drivers.filter((row) => matches(row, ["name", "email", "phone"]));
    return (
      <Panel title="Drivers" description="Accounts holding the driver role. Driver presence and vehicle telemetry are not recorded in this build.">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search driver…" onRefresh={onRefresh} />
        <DataTable
          rows={rows}
          emptyLabel={drivers.length === 0 ? "No driver accounts exist yet." : "No drivers match this search."}
          columns={[
            { header: "Driver", cell: (row) => <span className="font-bold">{text(row.name)}</span> },
            { header: "Email", cell: (row) => <span className="text-xs text-[#8B949E]">{text(row.email)}</span> },
            { header: "Phone", cell: (row) => <span>{text(row.phone)}</span> },
            { header: "Roles", cell: (row) => <span className="text-xs">{roleNames(row)}</span> },
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> },
            {
              header: "Access",
              cell: (row) => {
                const profile = row.driverProfile as Row | null;
                if (!profile) return <span className="text-xs text-[#8B949E]">No profile</span>;
                const status = String(profile.status);
                if (status === "pending") return <span className="text-xs text-[#8B949E]">Pending</span>;
                const suspended = status === "suspended";
                const busy = busyId === String(row.id);
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (suspended) {
                        if (!window.confirm(`Reactivate ${text(row.name)}? They can accept new rides again.`)) return;
                        void run(String(row.id), () => apiClient.adminSetDriverStatus(String(row.id), "approved"), `${text(row.name)} reactivated.`);
                        return;
                      }
                      const reason = window.prompt(`Reason for suspending ${text(row.name)}?`);
                      if (!reason || !reason.trim()) return;
                      void run(
                        String(row.id),
                        () => apiClient.adminSetDriverStatus(String(row.id), "suspended", reason.trim()),
                        `${text(row.name)} suspended.`
                      );
                    }}
                    className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
                  >
                    {busy ? "Working…" : suspended ? "Reactivate" : "Suspend"}
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
    );
  }

  if (tab === "disputes") {
    const rows = filterRows(props.disputes).filter((row) => matches(row, ["order.orderNumber", "customer.name", "customer.email", "vendor.name", "reason", "status"]));
    const statuses = Array.from(new Set(props.disputes.map((row) => String(row.status)))).sort();
    return (
      <>
      <Panel title="Disputes" description="Buyer-opened disputes with their order, escrow state and reason. Resolve by refunding the buyer or releasing escrow to the seller.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search order, buyer, seller, reason…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <DataTable
          rows={rows}
          emptyLabel={props.disputes.length === 0 ? "No disputes have been opened." : "No disputes match this filter."}
          onDetail={setDetail}
          columns={[
            {
              header: "Order",
              cell: (row) => (
                <div>
                  <p className="font-bold">{text(value(row, "order.orderNumber"), "—")}</p>
                  <p className="text-xs text-[#8B949E]">{money(value(row, "order.totalKobo"))}</p>
                </div>
              )
            },
            { header: "Buyer", cell: (row) => <span className="text-xs">{text(value(row, "customer.name") ?? value(row, "customer.email"), "—")}</span> },
            { header: "Seller", cell: (row) => <span className="text-xs">{text(value(row, "vendor.name"), "—")}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Escrow", cell: (row) => <span className="text-xs">{statusLabel(text(value(row, "escrow.status"), "—"))}</span> },
            { header: "Opened", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> },
            {
              header: "Action",
              cell: (row) => {
                const closed = ["resolved_refund", "resolved_release", "rejected"].includes(String(row.status));
                return (
                  <button
                    type="button"
                    disabled={closed}
                    onClick={() => setDisputeRow(row)}
                    className="rounded-lg border border-[#21262D] px-2.5 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-40"
                  >
                    Resolve
                  </button>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      {disputeRow ? (
        <DisputeResolveDialog
          row={disputeRow}
          onClose={() => setDisputeRow(null)}
          onResolved={(message) => {
            setDisputeRow(null);
            setMessage(message);
            setError("");
            onRefresh();
          }}
        />
      ) : null}
      </>
    );
  }

  if (tab === "freight") {
    const rows = filterRows(props.freight).filter((row) => matches(row, ["reference", "customerName", "originCity", "destinationCity", "commodity", "status"]));
    const statuses = Array.from(new Set(props.freight.map((row) => String(row.status)))).sort();

    function act(row: Row, action: "quote" | "assign" | "transit" | "deliver" | "cancel") {
      const id = String(row.id);
      const label = text(row.reference);
      void run(
        id,
        async () => {
          if (action === "quote") {
            const amount = window.prompt(`Quote amount in naira for ${label}?`);
            if (!amount) throw new Error("Quote cancelled.");
            const carrier = window.prompt("Carrier or service name for this quote?");
            if (!carrier) throw new Error("Carrier name is required.");
            return apiClient.adminUpdateFreight(id, "quote", { quoteKobo: String(Math.round(Number(amount) * 100)), carrierName: carrier });
          }
          if (action === "assign") {
            const carrier = window.prompt("Carrier name for this shipment?");
            if (!carrier) throw new Error("Carrier name is required.");
            return apiClient.adminUpdateFreight(id, "assign", { carrierName: carrier });
          }
          return apiClient.adminUpdateFreight(id, action, {});
        },
        `${label} updated.`
      );
    }

    return (
      <>
      <Panel title="Freight" description="Quote requests captured from NaijaSend. Quote, assign a carrier and record milestones so the sender can track the shipment.">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search reference, customer, route…"
          filters={statuses}
          filterValue={statusFilter}
          onFilter={setStatusFilter}
          onRefresh={onRefresh}
        />
        <ActionFeedback message={message} error={error} />
        <DataTable
          rows={rows}
          emptyLabel={props.freight.length === 0 ? "No freight requests yet." : "No freight requests match this filter."}
          onDetail={setDetail}
          columns={[
            { header: "Reference", cell: (row) => <span className="font-bold">{text(row.reference)}</span> },
            { header: "Route", cell: (row) => <span className="text-xs">{text(row.originCity)} → {text(row.destinationCity)}</span> },
            { header: "Customer", cell: (row) => <span className="text-xs">{text(row.customerName)}<br /><span className="text-[#8B949E]">{text(row.customerEmail)}</span></span> },
            { header: "Service", cell: (row) => <span className="text-xs">{statusLabel(text(row.serviceType))}</span> },
            { header: "Weight", cell: (row) => <span className="text-xs">{text(row.weightKg, "—")} kg</span>, className: "text-right" },
            { header: "Quote", cell: (row) => <span className="text-xs">{row.quoteKobo ? money(row.quoteKobo) : "—"}</span>, className: "text-right" },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            {
              header: "Action",
              cell: (row) => {
                const status = String(row.status);
                const busy = busyId === String(row.id);
                const buttons: Array<{ label: string; action: "quote" | "assign" | "transit" | "deliver" | "cancel" }> = [];
                if (status === "quote_requested") buttons.push({ label: "Quote", action: "quote" });
                if (status === "quoted") buttons.push({ label: "Assign", action: "assign" });
                if (status === "carrier_assigned") buttons.push({ label: "In transit", action: "transit" });
                if (status === "in_transit") buttons.push({ label: "Delivered", action: "deliver" });
                if (["quote_requested", "quoted", "carrier_assigned", "in_transit"].includes(status)) buttons.push({ label: "Cancel", action: "cancel" });
                return (
                  <div className="flex flex-wrap gap-1">
                    {buttons.map((button) => (
                      <button
                        key={button.action}
                        type="button"
                        disabled={busy}
                        onClick={() => act(row, button.action)}
                        className="rounded-lg border border-[#21262D] px-2 py-1 text-[11px] font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-40"
                      >
                        {busy ? "…" : button.label}
                      </button>
                    ))}
                  </div>
                );
              }
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "audit") {
    const rows = props.audit.filter((row) => matches(row, ["action", "entity", "actor.name", "actor.email"]));
    return (
      <>
      <Panel title="Audit log" description="Server-recorded administrative and domain actions. This list is the authoritative activity feed.">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search action, entity, actor…" onRefresh={onRefresh} />
        <DataTable
          rows={rows}
          emptyLabel={props.audit.length === 0 ? "No audit entries have been recorded." : "No entries match this search."}
          onDetail={setDetail}
          columns={[
            { header: "When", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> },
            { header: "Action", cell: (row) => <span className="font-bold">{text(row.action)}</span> },
            { header: "Entity", cell: (row) => <span>{text(row.entity)}</span> },
            {
              header: "Actor",
              cell: (row) => (
                <span className="text-xs">
                  {text(value(row, "actor.name"), "System")}
                  <br />
                  <span className="text-[#8B949E]">{text(value(row, "actor.email"), "")}</span>
                </span>
              )
            }
          ]}
        />
      </Panel>
      {detail ? <RecordDialog row={detail} onClose={() => setDetail(null)} /> : null}
      </>
    );
  }

  if (tab === "settings") {
    return (
      <div className="space-y-4">
        <SuperAdminSettings isSuperAdmin={isSuperAdmin} />
        <CountryActivation isSuperAdmin={isSuperAdmin} />
      </div>
    );
  }

  return null;
}

interface SystemSnapshot {
  actor: { name: string; email: string };
  counts: { users: number; roles: number; vendors: number; orders: number };
  roles: Array<{ name: string; description: string | null }>;
  paymentMethods: Array<{ id: string; label: string; configured: boolean; reason?: string }>;
  environment: { nodeEnv: string; appUrlConfigured: boolean; databaseConfigured: boolean };
  loadedAt: string;
}

function SuperAdminSettings({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [state, setState] = useState<{ data: SystemSnapshot | null; loading: boolean; error: string; status: number }>({
    data: null,
    loading: isSuperAdmin,
    error: "",
    status: 0
  });

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/super-admin/system", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setState({ data: null, loading: false, error: body?.error ?? `Request failed with HTTP ${res.status}`, status: res.status });
          return;
        }
        setState({ data: body as SystemSnapshot, loading: false, error: "", status: res.status });
      } catch (caught) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: caught instanceof Error ? caught.message : "Request failed.", status: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <Panel title="Platform settings" description="This area is restricted to super administrators.">
        <div className="flex items-start gap-3 p-6 text-sm text-[#8B949E]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-crimson" aria-hidden="true" />
          <p>
            Your account has administrator access but not the <code className="rounded bg-[#0B0E14] px-1">super_admin</code> role.
            The server rejects this area with HTTP 403 for standard administrators.
          </p>
        </div>
      </Panel>
    );
  }

  if (state.loading) {
    return (
      <Panel title="Platform settings" description="Loading the server-enforced super-administrator snapshot…">
        <div className="flex items-center gap-3 p-6 text-sm text-[#8B949E]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading…
        </div>
      </Panel>
    );
  }

  if (!state.data) {
    return (
      <Panel title="Platform settings" description="The super-administrator endpoint did not return a snapshot.">
        <div className="flex items-start gap-3 p-6 text-sm text-crimson">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            {state.error || "Unknown error."}
            {state.status ? ` (HTTP ${state.status})` : ""}
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Platform settings" description="Read-only platform state returned by the super-admin-only API endpoint.">
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2 text-sm text-[#00E676]">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Signed in as {state.data.actor.name} ({state.data.actor.email})
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Users", state.data.counts.users],
            ["Roles", state.data.counts.roles],
            ["Vendors", state.data.counts.vendors],
            ["Orders", state.data.counts.orders]
          ].map(([label, count]) => (
            <div key={String(label)} className="rounded-xl bg-[#21262D] p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{String(count)}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="text-sm font-bold text-[#F0F6FC]">Roles in the database</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {state.data.roles.map((role) => (
              <li key={role.name} className="rounded-full border border-[#21262D] bg-[#0B0E14] px-3 py-1 text-xs text-[#C9D1D9]">
                {role.name}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold text-[#F0F6FC]">Payment providers</h3>
          <ul className="mt-2 space-y-2">
            {state.data.paymentMethods.map((method) => (
              <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] p-3 text-sm">
                <span className="font-bold text-[#F0F6FC]">{method.label}</span>
                <span className={method.configured ? "text-[#00E676]" : "text-[#F59E0B]"}>
                  {method.configured ? "Configured" : "Not configured"}
                </span>
                {!method.configured && method.reason && <span className="w-full text-xs text-[#8B949E]">{method.reason}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[#21262D] p-3 text-xs text-[#8B949E]">
          <p>Environment: <strong className="text-[#F0F6FC]">{state.data.environment.nodeEnv}</strong></p>
          <p>Application URL configured: {state.data.environment.appUrlConfigured ? "yes" : "no"}</p>
          <p>Database configured: {state.data.environment.databaseConfigured ? "yes" : "no"}</p>
          <p>Snapshot loaded: {date(state.data.loadedAt)}</p>
          <p className="mt-2 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Secrets are never returned by this endpoint.
          </p>
        </div>

        <Link href="/admin?tab=audit" className="inline-flex items-center gap-2 text-sm font-bold text-[#00E676] hover:underline">
          Open the audit log
        </Link>
      </div>
    </Panel>
  );
}


interface CountryRow {
  code: string;
  name: string;
  currency: string;
  enabled: boolean;
  deliveryEnabled: boolean;
  configuredEnabled: boolean;
  configuredDeliveryEnabled: boolean;
  source: "database" | "configuration";
  updatedAt: string | null;
}

function CountryActivation({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; deliveryEnabled: boolean }>>({});
  const [loading, setLoading] = useState(isSuperAdmin);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [cities, setCities] = useState<Array<Record<string, unknown> & { countryCode: string; city: string; code: string; enabled: boolean; source: string }>>([]);
  const [cityBusy, setCityBusy] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .adminCountries()
      .then(async (data) => {
        if (cancelled) return;
        const typed = data as unknown as CountryRow[];
        setRows(typed);
        setDraft(Object.fromEntries(typed.map((row) => [row.code, { enabled: row.enabled, deliveryEnabled: row.deliveryEnabled }])));
        setLoading(false);
        const cityData = (await apiClient.adminCities()) as unknown as typeof cities;
        if (!cancelled) setCities(cityData);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load country activation.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  async function toggleCity(entry: { countryCode: string; city: string; enabled: boolean }) {
    const key = entry.countryCode + ":" + entry.city;
    setCityBusy(key);
    setMessage("");
    setError("");
    try {
      await apiClient.adminUpdateCity(entry.countryCode, entry.city, !entry.enabled);
      const data = (await apiClient.adminCities()) as unknown as typeof cities;
      setCities(data);
      setMessage(`${entry.city} availability saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update city availability.");
    } finally {
      setCityBusy("");
    }
  }

  async function save(row: CountryRow) {
    const next = draft[row.code];
    if (!next) return;
    setBusy(row.code);
    setMessage("");
    setError("");
    try {
      await apiClient.adminUpdateCountry(row.code, next.enabled, next.deliveryEnabled);
      const data = (await apiClient.adminCountries()) as unknown as CountryRow[];
      setRows(data);
      setDraft(Object.fromEntries(data.map((item) => [item.code, { enabled: item.enabled, deliveryEnabled: item.deliveryEnabled }])));
      setMessage(`${row.name} activation saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save country activation.");
    } finally {
      setBusy("");
    }
  }

  if (!isSuperAdmin) return null;

  return (
    <Panel
      title="Country activation"
      description="Checkout and delivery honour these switches. Countries without a saved override follow lib/config/commerce.ts."
    >
      {message ? <p role="status" className="px-4 pt-3 text-xs font-bold text-[#00E676]">{message}</p> : null}
      {error ? <p role="alert" className="px-4 pt-3 text-xs font-bold text-crimson">{error}</p> : null}
      {loading ? (
        <p className="px-4 py-6 text-sm text-[#8B949E]">Loading countries…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-y border-[#21262D] bg-[#0B0E14] text-xs uppercase tracking-wide text-[#8B949E]">
                <th scope="col" className="px-4 py-3 font-bold">Country</th>
                <th scope="col" className="px-4 py-3 font-bold">Sell enabled</th>
                <th scope="col" className="px-4 py-3 font-bold">Delivery</th>
                <th scope="col" className="px-4 py-3 font-bold">Source</th>
                <th scope="col" className="px-4 py-3 font-bold">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {rows.map((row) => {
                const current = draft[row.code] ?? { enabled: row.enabled, deliveryEnabled: row.deliveryEnabled };
                const dirty = current.enabled !== row.enabled || current.deliveryEnabled !== row.deliveryEnabled;
                return (
                  <tr key={row.code}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#F0F6FC]">{row.name}</p>
                      <p className="text-xs text-[#8B949E]">{row.code} · {row.currency}</p>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          aria-label={`Sell enabled in ${row.name}`}
                          checked={current.enabled}
                          onChange={(event) => setDraft({ ...draft, [row.code]: { ...current, enabled: event.target.checked } })}
                          className="h-4 w-4 accent-[#00E676]"
                        />
                        {current.enabled ? "On" : "Off"}
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          aria-label={`Delivery enabled in ${row.name}`}
                          checked={current.deliveryEnabled}
                          onChange={(event) => setDraft({ ...draft, [row.code]: { ...current, deliveryEnabled: event.target.checked } })}
                          className="h-4 w-4 accent-[#00E676]"
                        />
                        {current.deliveryEnabled ? "Configured" : "Not configured"}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#8B949E]">
                      {row.source === "database" ? "Saved override" : "Config default"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!dirty || busy === row.code}
                        onClick={() => void save(row)}
                        className="rounded-lg border border-[#21262D] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-40"
                      >
                        {busy === row.code ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-[#21262D] px-4 py-4">
        <h3 className="text-sm font-extrabold text-[#F0F6FC]">City availability</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#8B949E]">
          Controls whether a city can be selected for onboarding or staff scope. Cities without a saved override follow
          the country&apos;s delivery readiness.
        </p>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-[#21262D]">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="sticky top-0 bg-[#0B0E14] text-[10px] uppercase tracking-wide text-[#8B949E]">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Country</th>
                <th scope="col" className="px-3 py-2 font-bold">City</th>
                <th scope="col" className="px-3 py-2 font-bold">Available</th>
                <th scope="col" className="px-3 py-2 font-bold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {cities.map((entry) => {
                const key = entry.countryCode + ":" + entry.city;
                return (
                  <tr key={key}>
                    <td className="px-3 py-2 text-xs text-[#8B949E]">{entry.countryCode}</td>
                    <td className="px-3 py-2 text-xs font-semibold">{entry.city}</td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          aria-label={`${entry.city} available`}
                          checked={Boolean(entry.enabled)}
                          disabled={cityBusy === key}
                          onChange={() => void toggleCity(entry)}
                          className="h-4 w-4 accent-[#00E676]"
                        />
                        {entry.enabled ? "On" : "Off"}
                      </label>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#8B949E]">{entry.source === "database" ? "Saved" : "Config"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
