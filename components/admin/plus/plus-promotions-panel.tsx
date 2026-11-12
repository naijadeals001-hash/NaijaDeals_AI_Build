"use client";

import { Fragment, useCallback, useId, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  PROMOTION_TYPES,
  plusApi,
  type PlusMutationResult,
  type PlusPromotion,
  type PlusPromotionInput,
  type PromotionType
} from "./plus-api";
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

const TYPE_LABELS: Record<PromotionType, string> = {
  HOUSE_PROMOTION: "House promotion",
  MEMBER_BENEFIT: "Member benefit",
  SPONSORED_ADVERTISEMENT: "Sponsored advertisement"
};

const TYPE_DESCRIPTIONS: Record<PromotionType, string> = {
  HOUSE_PROMOTION: "NaijaDeals promotes its own service or programme.",
  MEMBER_BENEFIT: "A promotion of a real Plus+ member benefit.",
  SPONSORED_ADVERTISEMENT: "Third-party paid placement. Requires a named sponsor and an explicit disclosure label."
};

type PromotionFormValues = {
  title: string;
  description: string;
  type: PromotionType;
  sponsorName: string;
  disclosureLabel: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_PROMOTION_FORM: PromotionFormValues = {
  title: "",
  description: "",
  type: "HOUSE_PROMOTION",
  sponsorName: "",
  disclosureLabel: "",
  startsAt: "",
  endsAt: ""
};

function valuesFromPromotion(promotion: PlusPromotion): PromotionFormValues {
  return {
    title: promotion.title,
    description: promotion.description,
    type: promotion.type === "UNKNOWN" ? "HOUSE_PROMOTION" : promotion.type,
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
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel
}: {
  heading: string;
  initial: PromotionFormValues;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: PlusPromotionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<PromotionFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  function update<K extends keyof PromotionFormValues>(key: K, value: PromotionFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const title = values.title.trim();
    const description = values.description.trim();
    const sponsorName = values.sponsorName.trim();
    const disclosureLabel = values.disclosureLabel.trim();
    const sponsored = values.type === "SPONSORED_ADVERTISEMENT";

    if (!title) nextErrors.title = "Enter the promotion title.";
    else if (title.length > 120) nextErrors.title = "Keep the title to 120 characters or fewer.";
    if (!description) nextErrors.description = "Describe what is being promoted.";
    else if (description.length > 600) nextErrors.description = "Keep the description to 600 characters or fewer.";
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
      await onSubmit({
        title,
        description,
        type: values.type,
        sponsorName: sponsored ? sponsorName : null,
        disclosureLabel: sponsored ? disclosureLabel : null,
        startsAt,
        endsAt
      });
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
          Promotion type <span className="text-[#F2CE72]" aria-hidden="true">*</span>
        </legend>
        <p className="text-xs leading-5 text-[#8B949E]">
          The three types have different review rules. Sponsored placements are never published without a named sponsor and
          a disclosure label.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {PROMOTION_TYPES.map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${
                values.type === type ? "border-[#00E676] bg-[#123024]/60" : "border-[#30363D] bg-[#161B22]"
              }`}
            >
              <input
                type="radio"
                name={`${id}-type`}
                value={type}
                checked={values.type === type}
                onChange={() => update("type", type)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#00E676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
              />
              <span className="min-w-0">
                <span className="block font-bold text-[#F0F6FC]">{TYPE_LABELS[type]}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#8B949E]">{TYPE_DESCRIPTIONS[type]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-title`} label="Title" required error={errors.title}>
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.title}
              onChange={(event) => update("title", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={140}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field id={`${id}-description`} label="Description" required error={errors.description}>
            {({ id: fieldId, describedBy, invalid }) => (
              <textarea
                id={fieldId}
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                aria-required
                rows={3}
                maxLength={700}
                className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
              />
            )}
          </Field>
        </div>

        {values.type === "SPONSORED_ADVERTISEMENT" ? (
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
                  maxLength={160}
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

  async function create(input: PlusPromotionInput) {
    const result = await plusApi.promotions.create(input);
    setCreating(false);
    setEditingId(null);
    setNotice(result.message ?? "The server accepted the new promotion as a draft.");
    await resource.reload();
  }

  async function update(id: string, input: PlusPromotionInput) {
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
        This workspace has no advertiser accounts, targeting engine, live campaign switch or sponsored billing. Promotions
        are reviewed and published as content; a sponsored item always needs a named sponsor and an explicit disclosure
        label.
      </Notice>

      <Panel>
        <PanelHeader
          title="Promotions"
          description="House promotions, member-benefit promotions and sponsored advertisements share one review workflow."
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
            Approving or rejecting a submitted promotion requires{" "}
            <code className="font-mono">plus:advertiser:approve</code>.
          </p>
        ) : null}
        {!canPublish ? (
          <p className="mt-1 text-xs leading-5 text-[#8B949E]">
            Publishing and archiving requires <code className="font-mono">plus:content:publish</code>.
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
          description="Draft → submitted for review → approved or rejected → published. Archive instead of deleting."
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
                const sponsored = promotion.type === "SPONSORED_ADVERTISEMENT";
                const sponsorReady = !sponsored || Boolean(promotion.sponsorName && promotion.disclosureLabel);
                const starts = formatDateTime(promotion.startsAt);
                const ends = formatDateTime(promotion.endsAt);
                const canEdit =
                  canWrite && promotion.type !== "UNKNOWN" && (status === "DRAFT" || status === "REJECTED");
                const canSubmit =
                  canWrite &&
                  sponsorReady &&
                  promotion.type !== "UNKNOWN" &&
                  (status === "DRAFT" || status === "REJECTED");
                const canReview = canApprove && (status === "SUBMITTED" || status === "PENDING_REVIEW");
                const showPublish = canPublish && status === "APPROVED";
                const showArchive = canPublish && status === "PUBLISHED";
                const rejectionError = rejectionErrors[promotion.id];

                return (
                  <Fragment key={promotion.id}>
                    <li className="rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{promotion.title}</h3>
                      <StatusBadge status={promotion.status} />
                      <span className="rounded-full border border-[#30363D] bg-[#21262D] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#C9D1D9]">
                        {promotion.type === "UNKNOWN" ? "Type not reported" : TYPE_LABELS[promotion.type]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#C9D1D9]">{promotion.description}</p>
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
                        {!promotion.sponsorName || !promotion.disclosureLabel ? (
                          <p className="mt-1 font-bold text-[#F2CE72]">
                            This sponsored advertisement is missing required disclosure details. Approval and publishing
                            stay disabled until both are recorded.
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

                    {canEdit || canSubmit || canReview || showPublish || showArchive ? (
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
                        {canSubmit ? (
                          <Button
                            variant="primary"
                            onClick={() =>
                              void act(
                                promotion,
                                "submit",
                                () => plusApi.promotions.submit(promotion.id),
                                `The server accepted “${promotion.title}” for review.`
                              )
                            }
                            busy={busyKey === `submit:${promotion.id}`}
                            disabled={busyKey !== null && busyKey !== `submit:${promotion.id}`}
                          >
                            Submit for review
                          </Button>
                        ) : null}
                        {canApprove && canReview ? (
                          <>
                            <Button
                              variant="primary"
                              onClick={() =>
                                void act(
                                  promotion,
                                  "approve",
                                  () => plusApi.promotions.approve(promotion.id),
                                  `The server approved “${promotion.title}”.`
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

                    {canWrite && promotion.type === "UNKNOWN" && (status === "DRAFT" || status === "REJECTED") ? (
                      <p className="mt-2 text-xs leading-5 text-[#F2CE72]">
                        The server did not report this promotion&apos;s type, so it cannot be edited safely here.
                      </p>
                    ) : null}

                    {!canEdit && !canSubmit && !canReview && !showPublish && !showArchive && status !== "ARCHIVED" ? (
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
