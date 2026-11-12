"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Store
} from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  statusLabel,
  type ApiOrder,
  type ApiOrderItem,
  type ApiVendor,
  type SellerOverview
} from "@/lib/api-client";

const OPEN_RETURN_STATUSES = new Set(["REQUESTED", "APPROVED", "RECEIVED"]);
const RETURN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const RETURN_REASONS = [
  "Item arrived damaged or defective",
  "Wrong item was delivered",
  "Item is not as described",
  "Parts or accessories are missing",
  "Item stopped working after delivery",
  "Changed my mind"
];

type StoredReturn = {
  id: string;
  status: string;
  reason: string;
  detail?: string | null;
  refundKobo?: string | number | null;
  restocked?: boolean;
  createdAt: string;
  resolvedAt?: string | null;
};

type RefundSummary = {
  claimedKobo: string;
  settledKobo: string;
  pendingClaimKobo: string;
  failedKobo: string;
  unclaimedReservationKobo: string;
  hasPendingClaims: boolean;
};

/**
 * The orders read model adds `returnRequests` rows and a ledger-derived refund
 * summary. `ApiOrder` deliberately keeps the narrow public shape, so the
 * returns view widens it locally instead of guessing at missing fields.
 */
type ReturnOrder = Omit<ApiOrder, "returnRequests" | "vendor"> & {
  updatedAt?: string;
  returnRequests?: StoredReturn[];
  refundSummary?: RefundSummary;
  vendor?: ApiVendor;
};

type ReturnCase = { request: StoredReturn; order: ReturnOrder };

type SellerReturnRow = StoredReturn & {
  order: { orderNumber: string };
  user: { name: string };
};

type SellerQueueState = {
  status: "loading" | "ready" | "unavailable" | "error";
  vendor: { id: string; name: string } | null;
  returns: SellerReturnRow[];
  error: string;
};

type Eligibility = {
  eligible: boolean;
  reason: "eligible" | "not_delivered" | "open_case" | "window_closed";
  windowEndsAt: number | null;
};

type RefundTone = "complete" | "pending" | "failed" | "attention" | "none";

type RefundView = {
  tone: RefundTone;
  title: string;
  detail: string;
};

type TimelineEvent = {
  key: string;
  label: string;
  at?: string | null;
  note?: string;
  state: "done" | "current" | "attention";
};

const STATUS_BADGE: Record<string, string> = {
  REQUESTED: "border-[#f0d49a] bg-[#fff7e6] text-[#7a4a00]",
  APPROVED: "border-[#b9d4ea] bg-[#eaf4fb] text-[#0b4f86]",
  RECEIVED: "border-[#c8ddc0] bg-[#eef4ea] text-[#0b5c33]",
  REFUNDED: "border-[#b9e3c6] bg-[#e7f8ed] text-[#075c32]",
  REJECTED: "border-[#efc4c4] bg-[#fdecec] text-[#8f1d1d]"
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Awaiting seller",
  APPROVED: "Approved",
  REJECTED: "Declined",
  RECEIVED: "Item received",
  REFUNDED: "Return closed"
};

const REFUND_TONE_CLASS: Record<RefundTone, string> = {
  complete: "border-[#b9e3c6] bg-[#e7f8ed] text-[#075c32]",
  pending: "border-[#f0d49a] bg-[#fff7e6] text-[#7a4a00]",
  failed: "border-[#efc4c4] bg-[#fdecec] text-[#8f1d1d]",
  attention: "border-[#f0d49a] bg-[#fff7e6] text-[#7a4a00]",
  none: "border-[#dce6d8] bg-[#f7faf4] text-[#3d4f43]"
};

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function formatDate(value: string | null | undefined) {
  const time = parseTime(value);
  if (time === null) return "Date not recorded";
  return new Date(time).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  const time = parseTime(value);
  if (time === null) return "Date not recorded";
  return new Date(time).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Presentation reference only. The API and support use the full record id. */
export function returnCaseReference(id: string) {
  const cleaned = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `RET-${cleaned.slice(-8)}`;
}

export function returnEligibility(order: ReturnOrder, now = Date.now()): Eligibility {
  const open = (order.returnRequests ?? []).some((request) => OPEN_RETURN_STATUSES.has(request.status));
  const base = parseTime(order.updatedAt ?? order.createdAt);
  const windowEndsAt = base === null ? null : base + RETURN_WINDOW_DAYS * DAY_MS;
  if (!["delivered", "completed"].includes(order.status)) {
    return { eligible: false, reason: "not_delivered", windowEndsAt };
  }
  if (open) return { eligible: false, reason: "open_case", windowEndsAt };
  // Fail closed when the server timestamp is missing: the server would reject
  // an unknown age, so the form must not invite a request it cannot accept.
  if (windowEndsAt === null || now > windowEndsAt) {
    return { eligible: false, reason: "window_closed", windowEndsAt };
  }
  return { eligible: true, reason: "eligible", windowEndsAt };
}

function refundView(entry: ReturnCase): RefundView {
  const summary = entry.order.refundSummary;
  const settled = toNumber(summary?.settledKobo);
  const pending = toNumber(summary?.pendingClaimKobo);
  const failed = toNumber(summary?.failedKobo);
  const unclaimed = toNumber(summary?.unclaimedReservationKobo);
  const requested = toNumber(entry.request.refundKobo);

  if (settled > 0) {
    return {
      tone: "complete",
      title: `Refund completed: ${koboToNaira(settled, entry.order.currency)}`,
      detail:
        requested > settled
          ? `The refund ledger records ${koboToNaira(settled, entry.order.currency)} completed against ${koboToNaira(requested, entry.order.currency)} requested. The remaining balance is not confirmed.`
          : "The refund ledger records this money as returned to the buyer."
    };
  }
  if (pending > 0) {
    return {
      tone: "pending",
      title: `Refund in progress: ${koboToNaira(pending, entry.order.currency)}`,
      detail: "The payment provider has not confirmed the refund yet. A submitted claim is not proof that money moved."
    };
  }
  if (failed > 0) {
    return {
      tone: "failed",
      title: `Refund attempt failed: ${koboToNaira(failed, entry.order.currency)}`,
      detail: "No completed refund is recorded. Contact support so the failed attempt can be reconciled or retried."
    };
  }
  if (unclaimed > 0) {
    return {
      tone: "attention",
      title: "Refund amount reserved but not completed",
      detail: "The order has a reserved refund amount without a completed refund record. Support needs to reconcile it."
    };
  }
  if (entry.request.status === "REFUNDED") {
    return {
      tone: "attention",
      title: "Return closed; refund not confirmed",
      detail:
        "The return record is closed, but no completed refund record is visible. Do not treat this as money returned until support reconciles it."
    };
  }
  if (entry.request.status === "RECEIVED") {
    return {
      tone: "pending",
      title: "Refund not recorded yet",
      detail: "The seller marked the item received. A completed refund record has not appeared yet."
    };
  }
  if (entry.request.status === "REJECTED") {
    return {
      tone: "none",
      title: "No refund issued",
      detail: "This return was declined, so no refund is expected from this case."
    };
  }
  return {
    tone: "none",
    title: "No refund yet",
    detail: "Refunds are only recorded after the seller receives the item and the payment provider confirms the refund."
  };
}

function caseTimeline(entry: ReturnCase): TimelineEvent[] {
  const refund = refundView(entry);
  const events: TimelineEvent[] = [
    { key: "requested", label: "Return requested", at: entry.request.createdAt, state: "done" }
  ];
  if (entry.request.status === "APPROVED") {
    events.push({ key: "approved", label: "Seller approved the return", at: entry.request.resolvedAt, state: "done" });
    events.push({
      key: "awaiting-item",
      label: "Send the item back",
      state: "current",
      note: "The seller has not recorded the item as received yet."
    });
  } else if (entry.request.status === "REJECTED") {
    events.push({ key: "rejected", label: "Seller declined the return", at: entry.request.resolvedAt, state: "attention" });
    events.push({
      key: "closed",
      label: "Case closed without a refund",
      state: "done",
      note: "Contact support if you believe the decision is wrong."
    });
  } else if (entry.request.status === "RECEIVED" || entry.request.status === "REFUNDED") {
    events.push({ key: "received", label: "Seller received the item", at: entry.request.resolvedAt, state: "done" });
    events.push({
      key: "refund",
      label: refund.tone === "complete" ? "Refund completed" : "Refund follow-up",
      state: refund.tone === "complete" ? "done" : "current",
      note: refund.title
    });
  } else {
    events.push({
      key: "review",
      label: "Seller review",
      state: "current",
      note: "Waiting for the seller to approve or decline the return."
    });
  }
  return events;
}

function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase();
  const label = STATUS_LABEL[key] ?? statusLabel(status);
  return (
    <span
      aria-label={`Return status: ${label}`}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${STATUS_BADGE[key] ?? "border-[#dce6d8] bg-[#f7faf4] text-[#3d4f43]"}`}
    >
      {label}
    </span>
  );
}

function ReturnItems({ order }: { order: ReturnOrder }) {
  return (
    <ul className="mt-3 divide-y divide-[#eef3ec]">
      {order.items.map((item: ApiOrderItem) => (
        <li key={item.id} className="flex items-center gap-3 py-2">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="h-12 w-12 shrink-0 rounded-lg border border-[#eef3ec] object-contain"
            />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#566359]" aria-hidden>
              <PackageCheck className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[#14241b]">{item.productName}</span>
            <span className="block text-xs text-[#566359]">
              Qty {item.quantity}
              {item.variantName ? ` · ${item.variantName}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold">{koboToNaira(item.totalKobo, order.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="mt-3 space-y-3">
      {events.map((event) => (
        <li key={event.key} className="flex gap-2">
          {event.state === "done" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0b7a4a]" aria-hidden />
          ) : event.state === "attention" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9a5b00]" aria-hidden />
          ) : (
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#9a5b00]" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#14241b]">{event.label}</p>
            {event.at ? <p className="text-xs text-[#566359]">{formatDateTime(event.at)}</p> : null}
            {event.note ? <p className="mt-0.5 text-xs leading-5 text-[#566359]">{event.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function RefundPanel({ entry }: { entry: ReturnCase }) {
  const refund = refundView(entry);
  return (
    <div className={`rounded-xl border p-3 ${REFUND_TONE_CLASS[refund.tone]}`}>
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em]">
        <ReceiptText className="h-4 w-4" aria-hidden /> Refund status
      </p>
      <p className="mt-1 text-sm font-extrabold">{refund.title}</p>
      <p className="mt-1 text-xs leading-5">{refund.detail}</p>
    </div>
  );
}

function ReturnCaseCard({ entry, highlighted }: { entry: ReturnCase; highlighted: boolean }) {
  const { request, order } = entry;
  const reference = returnCaseReference(request.id);
  const timeline = caseTimeline(entry);
  return (
    <article
      aria-labelledby={`return-case-${request.id}`}
      className={`rounded-2xl border bg-white p-4 sm:p-5 ${
        highlighted ? "border-[#0b5c33] ring-2 ring-[#0b5c33]/20" : "border-[#dce6d8]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#566359]">Case {reference}</p>
          <h3
            id={`return-case-${request.id}`}
            tabIndex={-1}
            className="mt-0.5 font-display text-xl font-extrabold text-[#14241b] outline-none"
          >
            <span className="sr-only">Case {reference}: </span>
            {STATUS_LABEL[request.status] ?? statusLabel(request.status)}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-[#566359]">
            Order {order.orderNumber} · {order.vendor?.name ?? "Seller"}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-bold uppercase tracking-wide text-[#566359]">Requested</dt>
          <dd className="font-semibold">{formatDate(request.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-[#566359]">Order total</dt>
          <dd className="font-semibold">{koboToNaira(order.totalKobo, order.currency)}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase tracking-wide text-[#566359]">Payment</dt>
          <dd className="font-semibold">{statusLabel(order.paymentStatus)}</dd>
        </div>
      </dl>

      <ReturnItems order={order} />

      <div className="mt-3 rounded-xl bg-[#f7faf4] p-3">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#566359]">Reason</p>
        <p className="mt-1 text-sm font-bold text-[#14241b]">{request.reason}</p>
        {request.detail ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4b5b51]">{request.detail}</p> : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section aria-label={`Case ${reference} timeline`} className="rounded-xl border border-[#eef3ec] p-3">
          <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#566359]">Timeline</h4>
          <Timeline events={timeline} />
        </section>
        <div className="space-y-3">
          <RefundPanel entry={entry} />
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/orders/${order.id}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[#b9cbb4] px-3 text-xs font-extrabold text-[#0b5c33] hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              View order <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/naijashop/help"
              className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-[#0b5c33] underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Returns help
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function ReturnRequestForm({
  order,
  onCancel,
  onSubmitted
}: {
  order: ReturnOrder;
  onCancel: () => void;
  onSubmitted: (created: StoredReturn) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError("Choose the reason that best matches the problem.");
      reasonRef.current?.focus();
      return;
    }
    if (reason === "Other" && !detail.trim()) {
      setError("Add a short note describing the problem.");
      detailRef.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const created = await apiClient.requestReturn(order.id, reason, detail.trim() || undefined);
      await onSubmitted(created as unknown as StoredReturn);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the return request.");
    } finally {
      setBusy(false);
    }
  }

  const reasonId = `return-reason-${order.id}`;
  const detailId = `return-detail-${order.id}`;
  const helpId = `return-help-${order.id}`;

  return (
    <form
      onSubmit={submit}
      aria-label={`Start a return for order ${order.orderNumber}`}
      className="mt-4 rounded-xl border border-[#cfe0ca] bg-[#f7faf4] p-3 sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={reasonId} className="block text-xs font-black uppercase tracking-[0.12em] text-[#3d4f43]">
            Reason <span aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </label>
          <div className="relative mt-1">
            <select
              ref={reasonRef}
              id={reasonId}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={helpId}
              aria-invalid={error && !reason ? true : undefined}
              className="min-h-11 w-full appearance-none rounded-lg border border-[#b9cbb4] bg-white pl-3 pr-9 text-sm font-semibold text-[#14241b] outline-none focus:border-[#0b5c33] focus-visible:ring-2 focus-visible:ring-[#0b5c33]/25"
            >
              <option value="" disabled>
                Select a reason
              </option>
              {RETURN_REASONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4b5b51]" aria-hidden />
          </div>
        </div>
        <div>
          <label htmlFor={detailId} className="block text-xs font-black uppercase tracking-[0.12em] text-[#3d4f43]">
            Notes <span className="font-semibold normal-case tracking-normal text-[#566359]">(optional)</span>
          </label>
          <textarea
            ref={detailRef}
            id={detailId}
            value={detail}
            onChange={(event) => setDetail(event.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="What went wrong? Include model, size or condition details."
            aria-describedby={helpId}
            className="mt-1 w-full rounded-lg border border-[#b9cbb4] bg-white px-3 py-2 text-sm text-[#14241b] outline-none placeholder:text-[#6b7b70] focus:border-[#0b5c33] focus-visible:ring-2 focus-visible:ring-[#0b5c33]/25"
          />
          <p className="mt-1 text-right text-[11px] text-[#566359]">{detail.length}/500</p>
        </div>
      </div>

      <p id={helpId} className="mt-2 text-[11px] leading-4 text-[#566359]">
        The seller sees this reason and these notes. Photo or document evidence is not supported by the return API yet. Do not
        include card, bank or password details.
      </p>

      {error ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mt-3 flex gap-2 rounded-lg border border-[#e5b4b4] bg-[#fdecec] p-3 text-sm font-semibold text-[#8f1d1d] outline-none"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#07351f] px-4 text-sm font-extrabold text-white hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
          {busy ? "Submitting…" : "Submit return request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-full border border-[#b9cbb4] px-4 text-sm font-extrabold text-[#0b5c33] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EligibleOrderCard({
  order,
  open,
  onToggle,
  onSubmitted
}: {
  order: ReturnOrder;
  open: boolean;
  onToggle: () => void;
  onSubmitted: (created: StoredReturn) => Promise<void> | void;
}) {
  const eligibility = returnEligibility(order);
  const formId = `return-form-${order.id}`;
  return (
    <article id={`eligible-order-${order.id}`} className="scroll-mt-28 rounded-2xl border border-[#dce6d8] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#566359]">Order {order.orderNumber}</p>
          <h3 className="mt-0.5 font-display text-lg font-extrabold text-[#14241b]">{order.vendor?.name ?? "Seller"}</h3>
          <p className="text-xs font-semibold text-[#566359]">
            Last updated {formatDate(order.updatedAt ?? order.createdAt)}
            {eligibility.windowEndsAt ? ` · Return by ${formatDate(new Date(eligibility.windowEndsAt).toISOString())}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-extrabold text-[#006d38]">{koboToNaira(order.totalKobo, order.currency)}</p>
          <p className="text-xs font-bold text-[#566359]">Payment: {statusLabel(order.paymentStatus)}</p>
        </div>
      </div>

      <ReturnItems order={order} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={formId}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#07351f] px-4 text-sm font-extrabold text-white hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
        >
          {open ? "Close return form" : "Start a return"}
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <Link
          href={`/orders/${order.id}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-[#0b5c33] underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
        >
          View order <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {open ? (
        <div id={formId}>
          <ReturnRequestForm order={order} onCancel={onToggle} onSubmitted={onSubmitted} />
        </div>
      ) : null}
    </article>
  );
}

function SellerReturnCard({
  row,
  busy,
  confirming,
  onApprove,
  onConfirm,
  onAskConfirm,
  onCancelConfirm
}: {
  row: SellerReturnRow;
  busy: boolean;
  confirming: "reject" | "receive" | null;
  onApprove: () => void;
  onConfirm: () => void;
  onAskConfirm: (action: "reject" | "receive") => void;
  onCancelConfirm: () => void;
}) {
  const refundKobo = toNumber(row.refundKobo);
  return (
    <article className="rounded-xl border border-[#dce6d8] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#566359]">Order {row.order.orderNumber}</p>
          <h3 className="mt-0.5 font-display text-lg font-extrabold text-[#14241b]">
            {row.user?.name ?? "Customer"} · {STATUS_LABEL[row.status] ?? statusLabel(row.status)}
          </h3>
          <p className="text-xs text-[#566359]">Requested {formatDate(row.createdAt)}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <p className="mt-2 text-sm font-bold text-[#14241b]">{row.reason}</p>
      {row.detail ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4b5b51]">{row.detail}</p> : null}
      {row.status === "REFUNDED" && refundKobo > 0 ? (
        <p className="mt-2 text-xs font-bold text-[#075c32]">Recorded return refund: {koboToNaira(refundKobo)}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {row.status === "REQUESTED" ? (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="min-h-10 rounded-full bg-[#07351f] px-4 text-xs font-extrabold text-white hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Approve return"}
            </button>
            <button
              type="button"
              onClick={() => onAskConfirm("reject")}
              disabled={busy}
              className="min-h-10 rounded-full border border-[#b9cbb4] px-4 text-xs font-extrabold text-[#0b5c33] hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        ) : null}
        {row.status === "APPROVED" ? (
          <button
            type="button"
            onClick={() => onAskConfirm("receive")}
            disabled={busy}
            className="min-h-10 rounded-full bg-[#07351f] px-4 text-xs font-extrabold text-white hover:bg-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Receive and refund
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="mt-3 rounded-lg border border-[#f0d49a] bg-[#fff7e6] p-3" role="group" aria-label="Confirm seller action">
          <p className="text-sm font-bold text-[#7a4a00]">
            {confirming === "receive"
              ? "Receive the item and start the refund?"
              : "Decline this return request?"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#7a4a00]">
            {confirming === "receive"
              ? "Only continue after the item is physically with you. The seller API restocks the returned units and calls the refund payment path."
              : "The customer will see the decline and this case will be closed without a refund."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="min-h-10 rounded-full bg-[#7a4a00] px-4 text-xs font-extrabold text-white hover:bg-[#5f3a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a4a00] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy ? "Working…" : confirming === "receive" ? "Confirm receive and refund" : "Confirm decline"}
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              disabled={busy}
              className="min-h-10 rounded-full border border-[#d9b978] px-4 text-xs font-extrabold text-[#7a4a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a4a00] focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading returns and refunds</span>
      <div className="h-40 animate-pulse rounded-3xl border border-[#dce6d8] bg-white/80" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl border border-[#dce6d8] bg-white/80" />
        <div className="h-56 animate-pulse rounded-2xl border border-[#dce6d8] bg-white/80" />
      </div>
    </div>
  );
}

export function ReturnsCasePage({ showSellerTools = false }: { showSellerTools?: boolean }) {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [highlightCaseId, setHighlightCaseId] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerQueueState>({
    status: showSellerTools ? "loading" : "unavailable",
    vendor: null,
    returns: [],
    error: ""
  });
  const [sellerBusy, setSellerBusy] = useState<string | null>(null);
  const [sellerConfirm, setSellerConfirm] = useState<{ id: string; action: "reject" | "receive" } | null>(null);
  const [sellerNotice, setSellerNotice] = useState("");
  const deepLinkHandled = useRef(false);
  const deepLinkScroll = useRef(false);
  const focusPending = useRef(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setStatus("loading");
    try {
      const data = (await apiClient.getOrders()) as unknown as ReturnOrder[];
      setOrders(Array.isArray(data) ? data : []);
      setStatus("ready");
      setError("");
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        setStatus("signed-out");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Unable to load returns.");
      if (mode === "initial") setStatus("error");
    }
  }, []);

  const loadSeller = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setSeller((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const overview: SellerOverview = await apiClient.sellerOverview();
      const returns = Array.isArray(overview.returns) ? (overview.returns as unknown as SellerReturnRow[]) : [];
      setSeller({
        status: "ready",
        vendor: { id: overview.vendor.id, name: overview.vendor.name },
        returns,
        error: ""
      });
    } catch (caught) {
      if (caught instanceof ApiRequestError && (caught.status === 401 || caught.status === 403)) {
        setSeller({ status: "unavailable", vendor: null, returns: [], error: "" });
        return;
      }
      setSeller((current) => ({
        ...current,
        status: "error",
        error: caught instanceof Error ? caught.message : "Unable to load the seller return queue."
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    // The server component only marks vendor sessions, so a customer visit does
    // not probe a vendor-only API and log an avoidable 403.
    if (showSellerTools) void loadSeller();
  }, [load, loadSeller, showSellerTools]);

  useEffect(() => {
    if (status !== "ready") return;
    const caseId = searchParams.get("case");
    if (caseId) {
      setHighlightCaseId(caseId);
      return;
    }
    const orderId = searchParams.get("order");
    if (!orderId || deepLinkHandled.current) return;
    if (!orders.some((order) => order.id === orderId)) return;
    deepLinkHandled.current = true;
    deepLinkScroll.current = true;
    setOpenOrderId(orderId);
  }, [orders, searchParams, status]);

  useEffect(() => {
    if (!openOrderId || !deepLinkScroll.current) return;
    deepLinkScroll.current = false;
    const target = document.getElementById(`eligible-order-${openOrderId}`);
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "auto" });
      const reasonField = document.getElementById(`return-reason-${openOrderId}`);
      reasonField?.focus({ preventScroll: true });
    }
  }, [openOrderId]);

  const cases = useMemo<ReturnCase[]>(() => {
    return orders
      .flatMap((order) => (order.returnRequests ?? []).map((request) => ({ request, order })))
      .sort((left, right) => (parseTime(right.request.createdAt) ?? 0) - (parseTime(left.request.createdAt) ?? 0));
  }, [orders]);

  const now = Date.now();
  const openCases = cases.filter((entry) => OPEN_RETURN_STATUSES.has(entry.request.status));
  const pastCases = cases.filter((entry) => !OPEN_RETURN_STATUSES.has(entry.request.status));
  const eligibleOrders = orders.filter((order) => returnEligibility(order, now).eligible);
  const closedOrders = orders.filter((order) => {
    const eligibility = returnEligibility(order, now);
    return !eligibility.eligible && eligibility.reason === "window_closed";
  });

  useEffect(() => {
    if (!focusPending.current || !highlightCaseId) return;
    const target = document.getElementById(`return-case-${highlightCaseId}`);
    if (!target) return;
    focusPending.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightCaseId, cases]);

  async function submitted(created: StoredReturn) {
    setHighlightCaseId(created.id);
    focusPending.current = true;
    setNotice(`Return request ${returnCaseReference(created.id)} submitted. The seller can now review it.`);
    setError("");
    await load("refresh");
  }

  async function sellerAction(id: string, action: "approve" | "reject" | "receive") {
    setSellerBusy(`${id}:${action}`);
    setSellerNotice("");
    setSeller((current) => ({ ...current, error: "" }));
    try {
      await apiClient.sellerReturnAction(id, action);
      setSellerConfirm(null);
      setSellerNotice(
        action === "approve"
          ? "Return approved. The customer can now send the item back."
          : action === "reject"
            ? "Return declined."
            : "Return received and refund path started."
      );
      await Promise.all([loadSeller("refresh"), load("refresh")]);
    } catch (caught) {
      setSeller((current) => ({
        ...current,
        error: caught instanceof Error ? caught.message : "Could not update this return."
      }));
    } finally {
      setSellerBusy(null);
    }
  }

  if (status === "loading") return <LoadingState />;

  if (status === "signed-out") {
    return (
      <div className="rounded-2xl border border-[#dce6d8] bg-white p-8 text-center">
        <RotateCcw className="mx-auto mb-3 h-8 w-8 text-[#0b5c33]" aria-hidden />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view returns</h1>
        <p className="mt-1 text-sm text-[#566359]">Your cases, seller decisions and refund records appear after you sign in.</p>
        <Link
          href="/login?next=/returns"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#07351f] px-5 text-sm font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-[#e5b4b4] bg-[#fdecec] p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-7 w-7 text-[#8f1d1d]" aria-hidden />
        <h1 className="font-display text-xl font-extrabold text-[#8f1d1d]">Returns could not be loaded</h1>
        <p className="mt-1 text-sm font-semibold text-[#6d2a2a]">{error || "The returns service did not respond."}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 min-h-11 rounded-full bg-[#07351f] px-5 text-sm font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-[#dce6d8] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0f7a4a]">NaijaDeals Marketplace</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-[#14241b] sm:text-4xl">Returns &amp; refunds</h1>
            <p className="mt-2 text-sm leading-6 text-[#4b5b51]">
              Raise a return for a delivered order, follow the seller&apos;s decision, and see refund status from recorded
              payments. A closed return is not proof that money moved.
            </p>
          </div>
          <dl className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[18rem]">
            <div className="rounded-xl bg-[#f7faf4] p-3">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#566359]">Open cases</dt>
              <dd className="mt-0.5 font-display text-2xl font-extrabold text-[#14241b]">{openCases.length}</dd>
            </div>
            <div className="rounded-xl bg-[#f7faf4] p-3">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#566359]">Ready to return</dt>
              <dd className="mt-0.5 font-display text-2xl font-extrabold text-[#14241b]">{eligibleOrders.length}</dd>
            </div>
            <div className="col-span-2 rounded-xl border border-[#eef3ec] p-3">
              <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#566359]">Return window</dt>
              <dd className="mt-0.5 text-xs font-semibold leading-5 text-[#3d4f43]">
                {RETURN_WINDOW_DAYS} days after delivery or the order&apos;s last update. The server re-checks every request.
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="space-y-2">
        {notice ? <div role="status" className="rounded-xl border border-[#b9e3c6] bg-[#e7f8ed] p-3 text-sm font-bold text-[#075c32]">{notice}</div> : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-[#e5b4b4] bg-[#fdecec] p-3 text-sm font-bold text-[#8f1d1d]">
            {error}
          </div>
        ) : null}
      </div>

      <section aria-labelledby="return-cases-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="return-cases-heading" className="font-display text-2xl font-extrabold text-[#14241b]">Your return cases</h2>
            <p className="text-sm text-[#566359]">Each case keeps its own status, timeline and refund record.</p>
          </div>
          <Link
            href="/orders"
            className="inline-flex min-h-10 items-center gap-1 text-xs font-extrabold text-[#0b5c33] underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
          >
            View all orders <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfe0ca] bg-white p-6 text-center">
            <RotateCcw className="mx-auto mb-2 h-7 w-7 text-[#0b5c33]" aria-hidden />
            <p className="font-display text-lg font-extrabold text-[#14241b]">No return cases yet</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[#566359]">
              When you submit a return for an eligible order, its case reference, seller decision and refund record appear
              here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...openCases, ...pastCases].map((entry) => (
              <ReturnCaseCard
                key={entry.request.id}
                entry={entry}
                highlighted={highlightCaseId === entry.request.id}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="eligible-returns-heading" className="space-y-3">
        <div>
          <h2 id="eligible-returns-heading" className="font-display text-2xl font-extrabold text-[#14241b]">Start a return</h2>
          <p className="text-sm leading-6 text-[#566359]">
            Only delivered or completed orders inside the {RETURN_WINDOW_DAYS}-day window are eligible. An open case blocks a
            second request for the same order.
          </p>
        </div>

        {eligibleOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfe0ca] bg-white p-6 text-center">
            <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-[#0b5c33]" aria-hidden />
            <p className="font-display text-lg font-extrabold text-[#14241b]">No orders are ready to return</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[#566359]">
              This is the real eligibility state. Only delivered or completed orders inside the return window can open a case.
            </p>
            <Link
              href="/orders"
              className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#b9cbb4] px-4 text-xs font-extrabold text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Review your orders
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {eligibleOrders.map((order) => (
              <EligibleOrderCard
                key={order.id}
                order={order}
                open={openOrderId === order.id}
                onToggle={() => setOpenOrderId((current) => (current === order.id ? null : order.id))}
                onSubmitted={submitted}
              />
            ))}
          </div>
        )}

        {closedOrders.length > 0 ? (
          <details className="rounded-2xl border border-[#dce6d8] bg-white p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-[#14241b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2">
              <Clock3 className="h-4 w-4 text-[#566359]" aria-hidden />
              Closed return windows ({closedOrders.length})
            </summary>
            <ul className="mt-3 divide-y divide-[#eef3ec]">
              {closedOrders.map((order) => {
                const eligibility = returnEligibility(order, now);
                return (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-bold">{order.orderNumber}</span>
                      <span className="block text-xs text-[#566359]">
                        Window closed{" "}
                        {eligibility.windowEndsAt ? formatDate(new Date(eligibility.windowEndsAt).toISOString()) : "at an unknown date"}
                      </span>
                    </span>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-xs font-extrabold text-[#0b5c33] underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                    >
                      View order
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </section>

      {seller.status === "ready" && seller.vendor ? (
        <section aria-labelledby="seller-returns-heading" className="rounded-2xl border border-[#cfe0ca] bg-[#eef4ea] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#0f7a4a]">
                <Store className="h-4 w-4" aria-hidden /> Seller tools
              </p>
              <h2 id="seller-returns-heading" className="mt-0.5 font-display text-2xl font-extrabold text-[#14241b]">
                Seller return queue
              </h2>
              <p className="text-sm leading-6 text-[#3d4f43]">
                Returns addressed to {seller.vendor.name}. Every action is checked by the seller API against this vendor.
              </p>
            </div>
            <Link
              href="/seller"
              className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[#b9cbb4] bg-white px-3 text-xs font-extrabold text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Seller dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {sellerNotice ? (
            <p role="status" className="mt-3 rounded-lg border border-[#b9e3c6] bg-[#e7f8ed] p-2.5 text-sm font-bold text-[#075c32]">
              {sellerNotice}
            </p>
          ) : null}
          {seller.error ? (
            <p role="alert" className="mt-3 rounded-lg border border-[#e5b4b4] bg-[#fdecec] p-2.5 text-sm font-bold text-[#8f1d1d]">
              {seller.error}
            </p>
          ) : null}

          {seller.returns.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[#b9cbb4] bg-white p-4 text-sm font-semibold text-[#566359]">
              No return requests for this seller.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {seller.returns.map((row) => (
                <SellerReturnCard
                  key={row.id}
                  row={row}
                  busy={sellerBusy?.startsWith(`${row.id}:`) ?? false}
                  confirming={sellerConfirm?.id === row.id ? sellerConfirm.action : null}
                  onApprove={() => void sellerAction(row.id, "approve")}
                  onConfirm={() => {
                    if (sellerConfirm?.id === row.id) void sellerAction(row.id, sellerConfirm.action);
                  }}
                  onAskConfirm={(action) => setSellerConfirm({ id: row.id, action })}
                  onCancelConfirm={() => setSellerConfirm(null)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {seller.status === "error" && (showSellerTools || seller.vendor) ? (
        <div role="alert" className="rounded-xl border border-[#e5b4b4] bg-[#fdecec] p-3 text-sm font-bold text-[#8f1d1d]">
          <p>Seller queue could not be refreshed: {seller.error}</p>
          <button
            type="button"
            onClick={() => void loadSeller()}
            className="mt-2 min-h-10 rounded-full bg-[#07351f] px-4 text-xs font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
          >
            Retry seller queue
          </button>
        </div>
      ) : null}

      <p className="flex items-start gap-2 rounded-xl bg-white p-3 text-[11px] leading-5 text-[#566359]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
        Return records use one stored resolution date. The timeline therefore shows only events the records actually store;
        it does not invent separate approval or refund timestamps.
      </p>
    </div>
  );
}
