"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";
import { PlusApiError } from "./plus-api";

/* ------------------------------------------------------------------ */
/* Dark Control Center surface tokens                                  */
/*                                                                     */
/* These are the literal colours used by the existing admin shell      */
/* (components/functional/admin-shell.tsx): dark canvas #0B0E14,       */
/* panel #161B22, border #21262D, ink #F0F6FC, muted #8B949E and the   */
/* Naija green #00E676. The workspace never applies light admin        */
/* tokens here because the shell surface is dark.                      */
/* ------------------------------------------------------------------ */

export const PANEL_CLASS = "rounded-2xl border border-[#21262D] bg-[#161B22]";

export const FIELD_CONTROL_CLASS =
  "block w-full rounded-xl border border-[#5B6572] bg-[#0B0E14] px-3 py-2 text-sm text-[#F0F6FC] placeholder:text-[#7D8590] transition-colors focus:border-[#00E676] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]/40";

export const FIELD_CONTROL_INVALID_CLASS = "border-[#C4433C]";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-[#00E676] bg-[#00E676] text-[#0B0E14] hover:bg-[#3DF08F]",
  secondary: "border border-[#30363D] bg-[#21262D] text-[#F0F6FC] hover:bg-[#2D333B]",
  danger: "border border-[#7A2324] bg-[#2B1416] text-[#FFB3AD] hover:bg-[#3A1A1D]",
  ghost: "border border-transparent text-[#8B949E] hover:bg-[#21262D] hover:text-[#F0F6FC]"
};

export function Button({
  variant = "secondary",
  busy = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${PANEL_CLASS} p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function PanelHeader({
  title,
  description,
  actions,
  headingId
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  headingId?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 id={headingId} className="font-display text-lg font-extrabold leading-tight text-[#F0F6FC]">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm leading-6 text-[#8B949E]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accessible field wrapper                                            */
/* ------------------------------------------------------------------ */

/**
 * Renders a label, optional hint and optional field-level error. The render
 * prop supplies the exact ids so `aria-describedby` and `aria-invalid` are
 * always wired to the message text that is actually on screen.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (field: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-[#F0F6FC]">
        {label}
        {required ? (
          <span className="ml-1 text-[#F2CE72]" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-[#8B949E]">
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-xs font-semibold leading-5 text-[#FFB3AD]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status and notices                                                  */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  SCHEDULED: "Scheduled",
  SUBMITTED: "Submitted for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  RETIRED: "Retired",
  PAUSED: "Paused",
  PENDING_APPROVAL: "Pending approval",
  PENDING_REVIEW: "Submitted for review",
  INVITED: "Invited",
  PAST_DUE: "Past due",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  UNKNOWN: "Status not reported"
};

function statusTone(status: string): string {
  switch (status) {
    case "PUBLISHED":
    case "APPROVED":
    case "ACTIVE":
      return "border-[#1F6F4A] bg-[#123024] text-[#7EE2A8]";
    case "DRAFT":
    case "SCHEDULED":
    case "PENDING_REVIEW":
    case "SUBMITTED":
    case "PENDING_APPROVAL":
      return "border-[#7A5B12] bg-[#2F2611] text-[#F2CE72]";
    case "REJECTED":
    case "PAUSED":
      return "border-[#7A2324] bg-[#2B1416] text-[#FFB3AD]";
    default:
      return "border-[#30363D] bg-[#21262D] text-[#C9D1D9]";
  }
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeKey(status.toLowerCase());
}

/** Status is always conveyed by text, never by colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusTone(normalized)}`}
    >
      {statusLabel(normalized)}
    </span>
  );
}

type NoticeTone = "success" | "error" | "info" | "warning";

const NOTICE_STYLES: Record<NoticeTone, { box: string; icon: ReactNode }> = {
  success: {
    box: "border-[#1F6F4A] bg-[#123024] text-[#A7EFC5]",
    icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  },
  error: {
    box: "border-[#7A2324] bg-[#2B1416] text-[#FFB3AD]",
    icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  },
  warning: {
    box: "border-[#7A5B12] bg-[#2F2611] text-[#F2CE72]",
    icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  },
  info: {
    box: "border-[#1F4B6F] bg-[#0F2333] text-[#A9D6F5]",
    icon: <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  }
};

export function Notice({
  tone,
  title,
  children
}: {
  tone: NoticeTone;
  title?: string;
  children: ReactNode;
}) {
  const style = NOTICE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`flex gap-2 rounded-xl border p-3 text-sm leading-6 ${style.box}`}
    >
      {style.icon}
      <div className="min-w-0">
        {title ? <p className="font-extrabold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error, loading, empty states                                        */
/* ------------------------------------------------------------------ */

export type DescribedError = {
  message: string;
  status: number | null;
  code: string | null;
  permissionDenied: boolean;
};

export function describeError(error: unknown): DescribedError {
  if (error instanceof PlusApiError) {
    return {
      message: error.message,
      status: error.status > 0 ? error.status : null,
      code: error.code ?? null,
      permissionDenied: error.permissionDenied
    };
  }
  if (error instanceof Error) {
    return { message: error.message, status: null, code: null, permissionDenied: false };
  }
  return {
    message: "The request failed for an unknown reason.",
    status: null,
    code: null,
    permissionDenied: false
  };
}

export function ErrorBlock({
  title,
  error,
  onRetry,
  permissionHint
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  permissionHint?: string;
}) {
  const described = describeError(error);
  const heading = described.permissionDenied ? "Permission denied" : title;

  return (
    <div role="alert" className="rounded-xl border border-[#7A2324] bg-[#2B1416] p-4 text-[#FFB3AD]">
      <p className="flex items-center gap-2 text-sm font-extrabold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {heading}
      </p>
      <p className="mt-2 text-sm leading-6">{described.message}</p>
      {described.code ? (
        <p className="mt-1 text-xs leading-5">
          Server code: <code className="rounded bg-black/30 px-1 py-0.5 font-mono">{described.code}</code>
          {described.status ? ` (HTTP ${described.status})` : ""}
        </p>
      ) : described.status ? (
        <p className="mt-1 text-xs leading-5">HTTP {described.status}</p>
      ) : null}
      {described.permissionDenied && permissionHint ? (
        <p className="mt-2 text-xs leading-5">{permissionHint}</p>
      ) : null}
      {onRetry && !described.permissionDenied ? (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" className="space-y-2">
      <p role="status" aria-live="polite" className="text-sm font-semibold text-[#8B949E]">
        {label}
      </p>
      <div aria-hidden="true" className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl border border-[#21262D] bg-[#21262D]/40 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

export function EmptyBlock({
  title,
  children,
  action
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#30363D] bg-[#0B0E14]/40 p-4">
      <p className="text-sm font-extrabold text-[#F0F6FC]">{title}</p>
      {children ? <div className="mt-1 text-sm leading-6 text-[#8B949E]">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <Notice tone="info" title="Read-only">
      {children}
    </Notice>
  );
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

type ResourceState<T> = {
  phase: "loading" | "ready" | "error";
  data: T | null;
  error: unknown;
};

/**
 * Loads a resource once and exposes a reload function. `load` must be stable
 * (wrap it in `useCallback` in the caller). A generation counter prevents an
 * older response from overwriting a newer one after a retry.
 */
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ phase: "loading", data: null, error: null });
  const generation = useRef(0);

  const run = useCallback(async () => {
    const current = ++generation.current;
    setState((previous) => ({ phase: "loading", data: previous.data, error: null }));
    try {
      const data = await load();
      if (generation.current === current) setState({ phase: "ready", data, error: null });
    } catch (error) {
      if (generation.current === current) setState({ phase: "error", data: null, error });
    }
  }, [load]);

  useEffect(() => {
    void run();
    return () => {
      generation.current += 1;
    };
  }, [run]);

  return { phase: state.phase, data: state.data, error: state.error, reload: run };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Formats a server ISO timestamp for display, or null when absent/invalid. */
export function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  // Date-only values (for example a term effective date) are calendar dates,
  // not instants. Format them in UTC so the displayed day cannot shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const calendar = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(calendar.getTime())) return null;
    return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "UTC" }).format(calendar);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Exact integer minor units, grouped for readability. No division and no
 * rounding: the operator sees the stored integer and the explicit currency.
 */
export function formatMinorUnits(value: string | null, currency: string | null): string {
  if (value === null) return "No price recorded";
  const grouped = value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped} ${currency ?? "(currency not recorded)"} minor units`;
}

/** Converts an ISO timestamp to a `datetime-local` value in local time. */
export function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a `datetime-local` value to an ISO timestamp, or null when invalid. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function countryCodesToText(codes: string[]): string {
  return codes.length > 0 ? codes.join(", ") : "No countries recorded";
}
