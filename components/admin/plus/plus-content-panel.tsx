"use client";

import { Fragment, useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, Pencil, Plus, X } from "lucide-react";
import { publicServices } from "@/lib/data/public-services";
import { plusApi, normalizeContent, type PlusContentItem } from "./plus-api";
import {
  buildContentPayload,
  isValidPlusKey,
  suggestKey,
  type PlusContentPayload
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
  countryCodesToText,
  formatDateTime,
  useResource
} from "./plus-ui";

const SERVICE_OPTIONS = publicServices.map((service) => ({ key: service.key, label: service.label }));

type ContentFormValues = {
  key: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  destination: string;
  serviceKey: string;
  language: string;
  countries: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: ContentFormValues = {
  key: "",
  title: "",
  description: "",
  imageUrl: "",
  imageAlt: "",
  destination: "",
  serviceKey: "",
  language: "en",
  countries: "",
  sortOrder: "",
  startsAt: "",
  endsAt: ""
};

function valuesFromItem(item: PlusContentItem): ContentFormValues {
  return {
    key: item.key,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl ?? "",
    imageAlt: item.imageAlt ?? "",
    destination: item.href ?? "",
    serviceKey: item.serviceKey ?? "",
    language: item.language ?? "en",
    countries: item.countries.join(", "),
    sortOrder: item.sortOrder === null ? "" : String(item.sortOrder),
    startsAt: toDateTimeLocalValue(item.startsAt),
    endsAt: toDateTimeLocalValue(item.endsAt)
  };
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseCountries(value: string): { codes: string[]; invalid: string[] } {
  const entries = value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  const codes: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    if (/^[A-Z]{2}$/.test(entry)) {
      if (!codes.includes(entry)) codes.push(entry);
    } else {
      invalid.push(entry);
    }
  }
  return { codes, invalid };
}

function isSafeDestination(value: string): boolean {
  return value.startsWith("/") || value.startsWith("https://");
}

function validateContent(values: ContentFormValues): {
  errors: Record<string, string>;
  input: PlusContentPayload | null;
} {
  const errors: Record<string, string> = {};
  const key = values.key.trim().toLowerCase();
  const title = values.title.trim();
  const description = values.description.trim();
  const imageUrl = values.imageUrl.trim();
  const imageAlt = values.imageAlt.trim();
  const destination = values.destination.trim();
  const language = values.language.trim();
  const { codes, invalid } = parseCountries(values.countries);

  if (!key) errors.key = "Enter a stable key for this card.";
  else if (!isValidPlusKey(key)) {
    errors.key = "Use 3-80 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.";
  }

  if (!title) errors.title = "Enter a card title.";
  else if (title.length > 120) errors.title = "Keep the title to 120 characters or fewer.";

  if (!description) errors.description = "Describe what the card shows.";
  else if (description.length > 600) errors.description = "Keep the description to 600 characters or fewer.";

  if (!imageUrl) errors.imageUrl = "Enter an image URL or project path.";
  else if (!imageUrl.startsWith("/") && !imageUrl.startsWith("https://")) {
    errors.imageUrl = "Use a site path starting with / or an https:// URL.";
  }

  if (!imageAlt) errors.imageAlt = "Describe the image for screen-reader users.";
  else if (imageAlt.length > 240) errors.imageAlt = "Keep the alternative text to 240 characters or fewer.";

  if (!destination) errors.destination = "Enter where the card links.";
  else if (!isSafeDestination(destination)) {
    errors.destination = "Use a site path starting with / or an https:// URL.";
  }

  if (!values.serviceKey) errors.serviceKey = "Choose the service this card belongs to.";
  else if (!SERVICE_OPTIONS.some((service) => service.key === values.serviceKey)) {
    errors.serviceKey = "Choose a service from the published service directory.";
  }

  if (!language) errors.language = "Enter a language tag, for example en or en-NG.";
  else if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) {
    errors.language = "Use a BCP-47 language tag such as en, en-NG or fr.";
  }

  if (invalid.length > 0) {
    errors.countries = `Use two-letter ISO country codes. Not valid: ${invalid.join(", ")}.`;
  }

  const sortOrder = values.sortOrder.trim();
  if (sortOrder && !/^\d{1,6}$/.test(sortOrder)) {
    errors.sortOrder = "Use a whole number between 0 and 999999, or leave it blank.";
  }

  const startsAt = fromDateTimeLocalValue(values.startsAt);
  const endsAt = fromDateTimeLocalValue(values.endsAt);
  if (values.startsAt && !startsAt) errors.startsAt = "Enter a valid start date and time.";
  if (values.endsAt && !endsAt) errors.endsAt = "Enter a valid end date and time.";
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    errors.endsAt = "The end must be after the start.";
  }

  if (Object.keys(errors).length > 0) return { errors, input: null };

  return {
    errors,
    input: buildContentPayload({
      key,
      title,
      description,
      imageUrl,
      imageAlt,
      destination,
      serviceKey: values.serviceKey,
      language,
      countries: codes,
      startsAt,
      endsAt,
      ...(sortOrder ? { sortOrder: Number(sortOrder) } : {})
    })
  };
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function countCharacters(value: number): string {
  return `${value} ${value === 1 ? "character" : "characters"}`;
}

function ContentForm({
  heading,
  initial,
  isEdit = false,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel
}: {
  heading: string;
  initial: ContentFormValues;
  isEdit?: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: PlusContentPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<ContentFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [keyTouched, setKeyTouched] = useState(isEdit);

  useEffect(() => {
    setPreviewFailed(false);
  }, [values.imageUrl]);

  function update<K extends keyof ContentFormValues>(key: K, value: ContentFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  /** Auto-suggest the key from the title until the operator edits the key. */
  function updateTitle(title: string) {
    setValues((previous) => ({
      ...previous,
      title,
      ...(!isEdit && !keyTouched ? { key: suggestKey("card", title) } : {})
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { errors: nextErrors, input } = validateContent(values);
    setErrors(nextErrors);
    setServerError(null);
    if (!input) return;

    setPending(true);
    try {
      await onSubmit(input);
    } catch (error) {
      setServerError(error);
    } finally {
      setPending(false);
    }
  }

  const previewUrl = values.imageUrl.trim();
  const previewAlt = values.imageAlt.trim();

  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-[#30363D] bg-[#0B0E14]/70 p-3 sm:p-4"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${id}-heading`} className="font-display text-base font-extrabold text-[#F0F6FC]">
          {heading}
        </h3>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} aria-label="Close the card form">
          <X className="h-4 w-4" aria-hidden="true" />
          Close
        </Button>
      </div>

      {serverError ? <ErrorBlock title="The server rejected the save" error={serverError} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-key`}
          label="Key"
          required
          error={errors.key}
          hint={
            isEdit
              ? "The key is immutable once the card is created."
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
              placeholder="card-ramadan-deals"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""} ${
                isEdit ? "opacity-70" : ""
              }`}
            />
          )}
        </Field>

        <Field id={`${id}-title`} label="Title" required error={errors.title} hint={countCharacters(values.title.length)}>
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

        <Field
          id={`${id}-service`}
          label="Service"
          required
          error={errors.serviceKey}
          hint="The card points at one canonical service."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <select
              id={fieldId}
              value={values.serviceKey}
              onChange={(event) => update("serviceKey", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            >
              <option value="">Select a service</option>
              {SERVICE_OPTIONS.map((service) => (
                <option key={service.key} value={service.key}>
                  {service.label} ({service.key})
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field
            id={`${id}-description`}
            label="Description"
            required
            error={errors.description}
            hint="Real copy only. This is shown to customers when the card is published."
          >
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

        <Field
          id={`${id}-image-url`}
          label="Image URL"
          required
          error={errors.imageUrl}
          hint="An approved project path or an https:// URL. Never a temporary provider link."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.imageUrl}
              onChange={(event) => update("imageUrl", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              placeholder="/generated/shop/hero-mobile.webp"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-image-alt`}
          label="Image alternative text"
          required
          error={errors.imageAlt}
          hint="Describe the picture for people who cannot see it."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.imageAlt}
              onChange={(event) => update("imageAlt", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={260}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <div className="rounded-xl border border-[#30363D] bg-[#161B22] p-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#8B949E]">Preview</p>
            {previewUrl ? (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="h-24 w-full overflow-hidden rounded-lg border border-[#30363D] bg-[#0B0E14] sm:w-40">
                  {previewFailed ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[#8B949E]">
                      <ImageOff className="h-4 w-4" aria-hidden="true" />
                      <span className="text-[10px] leading-4">Preview could not load this URL.</span>
                    </div>
                  ) : (
                    // Arbitrary admin-entered URLs cannot be allow-listed for
                    // next/image, so this preview is a plain image element.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={previewAlt}
                      loading="lazy"
                      onError={() => setPreviewFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 text-xs leading-5 text-[#8B949E]">
                  <p className="font-bold text-[#C9D1D9]">Alternative text</p>
                  <p className="break-words">{previewAlt || "Not set yet."}</p>
                  {!previewAlt ? (
                    <p className="mt-1 font-bold text-[#F2CE72]">The card cannot be published accessibly without it.</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#8B949E]">Enter an image URL to preview it here.</p>
            )}
          </div>
        </div>

        <Field
          id={`${id}-destination`}
          label="Destination"
          required
          error={errors.destination}
          hint="Where the card opens. Sent to the server as `href`: a site path such as /naijashop or a full https:// page."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.destination}
              onChange={(event) => update("destination", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              placeholder="/naijashop"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-language`}
          label="Language"
          required
          error={errors.language}
          hint="BCP-47 tag, for example en or en-NG."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.language}
              onChange={(event) => update("language", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={35}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-countries`}
          label="Countries"
          hint="Two-letter ISO codes separated by commas. Leave blank when the card is not country-specific."
          error={errors.countries}
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.countries}
              onChange={(event) => update("countries", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              placeholder="NG, GH"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-sort-order`}
          label="Sort order"
          error={errors.sortOrder}
          hint="Optional. Leave blank and the server assigns the next position; the returned order is shown in the register."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.sortOrder}
              onChange={(event) => update("sortOrder", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              inputMode="numeric"
              placeholder="Next position"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

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

function ContentCard({
  item,
  canWrite,
  canPublish,
  busyKey,
  onEdit,
  onPublish,
  onArchive,
  onMove,
  index,
  total
}: {
  item: PlusContentItem;
  canWrite: boolean;
  canPublish: boolean;
  busyKey: string | null;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onMove: (direction: -1 | 1) => void;
  index: number;
  total: number;
}) {
  const serviceLabel =
    SERVICE_OPTIONS.find((service) => service.key === item.serviceKey)?.label ?? item.serviceKey ?? "Service not recorded";
  const starts = formatDateTime(item.startsAt);
  const ends = formatDateTime(item.endsAt);
  const schedule =
    starts || ends ? `${starts ?? "No start recorded"} → ${ends ?? "No end recorded"}` : "No schedule recorded";
  const publishBusy = busyKey === `publish:${item.id}`;
  const archiveBusy = busyKey === `archive:${item.id}`;
  const moveBusy = busyKey === `move:${item.id}`;
  const publishReady = Boolean(item.imageUrl && item.imageAlt && item.href);

  return (
    <li className="rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="h-20 w-full shrink-0 overflow-hidden rounded-lg border border-[#30363D] bg-[#161B22] sm:h-16 sm:w-24">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.imageAlt ?? ""} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#8B949E]">
              <ImageOff className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[#F0F6FC]">{item.title}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="font-mono text-[11px] text-[#8B949E]">{item.key || "Key not reported"}</p>
          <p className="text-sm leading-6 text-[#C9D1D9]">{item.description}</p>
          <p className="text-xs text-[#8B949E]">
            {serviceLabel} · {item.language ?? "Language not recorded"} · order {item.sortOrder ?? "not set"}
          </p>
          <p className="text-xs text-[#8B949E]">{countryCodesToText(item.countries)}</p>
          <p className="text-xs text-[#8B949E]">{schedule}</p>
          {item.href ? (
            <p className="break-all font-mono text-[11px] text-[#C9D1D9]">
              {isSafeDestination(item.href) ? (
                <a
                  href={item.href}
                  target={item.href.startsWith("https://") ? "_blank" : undefined}
                  rel={item.href.startsWith("https://") ? "noreferrer noopener" : undefined}
                  className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-[#00E676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
                >
                  {item.href}
                  {item.href.startsWith("https://") ? <ExternalLink className="h-3 w-3" aria-hidden="true" /> : null}
                  <span className="sr-only"> (opens the destination)</span>
                </a>
              ) : (
                item.href
              )}
            </p>
          ) : (
            <p className="text-xs font-bold text-[#F2CE72]">Destination not recorded</p>
          )}
          {!item.imageAlt ? (
            <p className="text-xs font-bold text-[#F2CE72]">Image alternative text is missing.</p>
          ) : null}
          {!item.imageUrl ? (
            <p className="text-xs font-bold text-[#F2CE72]">No image is recorded for this card.</p>
          ) : null}
          {!publishReady ? (
            <p className="text-xs leading-5 text-[#8B949E]">
              Publishing stays disabled until an image, its alternative text and a destination are recorded.
            </p>
          ) : null}
        </div>
      </div>

      {canWrite || canPublish ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canWrite ? (
            <Button variant="secondary" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          {canWrite ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onMove(-1)}
                disabled={index === 0 || moveBusy || busyKey !== null}
                aria-label={`Move ${item.title} earlier`}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                Move up
              </Button>
              <Button
                variant="ghost"
                onClick={() => onMove(1)}
                disabled={index === total - 1 || moveBusy || busyKey !== null}
                aria-label={`Move ${item.title} later`}
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                Move down
              </Button>
            </>
          ) : null}
          {canPublish && item.status !== "PUBLISHED" ? (
            <Button
              variant="primary"
              onClick={onPublish}
              busy={publishBusy}
              disabled={!publishReady || (busyKey !== null && !publishBusy)}
            >
              Publish
            </Button>
          ) : null}
          {canPublish && item.status !== "ARCHIVED" ? (
            <Button variant="secondary" onClick={onArchive} busy={archiveBusy} disabled={busyKey !== null && !archiveBusy}>
              Archive
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function createdCard(payload: unknown): PlusContentItem | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  return normalizeContent(payload as Record<string, unknown>);
}

export function PlusContentPanel({ canWrite, canPublish }: { canWrite: boolean; canPublish: boolean }) {
  const load = useCallback(() => plusApi.content.list(), []);
  const resource = useResource(load);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const items = resource.data ?? [];

  async function create(input: PlusContentPayload) {
    const result = await plusApi.content.create(input);
    const created = createdCard(result.payload);
    setCreating(false);
    setEditingId(null);
    setActionError(null);
    const order =
      created && created.sortOrder !== null
        ? ` The server returned sort order ${created.sortOrder}.`
        : " The server did not report a sort order.";
    setNotice(result.message ?? `The server created “${created?.title ?? input.title}”.${order}`);
    await resource.reload();
  }

  async function update(id: string, input: PlusContentPayload) {
    const result = await plusApi.content.update(id, input);
    setEditingId(null);
    setActionError(null);
    setNotice(result.message ?? "The server accepted the card changes.");
    await resource.reload();
  }

  async function transition(item: PlusContentItem, action: "publish" | "archive") {
    setBusyKey(`${action}:${item.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const result = action === "publish" ? await plusApi.content.publish(item.id) : await plusApi.content.archive(item.id);
      setNotice(result.message ?? `The server accepted the ${action} request for “${item.title}”.`);
      await resource.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyKey(null);
    }
  }

  async function move(item: PlusContentItem, direction: -1 | 1) {
    const ids = items.map((entry) => entry.id);
    const index = ids.indexOf(item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;

    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];

    setBusyKey(`move:${item.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const result = await plusApi.content.reorder(next);
      setNotice(result.message ?? "The server accepted the new card order.");
      await resource.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Service-awareness cards"
          description="Published cards help customers discover a real service. They are not membership benefits."
          actions={
            canWrite && !creating ? (
              <Button
                variant="primary"
                onClick={() => {
                  setCreating(true);
                  setEditingId(null);
                  setActionError(null);
                  setNotice(null);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New card
              </Button>
            ) : null
          }
        />
        {!canWrite ? (
          <div className="mt-3">
            <ReadOnlyNote>
              Creating, editing and reordering service-awareness cards requires{" "}
              <code className="font-mono">plus:content:write</code>. Publishing and archiving require{" "}
              <code className="font-mono">plus:content:publish</code>.
            </ReadOnlyNote>
          </div>
        ) : null}
        {!canPublish ? (
          <p className="mt-2 text-xs leading-5 text-[#8B949E]">
            Publishing and archiving require <code className="font-mono">plus:content:publish</code>. Drafts remain
            drafts in this view.
          </p>
        ) : null}
        {notice ? (
          <div className="mt-3">
            <Notice tone="success" title="Server response">
              {notice}
            </Notice>
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-3">
            <ErrorBlock title="The server rejected the action" error={actionError} />
          </div>
        ) : null}
      </Panel>

      {creating ? (
        <Panel>
          <ContentForm
            heading="New service-awareness card"
            initial={EMPTY_FORM}
            submitLabel="Create draft"
            pendingLabel="Creating…"
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="All cards"
          description="Draft, published and archived cards, in the order the server returns. Reorder uses the full list."
        />
        <div className="mt-4">
          {resource.phase === "loading" && !resource.data ? <LoadingBlock label="Loading service-awareness cards…" /> : null}
          {resource.phase === "error" && !resource.data ? (
            <ErrorBlock
              title="Could not load service-awareness cards"
              error={resource.error}
              onRetry={resource.reload}
              permissionHint="Reading Plus+ content requires the plus:content:read permission."
            />
          ) : null}
          {resource.data && resource.data.length === 0 ? (
            <EmptyBlock
              title="No service-awareness cards"
              action={
                canWrite && !creating ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create the first card
                  </Button>
                ) : null
              }
            >
              The server returned no cards. Nothing is pre-filled or seeded from this screen.
            </EmptyBlock>
          ) : null}
          {resource.data && resource.data.length > 0 ? (
            <ul className="space-y-3">
              {items.map((item, index) => (
                <Fragment key={item.id}>
                  <ContentCard
                    item={item}
                    canWrite={canWrite}
                    canPublish={canPublish}
                    busyKey={busyKey}
                    index={index}
                    total={items.length}
                    onEdit={() => {
                      setEditingId(item.id);
                      setCreating(false);
                      setActionError(null);
                      setNotice(null);
                    }}
                    onPublish={() => void transition(item, "publish")}
                    onArchive={() => void transition(item, "archive")}
                    onMove={(direction) => void move(item, direction)}
                  />
                  {editingId === item.id ? (
                    <li>
                      <ContentForm
                        heading={`Edit “${item.title}”`}
                        initial={valuesFromItem(item)}
                        isEdit
                        submitLabel="Save changes"
                        pendingLabel="Saving…"
                        onSubmit={(input) => update(item.id, input)}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : null}
                </Fragment>
              ))}
            </ul>
          ) : null}
          {resource.phase === "error" && resource.data ? (
            <div className="mt-3">
              <ErrorBlock title="Could not refresh the card list" error={resource.error} onRetry={resource.reload} />
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
