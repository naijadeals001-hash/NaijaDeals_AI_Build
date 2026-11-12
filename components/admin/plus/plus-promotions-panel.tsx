"use client";

import { Fragment, useCallback, useId, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { plusApi, type PlusMutationResult, type PlusPromotion } from "./plus-api";
import {
  PROMOTION_KINDS,
  buildPromotionPayload,
  isValidPlusKey,
  suggestKey,
  type PlusPromotionPayload,
  type PromotionKind
} from "./plus-payloads";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  FIELD_CONTROL_CLASS,
  FIELD_CONTROL_INVALID_CLASS,
  Field,
  LoadingBlock,
  Notice,
  Panel,
  PanelHeader,
  ReadOnlyNote,
  StatusBadge,
  formatDateTime,
  useResource
} from "./plus-ui";

const KIND_LABELS: Record<PromotionKind, string> = {
  HOUSE: "House promotion",
  SPONSORED: "Sponsored advertisement"
};

const KIND_DESCRIPTIONS: Record<PromotionKind, string> = {
  HOUSE: "Editorial content from NaijaDeals, including real member-benefit messaging.",
  SPONSORED: "Third-party placement. Requires a named sponsor, a disclosure label and advertiser approval."
};

type PromotionFormValues = {
  key: string;
  title: string;
  body: string;
  kind: PromotionKind;
  sponsorName: string;
  disclosureLabel: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_PROMOTION_FORM: PromotionFormValues = {
  key: "",
  title: "",
  body: "",
  kind: "HOUSE",
  sponsorName: "",
  disclosureLabel: "",
  startsAt: "",
  endsAt: ""
};

function valuesFromPromotion(promotion: PlusPromotion): PromotionFormValues {
  return {
    key: promotion.key,
    title: promotion.title,
    body: promotion.body,
    kind: promotion.kind === "SPONSORED" ? "SPONSORED" : "HOUSE",
    sponsorName: promotion.sponsorName ?? "",
    disclosureLabel: promotion.disclosureLabel ?? "",
    startsAt: toDateTimeLocalValue(promotion.startsAt),
    endsAt: toDateTimeLocalValue(promotion.endsAt)
  };
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function PromotionForm({
  heading,
  initial,
  isEdit = false,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel
}: {
  heading: string;
  initial: PromotionFormValues;
  isEdit?: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: PlusPromotionPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<PromotionFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [keyTouched, setKeyTouched] = useState(isEdit);

  function update<K extends keyof PromotionFormValues>(key: K, value: PromotionFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function updateTitle(title: string) {
    setValues((previous) => ({
      ...previous,
      title,
      ...(!isEdit && !keyTouched ? { key: suggestKey("promotion", title) } : {})
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const key = values.key.trim().toLowerCase();
    const title = values.title.trim();
    const body = values.body.trim();
    const sponsorName = values.sponsorName.trim();
    const disclosureLabel = values.disclosureLabel.trim();
    const sponsored = values.kind === "SPONSORED";

    if (!key) nextErrors.key = "Enter a stable key for this promotion.";
    else if (!isValidPlusKey(key)) {
      nextErrors.key = "Use 3-80 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.";
    }
    if (!title) nextErrors.title = "Enter the promotion title.";
    else if (title.length > 120) nextErrors.title = "Keep the title to 120 characters or fewer.";
    if (!body) nextErrors.body = "Describe what is being promoted.";
    else if (body.length > 2000) nextErrors.body = "Keep the body to 2000 characters or fewer.";
    if (sponsored && !sponsorName) nextErrors.sponsorName = "A sponsored advertisement needs the sponsor's name.";
    if (sponsored && !disclosureLabel) {
      nextErrors.disclosureLabel = "Add the disclosure label customers will see.";
    }

    const startsAt = fromDateTimeLocalValue(values.startsAt);
    const endsAt = fromDateTimeLocalValue(values.endsAt);
    if (values.startsAt && !startsAt) nextErrors.startsAt = "Enter a valid start date and time.";
    if (values.endsAt && !endsAt) nextErrors.endsAt = "Enter a valid end date and time.";
    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      nextErrors.endsAt = "The end must be after the start.";
    }

    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    try {
      await onSubmit(
        buildPromotionPayload({
          key,
          kind: values.kind,
          title,
          body,
          sponsorName: sponsored ? sponsorName : null,
          disclosureLabel: sponsored ? disclosureLabel : null,
          startsAt,
          endsAt
        })
      );
    } catch (error) {
      setServerError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-xl border border-[#30363D] bg-[#0B0E14]/70 p-3 sm:p-4">
      <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{heading}</h3>
      {serverError ? <ErrorBlock title="The server rejected the promotion" error={serverError} /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-[#F0F6FC]">
          Kind <span className="text-[#F2CE72]" aria-hidden="true">*</span>
        </legend>
        <p className="text-xs leading-5 text-[#8B949E]">
          The server accepts HOUSE or SPONSORED. The kind cannot change after creation; sponsored placements need a named
          sponsor and an explicit disclosure label.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROMOTION_KINDS.map((kind) => (
            <label
              key={kind}
              className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${
                values.kind === kind ? "border-[#00E676] bg-[#123024]/60" : "border-[#30363D] bg-[#161B22]"
              } ${isEdit ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={kind}
                checked={values.kind === kind}
                onChange={() => update("kind", kind)}
                disabled={isEdit}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#00E676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
              />
              <span className="min-w-0">
                <span className="block font-bold text-[#F0F6FC]">{KIND_LABELS[kind]}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#8B949E]">{KIND_DESCRIPTIONS[kind]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-key`}
          label="Key"
          required
          error={errors.key}
          hint={
            isEdit
              ? "The key is immutable once the promotion is created."
              : "Auto-suggested from the title. Lowercase letters, digits, hyphens or underscores."
          }
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.key}
              onChange={(event) => {
                setKeyTouched(true);
                update("key", event.target.value);
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              readOnly={isEdit}
              maxLength={80}
              placeholder="promotion-summer"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""} ${
                isEdit ? "opacity-70" : ""
              }`}
            />
          )}
        </Field>

        <Field id={`${id}-title`} label="Title" required error={errors.title}>
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.title}
              onChange={(event) => updateTitle(event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={140}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field
            id={`${id}-body`}
            label="Body"
            required
            error={errors.body}
            hint="Customer-facing copy. Sent to the server as `body`."
          >
            {({ id: fieldId, describedBy, invalid }) => (
              <textarea
                id={fieldId}
                value={values.body}
                onChange={(event) => update("body", event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                aria-required
                rows={3}
                maxLength={2000}
                className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
              />
            )}
          </Field>
        </div>

        {values.kind === "SPONSORED" ? (
          <>
            <Field
              id={`${id}-sponsor`}
              label="Sponsor name"
              required
              error={errors.sponsorName}
              hint="The named sponsor. This does not create an advertiser account."
            >
              {({ id: fieldId, describedBy, invalid }) => (
                <input
                  id={fieldId}
                  value={values.sponsorName}
                  onChange={(event) => update("sponsorName", event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  aria-required
                  maxLength={160}
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                />
              )}
            </Field>

            <Field
              id={`${id}-disclosure`}
              label="Disclosure label"
              required
              error={errors.disclosureLabel}
              hint="Shown to customers, for example “Sponsored by Acme Ltd”."
            >
              {({ id: fieldId, describedBy, invalid }) => (
                <input
                  id={fieldId}
                  value={values.disclosureLabel}
                  onChange={(event) => update("disclosureLabel", event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  aria-required
                  maxLength={60}
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                />
              )}
            </Field>
          </>
        ) : null}

        <Field id={`${id}-starts`} label="Starts at" error={errors.startsAt} hint="Optional. Local time.">
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => update("startsAt", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field id={`${id}-ends`} label="Ends at" error={errors.endsAt} hint="Optional. Local time.">
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              type="datetime-local"
              value={values.endsAt}
              onChange={(event) => update("endsAt", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Feedback = { kind: "success"; message: string } | { kind: "error"; error: unknown };

export function PlusPromotionsPanel({
  canWrite,
  canPublish,
  canApprove
}: {
  canWrite: boolean;
  canPublish: boolean;
  canApprove: boolean;
}) {
  const load = useCallback(() => plusApi.promotions.list(), []);
  const resource = useResource(load);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [rejectionErrors, setRejectionErrors] = useState<Record<string, string>>({});

  const promotions = resource.data ?? [];

  function clearFeedback(id: string) {
    setFeedback((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  async function act(
    promotion: PlusPromotion,
    key: string,
    action: () => Promise<PlusMutationResult>,
    successMessage: string
  ): Promise<boolean> {
    setBusyKey(`${key}:${promotion.id}`);
    clearFeedback(promotion.id);
    setNotice(null);
    try {
      const result = await action();
      setFeedback((previous) => ({
        ...previous,
        [promotion.id]: { kind: "success", message: result.message ?? successMessage }
      }));
      await resource.reload();
      return true;
    } catch (error) {
      setFeedback((previous) => ({ ...previous, [promotion.id]: { kind: "error", error } }));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function create(input: PlusPromotionPayload) {
    const result = await plusApi.promotions.create(input);
    setCreating(false);
    setEditingId(null);
    setNotice(result.message ?? `The server created the ${input.kind === "HOUSE" ? "house" : "sponsored"} promotion as a draft.`);
    await resource.reload();
  }

  async function update(id: string, input: PlusPromotionPayload) {
    const result = await plusApi.promotions.update(id, input);
    setEditingId(null);
    setNotice(result.message ?? "The server accepted the promotion changes.");
    await resource.reload();
  }

  function submitReject(promotion: PlusPromotion) {
    const reason = (rejectionReasons[promotion.id] ?? "").trim();
    if (!reason) {
      setRejectionErrors((previous) => ({ ...previous, [promotion.id]: "Give a reason for the rejection." }));
      return;
    }
    setRejectionErrors((previous) => {
      const next = { ...previous };
      delete next[promotion.id];
      return next;
    });
    void act(
      promotion,
      "reject",
      () => plusApi.promotions.reject(promotion.id, reason),
      `The server accepted the rejection of “${promotion.title}”.`
    ).then((ok) => {
      if (ok) setRejectionReasons((previous) => ({ ...previous, [promotion.id]: "" }));
    });
  }

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Content review only">
        This workspace has no advertiser accounts, targeting engine, live campaign switch or sponsored billing. House
        promotions use the content-publish permission; sponsored advertisements are submitted for advertiser review and
        always need a named sponsor and an explicit disclosure label.
      </Notice>

      <Panel>
        <PanelHeader
          title="Promotions"
          description="Two server kinds share one review workflow: house promotions and sponsored advertisements."
          actions={
            canWrite && !creating ? (
              <Button
                variant="primary"
                onClick={() => {
                  setCreating(true);
                  setEditingId(null);
                  setNotice(null);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New promotion
              </Button>
            ) : null
          }
        />
        {!canWrite ? (
          <div className="mt-3">
            <ReadOnlyNote>
              Creating, editing and submitting promotions requires <code className="font-mono">plus:content:write</code>.
            </ReadOnlyNote>
          </div>
        ) : null}
        {!canApprove ? (
          <p className="mt-2 text-xs leading-5 text-[#8B949E]">
            Approving or rejecting a submitted sponsored advertisement requires{" "}
            <code className="font-mono">plus:advertiser:approve</code>.
          </p>
        ) : null}
        {!canPublish ? (
          <p className="mt-1 text-xs leading-5 text-[#8B949E]">
            Approving a house promotion, publishing and archiving require{" "}
            <code className="font-mono">plus:content:publish</code>.
          </p>
        ) : null}
        {notice ? (
          <div className="mt-3">
            <Notice tone="success" title="Server response">{notice}</Notice>
          </div>
        ) : null}
      </Panel>

      {creating ? (
        <Panel>
          <PromotionForm
            heading="New promotion"
            initial={EMPTY_PROMOTION_FORM}
            submitLabel="Create draft"
            pendingLabel="Creating…"
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Promotion register"
          description="House: draft → approved → published. Sponsored: draft → submitted for review → approved or rejected → published. Archive instead of deleting."
        />
        <div className="mt-4">
          {resource.phase === "loading" && !resource.data ? <LoadingBlock label="Loading promotions…" /> : null}
          {resource.phase === "error" && !resource.data ? (
            <ErrorBlock
              title="Could not load promotions"
              error={resource.error}
              onRetry={resource.reload}
              permissionHint="Reading promotions requires the plus:content:read permission."
            />
          ) : null}
          {resource.data && resource.data.length === 0 ? (
            <EmptyBlock
              title="No promotions configured"
              action={
                canWrite && !creating ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create the first promotion
                  </Button>
                ) : null
              }
            >
              The server returned no promotions. No advertiser or campaign is created by this screen.
            </EmptyBlock>
          ) : null}
          {resource.data && resource.data.length > 0 ? (
            <ul className="space-y-3">
              {promotions.map((promotion) => {
                const itemFeedback = feedback[promotion.id];
                const status = promotion.status;
                const kind = promotion.kind;
                const sponsored = kind === "SPONSORED";
                const kindKnown = kind !== "UNKNOWN";
                const sponsorReady =
                  !sponsored || Boolean(promotion.sponsorName && promotion.disclosureLabel);
                const starts = formatDateTime(promotion.startsAt);
                const ends = formatDateTime(promotion.endsAt);
                const canEdit = canWrite && kindKnown && (status === "DRAFT" || status === "REJECTED");
                const canSubmitSponsored =
                  canWrite && sponsored && sponsorReady && (status === "DRAFT" || status === "REJECTED");
                const canApproveHouse = canPublish && kind === "HOUSE" && status === "DRAFT";
                const canReviewSponsored =
                  canApprove && sponsored && (status === "PENDING_REVIEW" || status === "SUBMITTED");
                const showPublish = canPublish && status === "APPROVED";
                const showArchive = canPublish && status !== "ARCHIVED";
                const rejectionError = rejectionErrors[promotion.id];
                const hasActions =
                  canEdit || canSubmitSponsored || canApproveHouse || canReviewSponsored || showPublish || showArchive;

                return (
                  <Fragment key={promotion.id}>
                    <li className="rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{promotion.title}</h3>
                        <StatusBadge status={promotion.status} />
                        <span className="rounded-full border border-[#30363D] bg-[#21262D] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#C9D1D9]">
                          {kindKnown ? KIND_LABELS[kind] : "Kind not reported"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-[#8B949E]">{promotion.key || "Key not reported"}</p>
                      <p className="mt-1 text-sm leading-6 text-[#C9D1D9]">{promotion.body}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8B949E]">
                        {starts || ends
                          ? `${starts ?? "No start recorded"} → ${ends ?? "No end recorded"}`
                          : "No schedule recorded"}
                      </p>
                      {sponsored ? (
                        <div className="mt-2 rounded-lg border border-[#30363D] bg-[#161B22] p-2.5 text-xs leading-5">
                          <p className="text-[#8B949E]">
                            Sponsor: <span className="font-bold text-[#F0F6FC]">{promotion.sponsorName ?? "Not recorded"}</span>
                          </p>
                          <p className="text-[#8B949E]">
                            Disclosure:{" "}
                            <span className="font-bold text-[#F0F6FC]">{promotion.disclosureLabel ?? "Not recorded"}</span>
                          </p>
                          {!sponsorReady ? (
                            <p className="mt-1 font-bold text-[#F2CE72]">
                              This sponsored advertisement is missing required disclosure details. Submission, approval and
                              publishing stay disabled until both are recorded.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {itemFeedback ? (
                        <div className="mt-3">
                          {itemFeedback.kind === "success" ? (
                            <Notice tone="success" title="Server response">{itemFeedback.message}</Notice>
                          ) : (
                            <ErrorBlock title="The server rejected the action" error={itemFeedback.error} />
                          )}
                        </div>
                      ) : null}

                      {hasActions ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {canEdit ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditingId(promotion.id);
                                setCreating(false);
                                setNotice(null);
                                clearFeedback(promotion.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                          ) : null}
                          {canSubmitSponsored ? (
                            <Button
                              variant="primary"
                              onClick={() =>
                                void act(
                                  promotion,
                                  "submit",
                                  () => plusApi.promotions.submit(promotion.id),
                                  `The server accepted “${promotion.title}” for advertiser review.`
                                )
                              }
                              busy={busyKey === `submit:${promotion.id}`}
                              disabled={busyKey !== null && busyKey !== `submit:${promotion.id}`}
                            >
                              Submit for review
                            </Button>
                          ) : null}
                          {canApproveHouse ? (
                            <Button
                              variant="primary"
                              onClick={() =>
                                void act(
                                  promotion,
                                  "approve",
                                  () => plusApi.promotions.approve(promotion.id),
                                  `The server approved the house promotion “${promotion.title}”.`
                                )
                              }
                              busy={busyKey === `approve:${promotion.id}`}
                              disabled={busyKey !== null && busyKey !== `approve:${promotion.id}`}
                            >
                              Approve house promotion
                            </Button>
                          ) : null}
                          {canReviewSponsored ? (
                            <>
                              <Button
                                variant="primary"
                                onClick={() =>
                                  void act(
                                    promotion,
                                    "approve",
                                    () => plusApi.promotions.approve(promotion.id),
                                    `The server approved the sponsored promotion “${promotion.title}”.`
                                  )
                                }
                                busy={busyKey === `approve:${promotion.id}`}
                                disabled={!sponsorReady || (busyKey !== null && busyKey !== `approve:${promotion.id}`)}
                              >
                                Approve
                              </Button>
                              <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-end">
                                <Field
                                  id={`reject-${promotion.id}`}
                                  label="Rejection reason"
                                  error={rejectionError}
                                  hint="Required before rejecting."
                                >
                                  {({ id: fieldId, describedBy, invalid }) => (
                                    <input
                                      id={fieldId}
                                      value={rejectionReasons[promotion.id] ?? ""}
                                      onChange={(event) =>
                                        setRejectionReasons((previous) => ({
                                          ...previous,
                                          [promotion.id]: event.target.value
                                        }))
                                      }
                                      aria-describedby={describedBy}
                                      aria-invalid={invalid || undefined}
                                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                                    />
                                  )}
                                </Field>
                                <Button
                                  variant="danger"
                                  onClick={() => submitReject(promotion)}
                                  busy={busyKey === `reject:${promotion.id}`}
                                  disabled={busyKey !== null && busyKey !== `reject:${promotion.id}`}
                                >
                                  Reject
                                </Button>
                              </div>
                            </>
                          ) : null}
                          {showPublish ? (
                            <Button
                              variant="primary"
                              onClick={() =>
                                void act(
                                  promotion,
                                  "publish",
                                  () => plusApi.promotions.publish(promotion.id),
                                  `The server accepted the publish request for “${promotion.title}”.`
                                )
                              }
                              busy={busyKey === `publish:${promotion.id}`}
                              disabled={!sponsorReady || (busyKey !== null && busyKey !== `publish:${promotion.id}`)}
                            >
                              Publish
                            </Button>
                          ) : null}
                          {showArchive ? (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void act(
                                  promotion,
                                  "archive",
                                  () => plusApi.promotions.archive(promotion.id),
                                  `The server accepted the archive request for “${promotion.title}”.`
                                )
                              }
                              busy={busyKey === `archive:${promotion.id}`}
                              disabled={busyKey !== null && busyKey !== `archive:${promotion.id}`}
                            >
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {!kindKnown ? (
                        <p className="mt-2 text-xs leading-5 text-[#F2CE72]">
                          The server did not report this promotion&apos;s kind, so workflow actions are hidden.
                        </p>
                      ) : !hasActions && status !== "ARCHIVED" ? (
                        <p className="mt-2 text-xs leading-5 text-[#8B949E]">
                          No workflow action is available to this session for the current status.
                        </p>
                      ) : null}
                    </li>
                    {editingId === promotion.id ? (
                      <li>
                        <PromotionForm
                          heading={`Edit “${promotion.title}”`}
                          initial={valuesFromPromotion(promotion)}
                          isEdit
                          submitLabel="Save draft"
                          pendingLabel="Saving…"
                          onSubmit={(input) => update(promotion.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ul>
          ) : null}
          {resource.phase === "error" && resource.data ? (
            <div className="mt-3">
              <ErrorBlock title="Could not refresh the promotion register" error={resource.error} onRetry={resource.reload} />
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
