"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  emptyLabel
}: {
  columns: Array<{ header: string; cell: (row: Row) => React.ReactNode; className?: string }>;
  rows: Row[];
  emptyLabel: string;
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
            {columns.map((column) => (
              <th key={column.header} scope="col" className={`px-4 py-3 font-bold ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#21262D]">
          {visible.map((row, index) => (
            <tr key={String(row.id ?? index)} className="hover:bg-[#21262D]/50">
              {columns.map((column) => (
                <td key={column.header} className={`px-4 py-3 align-top text-[#F0F6FC] ${column.className ?? ""}`}>
                  {column.cell(row)}
                </td>
              ))}
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

export function WorkspaceTabContent(props: WorkspaceTabProps) {
  const { tab, isSuperAdmin, onRefresh, initialQuery } = props;
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setQuery(initialQuery);
    setStatusFilter("all");
    setMessage("");
    setError("");
  }, [tab, initialQuery]);

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
    );
  }

  if (tab === "deliveries") {
    const rows = filterRows(props.deliveries).filter((row) => matches(row, ["orderNumber", "status", "courier.name", "pickupAddress", "dropoffAddress"]));
    const statuses = Array.from(new Set(props.deliveries.map((row) => String(row.status)))).sort();
    return (
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
    );
  }

  if (tab === "rides") {
    const rows = filterRows(props.rides).filter((row) =>
      matches(row, ["rideNumber", "rider.name", "driver.user.name", "status", "pickupLabel", "dropoffLabel"])
    );
    const statuses = Array.from(new Set(props.rides.map((row) => String(row.status)))).sort();
    return (
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
    );
  }

  if (tab === "payouts") {
    const rows = filterRows(props.payouts).filter((row) => matches(row, ["reference", "vendor.name", "status"]));
    const statuses = Array.from(new Set(props.payouts.map((row) => String(row.status)))).sort();
    return (
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
    );
  }

  if (tab === "products") {
    const rows = filterRows(props.products).filter((row) => matches(row, ["name", "vendor.name", "status"]));
    const statuses = Array.from(new Set(props.products.map((row) => String(row.status)))).sort();
    return (
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
        <DataTable
          rows={rows}
          emptyLabel={props.products.length === 0 ? "No products exist yet." : "No products match this filter."}
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
    );
  }

  if (tab === "applications") {
    const rows = filterRows(props.applications).filter((row) => matches(row, ["businessName", "user.name", "user.email", "market", "status"]));
    const statuses = Array.from(new Set(props.applications.map((row) => String(row.status)))).sort();
    return (
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
    );
  }

  if (tab === "payments") {
    const rows = filterRows(props.payments).filter((row) => matches(row, ["reference", "provider", "providerReference", "status", "order.orderNumber"]));
    const statuses = Array.from(new Set(props.payments.map((row) => String(row.status)))).sort();
    return (
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
    );
  }

  if (tab === "users") {
    const rows = props.users.filter((row) => matches(row, ["name", "email", "actorType", "phone"]) && (statusFilter === "all" || String(row.actorType) === statusFilter));
    const actorTypes = Array.from(new Set(props.users.map((row) => String(row.actorType)))).sort();
    return (
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
        <DataTable
          rows={rows}
          emptyLabel={props.users.length === 0 ? "No users exist yet." : "No users match this filter."}
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
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> }
          ]}
        />
      </Panel>
    );
  }

  if (tab === "vendors") {
    const rows = filterRows(props.vendors).filter((row) => matches(row, ["name", "slug", "market", "status", "owner.name", "owner.email"]));
    const statuses = Array.from(new Set(props.vendors.map((row) => String(row.status)))).sort();
    return (
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
          columns={[
            { header: "Vendor", cell: (row) => <span className="font-bold">{text(row.name)}</span> },
            { header: "Owner", cell: (row) => <span>{text(value(row, "owner.name"))}<br /><span className="text-xs text-[#8B949E]">{text(value(row, "owner.email"))}</span></span> },
            { header: "Market", cell: (row) => <span>{text(row.market)}</span> },
            { header: "Status", cell: (row) => <StatusBadge status={text(row.status)} /> },
            { header: "Products", cell: (row) => <span>{text(value(row, "_count.products"), "0")}</span>, className: "text-right" },
            { header: "Orders", cell: (row) => <span>{text(value(row, "_count.orders"), "0")}</span>, className: "text-right" }
          ]}
        />
      </Panel>
    );
  }

  if (tab === "couriers") {
    const rows = props.couriers.filter((row) => matches(row, ["name", "phone", "user.name", "user.email"]) && (statusFilter === "all" || (statusFilter === "active" ? row.active === true : row.active === false)));
    return (
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
          columns={[
            { header: "Courier", cell: (row) => <span className="font-bold">{text(row.name)}</span> },
            { header: "Phone", cell: (row) => <span>{text(row.phone)}</span> },
            { header: "Account", cell: (row) => <span className="text-xs text-[#8B949E]">{text(value(row, "user.email"))}</span> },
            { header: "Active", cell: (row) => <StatusBadge status={row.active ? "active" : "inactive"} /> },
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> }
          ]}
        />
      </Panel>
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
            { header: "Joined", cell: (row) => <span className="text-xs text-[#8B949E]">{date(row.createdAt)}</span> }
          ]}
        />
      </Panel>
    );
  }

  if (tab === "audit") {
    const rows = props.audit.filter((row) => matches(row, ["action", "entity", "actor.name", "actor.email"]));
    return (
      <Panel title="Audit log" description="Server-recorded administrative and domain actions. This list is the authoritative activity feed.">
        <Toolbar query={query} onQuery={setQuery} placeholder="Search action, entity, actor…" onRefresh={onRefresh} />
        <DataTable
          rows={rows}
          emptyLabel={props.audit.length === 0 ? "No audit entries have been recorded." : "No entries match this search."}
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
    );
  }

  if (tab === "settings") {
    return <SuperAdminSettings isSuperAdmin={isSuperAdmin} />;
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
