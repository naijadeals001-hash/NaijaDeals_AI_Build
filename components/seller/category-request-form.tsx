"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Send, X, XCircle } from "lucide-react";
import {
  TaxonomyApiError,
  createCategoryRequest,
  getMyCategoryRequests,
  getSellerCategories,
  taxonomyErrorMessage,
  type CategoryRequestStatus,
  type SellerCategory,
  type SellerCategoryRequest
} from "@/lib/taxonomy-api";

const STATUS_STYLE: Record<CategoryRequestStatus, string> = {
  PENDING: "border-amber-300/70 bg-amber-50 text-[#7a4c00]",
  APPROVED: "border-primary/30 bg-primary-soft text-primary",
  REJECTED: "border-crimson/30 bg-crimson-soft text-[#991B1B]"
};

const STATUS_ICON = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle
} as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

/** Generic buckets the marketplace must not silently publish into. */
const GENERIC_NAMES = new Set(["other", "others", "uncategorized", "uncategorised", "misc", "miscellaneous"]);

/**
 * Seller category request + own-request status list.
 *
 * A request is only ever a request: the API stores it as PENDING and staff
 * resolve it in the Control Center. The form therefore never claims the
 * category exists, and it never offers a generic "Other" bucket as a shortcut.
 */
export function CategoryRequestForm({
  open,
  initialName = "",
  onClose,
  onSubmitted
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [suggestedName, setSuggestedName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");

  const [requests, setRequests] = useState<SellerCategoryRequest[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");

  const [parentOptions, setParentOptions] = useState<SellerCategory[]>([]);
  const [parentStatus, setParentStatus] = useState<"loading" | "ready" | "error">("loading");

  const loadRequests = useCallback(async () => {
    setListStatus("loading");
    setListError("");
    try {
      const rows = await getMyCategoryRequests();
      setRequests(rows);
      setListStatus("ready");
    } catch (error) {
      setListError(
        taxonomyErrorMessage(error, { missingEndpoint: "Category requests are not enabled yet." })
      );
      setListStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    let active = true;
    setParentStatus("loading");
    getSellerCategories()
      .then((rows) => {
        if (!active) return;
        setParentOptions(rows);
        setParentStatus("ready");
      })
      .catch(() => {
        if (active) setParentStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setFieldErrors({});
    setSuccess("");
    if (initialName.trim()) {
      setSuggestedName((current) => current.trim() || initialName.trim());
    }
  }, [open, initialName]);

  const pendingCount = useMemo(() => requests.filter((request) => request.status === "PENDING").length, [requests]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    setSuccess("");

    const name = suggestedName.trim();
    const detail = description.trim();
    const image = imageUrl.trim();
    const errors: Record<string, string> = {};

    if (name.length < 3) errors.suggestedName = "Give the category a name of at least 3 characters.";
    if (name.length > 120) errors.suggestedName = "Category names must be 120 characters or fewer.";
    if (GENERIC_NAMES.has(name.toLowerCase())) {
      errors.suggestedName = "Name the products this category will hold instead of a generic bucket.";
    }
    if (detail.length < 15) errors.description = "Describe the products this category should hold (at least 15 characters).";
    if (detail.length > 1000) errors.description = "Keep the description to 1000 characters or fewer.";
    if (image && !/^(\/|https?:\/\/)/i.test(image)) {
      errors.imageUrl = "Use an approved project path beginning with / or a full https URL.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Check the highlighted fields before sending the request.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCategoryRequest({
        suggestedName: name,
        description: detail,
        parentId: parentId || null,
        imageUrl: image || null
      });
      setSuccess(
        created.status === "PENDING"
          ? "Request sent. The Control Center reviews it before any category is published."
          : `Request recorded with status ${created.status}.`
      );
      setSuggestedName("");
      setDescription("");
      setImageUrl("");
      setParentId("");
      await loadRequests();
      onSubmitted?.();
    } catch (error) {
      setFormError(taxonomyErrorMessage(error));
      if (error instanceof TaxonomyApiError && error.issues.length > 0) {
        setFieldErrors(
          Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]))
        );
      }
      await loadRequests();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="category-requests-heading" className="rounded-2xl border border-border-soft bg-canvas p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="category-requests-heading" className="font-display text-xl font-extrabold">
            Category requests
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            Nothing is published from here. A request is reviewed by the Control Center, which either maps it to an
            existing category or creates one. Pending requests: {pendingCount}.
          </p>
        </div>
        {open ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border-soft px-3 text-xs font-bold text-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Close request form
          </button>
        ) : null}
      </div>

      {success ? (
        <div role="status" className="mt-3 rounded-xl border border-primary/25 bg-primary-soft p-3 text-sm font-semibold text-primary">
          {success}
        </div>
      ) : null}

      {open ? (
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3 rounded-xl border border-border-soft bg-surface-low p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="category-request-name" className="text-xs font-bold uppercase tracking-wide text-muted">
              Proposed category name <span className="text-crimson">*</span>
            </label>
            <input
              id="category-request-name"
              value={suggestedName}
              onChange={(event) => setSuggestedName(event.target.value.slice(0, 120))}
              maxLength={120}
              aria-required
              aria-invalid={Boolean(fieldErrors.suggestedName)}
              aria-describedby={fieldErrors.suggestedName ? "category-request-name-error" : undefined}
              className={`mt-1 min-h-10 w-full rounded-lg border bg-canvas px-3 text-sm font-semibold text-ink ${
                fieldErrors.suggestedName ? "border-crimson" : "border-border-soft"
              }`}
            />
            {fieldErrors.suggestedName ? (
              <p id="category-request-name-error" role="alert" className="mt-1 text-[11px] font-bold text-crimson">
                {fieldErrors.suggestedName}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="category-request-description" className="text-xs font-bold uppercase tracking-wide text-muted">
              What will this category hold? <span className="text-crimson">*</span>
            </label>
            <textarea
              id="category-request-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
              maxLength={1000}
              aria-required
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? "category-request-description-error" : "category-request-description-help"}
              className={`mt-1 w-full rounded-lg border bg-canvas px-3 py-2 text-sm font-semibold text-ink ${
                fieldErrors.description ? "border-crimson" : "border-border-soft"
              }`}
            />
            <p id="category-request-description-help" className="mt-1 text-[10.5px] leading-4 text-muted">
              Name the actual products, materials or brands so reviewers can match it to the published tree.
              {description.length > 0 ? ` ${description.length}/1000` : ""}
            </p>
            {fieldErrors.description ? (
              <p id="category-request-description-error" role="alert" className="mt-1 text-[11px] font-bold text-crimson">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="category-request-parent" className="text-xs font-bold uppercase tracking-wide text-muted">
              Proposed parent
            </label>
            <select
              id="category-request-parent"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm font-semibold text-ink"
            >
              <option value="">No specific parent</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.path}
                </option>
              ))}
            </select>
            {parentStatus === "loading" ? (
              <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Loading published categories…
              </p>
            ) : parentStatus === "error" ? (
              <p className="mt-1 text-[10.5px] leading-4 text-[#8a4a10]">
                Published categories are unavailable right now. You can still submit without a parent.
              </p>
            ) : (
              <p className="mt-1 text-[10.5px] leading-4 text-muted">
                Reviewers may place the category elsewhere in the hierarchy.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="category-request-image" className="text-xs font-bold uppercase tracking-wide text-muted">
              Existing image (optional)
            </label>
            <input
              id="category-request-image"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value.slice(0, 500))}
              maxLength={500}
              placeholder="/generated/shop/category-….webp"
              aria-invalid={Boolean(fieldErrors.imageUrl)}
              aria-describedby={fieldErrors.imageUrl ? "category-request-image-error" : "category-request-image-help"}
              className={`mt-1 min-h-10 w-full rounded-lg border bg-canvas px-3 text-sm font-semibold text-ink ${
                fieldErrors.imageUrl ? "border-crimson" : "border-border-soft"
              }`}
            />
            <p id="category-request-image-help" className="mt-1 flex items-start gap-1 text-[10.5px] leading-4 text-muted">
              <ImageIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              An approved project path or https URL you already have rights to use. The Control Center can replace it.
            </p>
            {fieldErrors.imageUrl ? (
              <p id="category-request-image-error" role="alert" className="mt-1 text-[11px] font-bold text-crimson">
                {fieldErrors.imageUrl}
              </p>
            ) : null}
          </div>

          {formError ? (
            <div role="alert" className="rounded-lg border border-crimson/30 bg-crimson-soft p-3 text-sm font-semibold text-[#991B1B] sm:col-span-2">
              <p className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {formError}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {submitting ? "Sending request…" : "Send for review"}
            </button>
            <p className="text-[10.5px] leading-4 text-muted">
              Requests are stored as PENDING. Your product stays a draft until a real category is chosen.
            </p>
          </div>
        </form>
      ) : null}

      <div className="mt-4">
        <h3 className="text-xs font-black uppercase tracking-wide text-muted">Your requests</h3>
        {listStatus === "loading" ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            Loading your category requests…
          </p>
        ) : null}
        {listStatus === "error" ? (
          <div role="alert" className="mt-2 rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-semibold text-[#991B1B]">
            {listError}
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="ml-2 min-h-9 rounded-lg border border-crimson/40 px-2 text-xs font-bold"
            >
              Try again
            </button>
          </div>
        ) : null}
        {listStatus === "ready" && requests.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border-soft bg-surface-low p-3 text-sm text-muted">
            No category requests yet. Use the form when the published tree does not cover what you sell.
          </p>
        ) : null}
        {requests.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {requests.map((request) => {
              const Icon = STATUS_ICON[request.status];
              return (
                <li key={request.id} className="rounded-xl border border-border-soft bg-surface-low p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-extrabold text-ink">{request.suggestedName || "Category request"}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLE[request.status]}`}
                    >
                      <Icon className="h-3 w-3" aria-hidden />
                      {request.status}
                    </span>
                  </div>
                  {request.description ? <p className="mt-1 text-[12px] leading-5 text-muted">{request.description}</p> : null}
                  <dl className="mt-2 grid gap-1 text-[11px] leading-4 text-muted sm:grid-cols-2">
                    {request.parentPath ? (
                      <div>
                        <dt className="inline font-bold text-ink">Proposed parent: </dt>
                        <dd className="inline">{request.parentPath}</dd>
                      </div>
                    ) : null}
                    {request.resolvedCategoryPath ? (
                      <div>
                        <dt className="inline font-bold text-ink">Resolved to: </dt>
                        <dd className="inline">{request.resolvedCategoryPath}</dd>
                      </div>
                    ) : null}
                    {request.createdAt ? (
                      <div>
                        <dt className="inline font-bold text-ink">Sent: </dt>
                        <dd className="inline">{formatDate(request.createdAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {request.status !== "PENDING" ? (
                    <p className="mt-2 rounded-lg bg-canvas p-2 text-[11px] leading-4 text-ink">
                      <span className="font-bold">Control Center response: </span>
                      {request.adminNote?.trim() || "Resolved without a note."}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-4 text-muted">Waiting for Control Center review. No category is published yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
