"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { plusApi, type PlusMutationResult, type PlusOverview, type PlusPlan, type PlusPlanTerm } from "./plus-api";
import {
  BILLING_PERIODS,
  buildPaidActivationPayload,
  buildPlanPayload,
  buildPlanPricingPayload,
  buildPlanTermPayload,
  buildCountryPayload,
  isValidPlanCode,
  suggestPlanCode,
  type BillingPeriod,
  type PlusPlanPayload,
  type PlusPlanTermPayload
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
  describeError,
  formatDateTime,
  formatMinorUnits,
  useResource
} from "./plus-ui";

type Feedback =
  | { kind: "success"; message: string; action: string }
  | { kind: "error"; error: unknown; action: string };

type PendingKey = string | null;

const DISABLED_SENTENCE =
  "Paid activation remains disabled until pricing, billing rules and customer terms are approved.";

function parseMinorUnits(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isPricedPlan(plan: PlusPlan): boolean {
  if (plan.priceMinor === null || !/^\d+$/.test(plan.priceMinor)) return false;
  try {
    return BigInt(plan.priceMinor) > BigInt(0);
  } catch {
    return false;
  }
}

function hasEffectiveApprovedTerm(plan: PlusPlan): boolean {
  const now = Date.now();
  return plan.terms.some((term) => {
    if (!term.approvedAt || !term.effectiveFrom) return false;
    const from = new Date(term.effectiveFrom).getTime();
    if (Number.isNaN(from) || from > now) return false;
    if (!term.effectiveTo) return true;
    const to = new Date(term.effectiveTo).getTime();
    return !Number.isNaN(to) && to > now;
  });
}

function isBillingPeriod(value: string | null): value is BillingPeriod {
  return value !== null && (BILLING_PERIODS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Plan creation                                                       */
/* ------------------------------------------------------------------ */

type PlanFormValues = {
  code: string;
  name: string;
  description: string;
  priceMinor: string;
  currency: string;
  billingPeriod: "" | BillingPeriod;
};

const EMPTY_PLAN_FORM: PlanFormValues = {
  code: "",
  name: "",
  description: "",
  priceMinor: "",
  currency: "NGN",
  billingPeriod: ""
};

function PlanCreateForm({
  onCreate,
  onCancel
}: {
  onCreate: (input: PlusPlanPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<PlanFormValues>(EMPTY_PLAN_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);

  function update<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function updateName(name: string) {
    setValues((previous) => ({
      ...previous,
      name,
      ...(codeTouched ? {} : { code: suggestPlanCode(name) })
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const code = values.code.trim().toLowerCase();
    const name = values.name.trim();
    const description = values.description.trim();
    const priceMinor = parseMinorUnits(values.priceMinor);
    const currency = values.currency.trim().toUpperCase();

    if (!code) nextErrors.code = "Enter a stable plan code.";
    else if (!isValidPlanCode(code)) {
      nextErrors.code = "Use 3-50 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.";
    }
    if (!name) nextErrors.name = "Enter a plan name.";
    else if (name.length > 120) nextErrors.name = "Keep the name to 120 characters or fewer.";
    if (!description) nextErrors.description = "Describe the plan for the Control Center.";
    else if (description.length > 2000) nextErrors.description = "Keep the description to 2000 characters or fewer.";
    if (!values.priceMinor.trim()) nextErrors.priceMinor = "Enter the price as an integer minor-unit amount.";
    else if (priceMinor === null) nextErrors.priceMinor = "Use whole digits only, up to 15 digits.";
    if (!currency) nextErrors.currency = "Enter the ISO currency code.";
    else if (!/^[A-Za-z]{3}$/.test(currency)) nextErrors.currency = "Use a three-letter ISO currency code.";
    if (!values.billingPeriod) nextErrors.billingPeriod = "Choose a billing period.";

    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0 || priceMinor === null || !values.billingPeriod) return;

    setPending(true);
    try {
      await onCreate(
        buildPlanPayload({
          code,
          name,
          description,
          priceMinor,
          currency,
          billingPeriod: values.billingPeriod
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
      <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">New plan</h3>
      {serverError ? <ErrorBlock title="The server rejected the plan" error={serverError} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-code`}
          label="Plan code"
          required
          error={errors.code}
          hint="Auto-suggested from the name. Immutable after creation and used by the public availability reader."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.code}
              onChange={(event) => {
                setCodeTouched(true);
                update("code", event.target.value);
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              placeholder="plan-plus-monthly"
              maxLength={50}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field id={`${id}-name`} label="Plan name" required error={errors.name} hint="The internal name shown to staff.">
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.name}
              onChange={(event) => updateName(event.target.value)}
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
            id={`${id}-description`}
            label="Description"
            required
            error={errors.description}
            hint="Required by the server. This is internal configuration, not customer copy."
          >
            {({ id: fieldId, describedBy, invalid }) => (
              <textarea
                id={fieldId}
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                aria-required
                rows={2}
                maxLength={2000}
                className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
              />
            )}
          </Field>
        </div>

        <Field
          id={`${id}-price`}
          label="Price"
          required
          error={errors.priceMinor}
          hint="Integer minor units. No decimal point and no rounding. Use 0 for a free plan."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.priceMinor}
              onChange={(event) => update("priceMinor", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              inputMode="numeric"
              placeholder="0"
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field id={`${id}-currency`} label="Currency" required error={errors.currency} hint="ISO 4217 code, for example NGN.">
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.currency}
              onChange={(event) => update("currency", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={3}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-period`}
          label="Billing period"
          required
          error={errors.billingPeriod}
          hint="The server accepts MONTHLY, ANNUAL or NONE."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <select
              id={fieldId}
              value={values.billingPeriod}
              onChange={(event) => update("billingPeriod", event.target.value as "" | BillingPeriod)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            >
              <option value="">Select a billing period</option>
              {BILLING_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          {pending ? "Creating…" : "Create draft plan"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Terms                                                               */
/* ------------------------------------------------------------------ */

function TermRow({
  plan,
  term,
  canConfigure,
  pending,
  onApprove
}: {
  plan: PlusPlan;
  term: PlusPlanTerm;
  canConfigure: boolean;
  pending: PendingKey;
  onApprove: () => void;
}) {
  const from = formatDateTime(term.effectiveFrom);
  const to = formatDateTime(term.effectiveTo);
  const approved = formatDateTime(term.approvedAt);
  const version = term.version === null ? "Version not reported" : `v${term.version}`;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#21262D] bg-[#161B22] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#F0F6FC]">{version}</p>
        <p className="text-xs leading-5 text-[#8B949E]">
          {from ? `Effective from ${from}` : "Effective date not recorded"}
          {to ? ` to ${to}` : ""}
          {term.billingPeriod ? ` · ${term.billingPeriod}` : ""}
          {term.priceMinor !== null ? ` · ${formatMinorUnits(term.priceMinor, term.currency)}` : ""}
          {approved ? ` · Approved ${approved}` : ""}
        </p>
        {term.cancellationSummary ? (
          <p className="mt-1 text-xs leading-5 text-[#C9D1D9]">{term.cancellationSummary}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={term.status} />
        {canConfigure && !term.approvedAt ? (
          <Button
            variant="secondary"
            onClick={onApprove}
            busy={pending === `term:${plan.id}:${term.id}`}
            disabled={pending !== null && pending !== `term:${plan.id}:${term.id}`}
            aria-label={`Approve term ${term.version ?? term.id}`}
          >
            Approve term
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Plan card                                                           */
/* ------------------------------------------------------------------ */

function PlanCard({
  plan,
  canConfigure,
  onChanged
}: {
  plan: PlusPlan;
  canConfigure: boolean;
  onChanged: () => Promise<void>;
}) {
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<PendingKey>(null);
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [countryError, setCountryError] = useState("");
  const [termValues, setTermValues] = useState({
    version: "",
    effectiveFrom: "",
    effectiveTo: "",
    billingPeriod: (isBillingPeriod(plan.billingPeriod) ? plan.billingPeriod : "") as "" | BillingPeriod,
    cancellationSummary: ""
  });
  const [termErrors, setTermErrors] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState({
    priceMinor: plan.priceMinor ?? "",
    currency: plan.currency ?? "",
    billingPeriod: (isBillingPeriod(plan.billingPeriod) ? plan.billingPeriod : "") as "" | BillingPeriod
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const priced = isPricedPlan(plan);
  const paidApproved = plan.paidActivationApproved === true;
  const retired = plan.status === "RETIRED";
  const editable = canConfigure && !retired;
  const canRequestActivation = canConfigure && plan.status === "DRAFT";
  const approvalBlocksActivation = canRequestActivation && priced && !paidApproved;
  const approvedTermAvailable = hasEffectiveApprovedTerm(plan);
  const activationError = feedback?.kind === "error" ? describeError(feedback.error) : null;
  const activationRefused =
    feedback?.kind === "error" &&
    feedback.action === "activate" &&
    activationError?.code === "paid_activation_not_approved";

  async function run(key: string, action: () => Promise<PlusMutationResult>, successMessage: string): Promise<boolean> {
    const actionName = key.split(":")[0];
    setPending(key);
    setFeedback(null);
    try {
      const result = await action();
      setFeedback({ kind: "success", message: result.message ?? successMessage, action: actionName });
      await onChanged();
      return true;
    } catch (error) {
      setFeedback({ kind: "error", error, action: actionName });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function submitCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryError("Use a two-letter ISO country code, for example NG.");
      return;
    }
    setCountryError("");
    const ok = await run(
      `country-add:${plan.id}`,
      () => plusApi.plans.addCountry(plan.id, buildCountryPayload(code, true)),
      `The server accepted country ${code} for this plan.`
    );
    if (ok) setCountryCode("");
  }

  async function toggleCountry(country: { code: string; enabled: boolean | null }) {
    if (country.enabled === null) return;
    const next = !country.enabled;
    await run(
      `country-toggle:${plan.id}:${country.code}`,
      () => plusApi.plans.addCountry(plan.id, buildCountryPayload(country.code, next)),
      `The server accepted the country change for ${country.code}.`
    );
  }

  async function submitTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const versionText = termValues.version.trim();
    const version = /^\d{1,7}$/.test(versionText) ? Number(versionText) : Number.NaN;
    if (!versionText) nextErrors.version = "Enter a positive integer version.";
    else if (!Number.isInteger(version) || version < 1 || version > 1_000_000) {
      nextErrors.version = "Use a positive integer between 1 and 1000000.";
    }
    if (!termValues.effectiveFrom) nextErrors.effectiveFrom = "Enter the effective-from date.";
    if (termValues.effectiveTo && termValues.effectiveFrom) {
      const from = new Date(termValues.effectiveFrom).getTime();
      const to = new Date(termValues.effectiveTo).getTime();
      if (Number.isFinite(from) && Number.isFinite(to) && to <= from) {
        nextErrors.effectiveTo = "The end date must be after the start date.";
      }
    }
    if (!termValues.billingPeriod) nextErrors.billingPeriod = "Choose the billing period for this term.";

    setTermErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !termValues.billingPeriod) return;

    let payload: PlusPlanTermPayload;
    try {
      payload = buildPlanTermPayload({
        version,
        effectiveFrom: termValues.effectiveFrom,
        effectiveTo: termValues.effectiveTo || null,
        billingPeriod: termValues.billingPeriod,
        cancellationSummary: termValues.cancellationSummary || null
      });
    } catch (error) {
      setTermErrors({ effectiveFrom: error instanceof Error ? error.message : "Enter a valid effective date." });
      return;
    }

    const ok = await run(
      `term-create:${plan.id}`,
      () => plusApi.plans.addTerm(plan.id, payload),
      `The server accepted term v${version}.`
    );
    if (ok) {
      setTermValues({
        version: "",
        effectiveFrom: "",
        effectiveTo: "",
        billingPeriod: termValues.billingPeriod,
        cancellationSummary: ""
      });
    }
  }

  async function submitPlanEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const priceMinor = parseMinorUnits(editValues.priceMinor);
    const currency = editValues.currency.trim().toUpperCase();

    if (priceMinor === null) nextErrors.priceMinor = "Use whole digits only, up to 15 digits.";
    if (!/^[A-Za-z]{3}$/.test(currency)) nextErrors.currency = "Use a three-letter ISO currency code.";
    if (!editValues.billingPeriod) nextErrors.billingPeriod = "Choose a billing period.";

    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || priceMinor === null || !editValues.billingPeriod) return;

    await run(
      `edit:${plan.id}`,
      () =>
        plusApi.plans.update(
          plan.id,
          buildPlanPricingPayload({
            priceMinor,
            currency,
            billingPeriod: editValues.billingPeriod as BillingPeriod
          })
        ),
      "The server accepted the plan price and billing changes."
    );
  }

  return (
    <li className="rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{plan.name}</h3>
            <StatusBadge status={plan.status} />
          </div>
          <p className="font-mono text-[11px] text-[#8B949E]">{plan.code ?? "Code not reported"}</p>
          <p className="mt-1 text-sm leading-6 text-[#C9D1D9]">{plan.description ?? "No description recorded."}</p>
          <p className="mt-1 text-xs leading-5 text-[#8B949E]">
            {formatMinorUnits(plan.priceMinor, plan.currency)} · {plan.billingPeriod ?? "Billing period not recorded"}
          </p>
          <p className="text-xs leading-5 text-[#8B949E]">
            {plan.status === "ACTIVE"
              ? "Active plan. Availability is calculated from active plans and enabled countries by the server."
              : plan.status === "RETIRED"
                ? "Retired plan. A retired plan cannot be reactivated; create a new approved plan."
                : "Draft plan. Not active."}
          </p>
          <p className="text-xs leading-5 text-[#8B949E]">
            {priced
              ? paidApproved
                ? "Paid activation approved for this plan."
                : "Paid activation not approved for this plan."
              : "Not priced; paid-activation approval does not apply."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {editable && priced && !paidApproved ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmingApproval(true)}
              aria-expanded={confirmingApproval}
            >
              Record paid-activation approval
            </Button>
          ) : null}
          {canRequestActivation ? (
            <Button
              variant="primary"
              onClick={() =>
                void run(`activate:${plan.id}`, () => plusApi.plans.activate(plan.id), "The server accepted the activation request.")
              }
              busy={pending === `activate:${plan.id}`}
              disabled={approvalBlocksActivation || (pending !== null && pending !== `activate:${plan.id}`)}
            >
              {pending === `activate:${plan.id}` ? "Requesting activation…" : "Request activation"}
            </Button>
          ) : null}
        </div>
      </div>

      {confirmingApproval ? (
        <div className="mt-3 rounded-xl border border-[#7A5B12] bg-[#2F2611] p-3 text-[#F2CE72]">
          <p className="text-sm font-extrabold">Record an external commercial decision?</p>
          <p className="mt-1 text-sm leading-6">
            This records that the paid-activation decision has been approved outside this workspace. It does not take a
            payment, charge a customer, create a membership or activate the plan.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() =>
                void run(
                  `approve:${plan.id}`,
                  () => plusApi.plans.approvePaidActivation(plan.id, buildPaidActivationPayload()),
                  "The server recorded paid-activation approval."
                ).then((ok) => {
                  if (ok) setConfirmingApproval(false);
                })
              }
              busy={pending === `approve:${plan.id}`}
              disabled={pending !== null && pending !== `approve:${plan.id}`}
            >
              Confirm approval
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingApproval(false)} disabled={pending !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {approvalBlocksActivation ? (
        <p className="mt-2 text-xs leading-5 text-[#F2CE72]">
          Record paid-activation approval above before requesting activation. The server refuses activation while a priced
          plan is unapproved.
        </p>
      ) : null}
      {canRequestActivation && !approvalBlocksActivation && priced && !approvedTermAvailable ? (
        <p className="mt-2 text-xs leading-5 text-[#F2CE72]">
          No approved, currently effective term is recorded. The server will refuse activation until one exists.
        </p>
      ) : null}
      {retired ? (
        <p className="mt-2 text-xs leading-5 text-[#8B949E]">
          Configuration controls are hidden because a retired plan cannot be reactivated.
        </p>
      ) : null}

      {feedback ? (
        <div className="mt-3">
          {feedback.kind === "success" ? (
            <Notice tone="success" title="Server response">
              {feedback.message}
            </Notice>
          ) : activationRefused ? (
            <Notice tone="error" title="Paid activation remains disabled">
              The server refused activation with code{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 font-mono">paid_activation_not_approved</code>:{" "}
              {activationError?.message} Nothing was activated.
            </Notice>
          ) : (
            <ErrorBlock title="The server rejected the request" error={feedback.error} />
          )}
        </div>
      ) : null}

      {!canConfigure ? (
        <p className="mt-3 text-xs leading-5 text-[#8B949E]">
          Changing plans, countries, terms or activation requires <code className="font-mono">plus:membership:configure</code>.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-3">
          <h4 className="text-sm font-extrabold text-[#F0F6FC]">Countries</h4>
          {plan.countries.length === 0 ? (
            <p className="mt-1 text-xs leading-5 text-[#8B949E]">No countries are enabled for this plan.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {plan.countries.map((country) => (
                <li
                  key={country.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#21262D] bg-[#0B0E14] px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[#C9D1D9]">
                      {country.code}
                      {country.name !== country.code ? ` · ${country.name}` : ""}
                    </p>
                    <p className={country.enabled === true ? "font-bold text-[#7EE2A8]" : "font-bold text-[#F2CE72]"}>
                      {country.enabled === true
                        ? "Enabled for this plan"
                        : country.enabled === false
                          ? "Disabled — not eligible"
                          : "Enablement state not reported"}
                    </p>
                  </div>
                  {editable && country.enabled !== null ? (
                    <Button
                      variant="ghost"
                      onClick={() => void toggleCountry(country)}
                      busy={pending === `country-toggle:${plan.id}:${country.code}`}
                      disabled={pending !== null && pending !== `country-toggle:${plan.id}:${country.code}`}
                      aria-label={`${country.enabled ? "Disable" : "Enable"} ${country.code} for ${plan.name}`}
                    >
                      {country.enabled ? "Disable" : "Enable"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {editable ? (
            <form onSubmit={submitCountry} className="mt-3 space-y-2">
              <Field
                id={`${id}-country`}
                label="Add or enable a country"
                error={countryError}
                hint="ISO 3166-1 alpha-2 code. The request always sets enabled: true; use the toggle above to disable."
              >
                {({ id: fieldId, describedBy, invalid }) => (
                  <input
                    id={fieldId}
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    placeholder="NG"
                    maxLength={2}
                    className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                  />
                )}
              </Field>
              <Button type="submit" variant="secondary" busy={pending === `country-add:${plan.id}`} disabled={!countryCode.trim()}>
                Add country
              </Button>
            </form>
          ) : null}
        </div>

        <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-3">
          <h4 className="text-sm font-extrabold text-[#F0F6FC]">Customer terms</h4>
          {plan.terms.length === 0 ? (
            <p className="mt-1 text-xs leading-5 text-[#8B949E]">No term versions are recorded for this plan.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {plan.terms.map((term) => (
                <TermRow
                  key={term.id}
                  plan={plan}
                  term={term}
                  canConfigure={editable}
                  pending={pending}
                  onApprove={() =>
                    void run(
                      `term:${plan.id}:${term.id}`,
                      () => plusApi.plans.approveTerm(plan.id, term.id),
                      "The server accepted the term approval."
                    )
                  }
                />
              ))}
            </ul>
          )}
          {editable ? (
            <details className="mt-3 rounded-lg border border-[#30363D] bg-[#0B0E14]/60 p-3">
              <summary className="cursor-pointer text-sm font-bold text-[#F0F6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]">
                Add a term version
              </summary>
              <form onSubmit={submitTerm} className="mt-3 space-y-2">
                <Field
                  id={`${id}-term-version`}
                  label="Version"
                  required
                  error={termErrors.version}
                  hint="A positive integer. The server stores it as an integer version."
                >
                  {({ id: fieldId, describedBy, invalid }) => (
                    <input
                      id={fieldId}
                      value={termValues.version}
                      onChange={(event) => setTermValues((previous) => ({ ...previous, version: event.target.value }))}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      aria-required
                      inputMode="numeric"
                      placeholder="1"
                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                    />
                  )}
                </Field>
                <Field
                  id={`${id}-term-effective-from`}
                  label="Effective from"
                  required
                  error={termErrors.effectiveFrom}
                  hint="The date the approved term becomes effective."
                >
                  {({ id: fieldId, describedBy, invalid }) => (
                    <input
                      id={fieldId}
                      type="date"
                      value={termValues.effectiveFrom}
                      onChange={(event) => setTermValues((previous) => ({ ...previous, effectiveFrom: event.target.value }))}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      aria-required
                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                    />
                  )}
                </Field>
                <Field
                  id={`${id}-term-effective-to`}
                  label="Effective to"
                  error={termErrors.effectiveTo}
                  hint="Optional end date. Leave blank for open-ended terms."
                >
                  {({ id: fieldId, describedBy, invalid }) => (
                    <input
                      id={fieldId}
                      type="date"
                      value={termValues.effectiveTo}
                      onChange={(event) => setTermValues((previous) => ({ ...previous, effectiveTo: event.target.value }))}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                    />
                  )}
                </Field>
                <Field
                  id={`${id}-term-period`}
                  label="Billing period"
                  required
                  error={termErrors.billingPeriod}
                  hint="Defaults to the plan's period when one is recorded."
                >
                  {({ id: fieldId, describedBy, invalid }) => (
                    <select
                      id={fieldId}
                      value={termValues.billingPeriod}
                      onChange={(event) =>
                        setTermValues((previous) => ({
                          ...previous,
                          billingPeriod: event.target.value as "" | BillingPeriod
                        }))
                      }
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      aria-required
                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                    >
                      <option value="">Select a billing period</option>
                      {BILLING_PERIODS.map((period) => (
                        <option key={period} value={period}>
                          {period}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field
                  id={`${id}-term-cancellation`}
                  label="Cancellation summary"
                  hint="Optional. State the cancellation rule this term version approves."
                >
                  {({ id: fieldId, describedBy }) => (
                    <textarea
                      id={fieldId}
                      value={termValues.cancellationSummary}
                      onChange={(event) =>
                        setTermValues((previous) => ({ ...previous, cancellationSummary: event.target.value }))
                      }
                      aria-describedby={describedBy}
                      rows={2}
                      maxLength={2000}
                      className={FIELD_CONTROL_CLASS}
                    />
                  )}
                </Field>
                <Button type="submit" variant="secondary" busy={pending === `term-create:${plan.id}`} disabled={!termValues.version.trim()}>
                  Add term
                </Button>
              </form>
            </details>
          ) : null}
        </div>
      </div>

      {editable ? (
        <details className="mt-3 rounded-lg border border-[#30363D] bg-[#161B22] p-3">
          <summary className="cursor-pointer text-sm font-bold text-[#F0F6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]">
            Edit price and billing
          </summary>
          <form onSubmit={submitPlanEdit} className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field id={`${id}-edit-price`} label="Price (minor units)" error={editErrors.priceMinor}>
              {({ id: fieldId, describedBy, invalid }) => (
                <input
                  id={fieldId}
                  value={editValues.priceMinor}
                  onChange={(event) => setEditValues((previous) => ({ ...previous, priceMinor: event.target.value }))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  inputMode="numeric"
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                />
              )}
            </Field>
            <Field id={`${id}-edit-currency`} label="Currency" error={editErrors.currency}>
              {({ id: fieldId, describedBy, invalid }) => (
                <input
                  id={fieldId}
                  value={editValues.currency}
                  onChange={(event) => setEditValues((previous) => ({ ...previous, currency: event.target.value }))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  maxLength={3}
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                />
              )}
            </Field>
            <Field id={`${id}-edit-period`} label="Billing period" error={editErrors.billingPeriod}>
              {({ id: fieldId, describedBy, invalid }) => (
                <select
                  id={fieldId}
                  value={editValues.billingPeriod}
                  onChange={(event) =>
                    setEditValues((previous) => ({
                      ...previous,
                      billingPeriod: event.target.value as "" | BillingPeriod
                    }))
                  }
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                >
                  <option value="">Select a billing period</option>
                  {BILLING_PERIODS.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" variant="primary" busy={pending === `edit:${plan.id}`}>
                Save price and billing
              </Button>
            </div>
          </form>
        </details>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only membership records                                        */
/* ------------------------------------------------------------------ */

function MembershipTables({ overview }: { overview: PlusOverview | null }) {
  return (
    <Panel>
      <PanelHeader
        title="Memberships and entitlements"
        description="Read-only. This workspace does not create purchases, attach plans to accounts or grant entitlements."
      />
      <div className="mt-4 space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-[#F0F6FC]">Memberships</h3>
          {overview === null ? (
            <p className="mt-1 text-xs leading-5 text-[#8B949E]">
              Membership records are unavailable because the overview did not load.
            </p>
          ) : overview.memberships === null ? (
            <div className="mt-2">
              <EmptyBlock title="Membership records were not exposed">
                The overview endpoint did not include a membership list. Nothing is inferred or invented.
              </EmptyBlock>
            </div>
          ) : overview.memberships.length === 0 ? (
            <div className="mt-2">
              <EmptyBlock title="No memberships recorded">The server returned an empty membership list.</EmptyBlock>
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <caption className="sr-only">Membership records reported by the Plus+ overview</caption>
                <thead>
                  <tr className="border-b border-[#21262D] text-[10px] uppercase tracking-[0.1em] text-[#8B949E]">
                    <th scope="col" className="py-2 pr-4 font-extrabold">Member</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Plan</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Status</th>
                    <th scope="col" className="py-2 font-extrabold">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.memberships.map((row) => (
                    <tr key={row.id} className="border-b border-[#21262D]/60">
                      <td className="py-2 pr-4 text-[#F0F6FC]">{row.member ?? "Not recorded"}</td>
                      <td className="py-2 pr-4 text-[#C9D1D9]">{row.planName ?? "Not recorded"}</td>
                      <td className="py-2 pr-4"><StatusBadge status={row.status} /></td>
                      <td className="py-2 text-[#C9D1D9]">{formatDateTime(row.startedAt) ?? "Not recorded"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-extrabold text-[#F0F6FC]">Entitlements</h3>
          {overview === null ? (
            <p className="mt-1 text-xs leading-5 text-[#8B949E]">
              Entitlement records are unavailable because the overview did not load.
            </p>
          ) : overview.entitlements === null ? (
            <div className="mt-2">
              <EmptyBlock title="Entitlement records were not exposed">
                The overview endpoint did not include an entitlement list. Nothing is inferred or invented.
              </EmptyBlock>
            </div>
          ) : overview.entitlements.length === 0 ? (
            <div className="mt-2">
              <EmptyBlock title="No entitlements recorded">The server returned an empty entitlement list.</EmptyBlock>
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <caption className="sr-only">Entitlement records reported by the Plus+ overview</caption>
                <thead>
                  <tr className="border-b border-[#21262D] text-[10px] uppercase tracking-[0.1em] text-[#8B949E]">
                    <th scope="col" className="py-2 pr-4 font-extrabold">Member</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Benefit</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Plan</th>
                    <th scope="col" className="py-2 pr-4 font-extrabold">Status</th>
                    <th scope="col" className="py-2 font-extrabold">Granted</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.entitlements.map((row) => (
                    <tr key={row.id} className="border-b border-[#21262D]/60">
                      <td className="py-2 pr-4 text-[#F0F6FC]">{row.member ?? "Not recorded"}</td>
                      <td className="py-2 pr-4 text-[#C9D1D9]">{row.benefitName ?? "Not recorded"}</td>
                      <td className="py-2 pr-4 text-[#C9D1D9]">{row.planName ?? "Not recorded"}</td>
                      <td className="py-2 pr-4"><StatusBadge status={row.status} /></td>
                      <td className="py-2 text-[#C9D1D9]">{formatDateTime(row.grantedAt) ?? "Not recorded"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                            */
/* ------------------------------------------------------------------ */

export function PlusPlansPanel({
  overview,
  overviewPhase,
  overviewError,
  onRetryOverview,
  canConfigure
}: {
  overview: PlusOverview | null;
  overviewPhase: "loading" | "ready" | "error";
  overviewError: unknown;
  onRetryOverview: () => void;
  canConfigure: boolean;
}) {
  const load = useCallback(() => plusApi.plans.list(), []);
  const resource = useResource(load);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plans = resource.data ?? [];
  const activePlans = plans.filter((plan) => plan.status === "ACTIVE");
  const approvedPlans = plans.filter(
    (plan) => plan.paidActivationApproved === true && plan.status !== "RETIRED"
  );

  async function changed() {
    await resource.reload();
    onRetryOverview();
  }

  async function create(input: PlusPlanPayload) {
    const result = await plusApi.plans.create(input);
    setCreating(false);
    setNotice(result.message ?? "The server accepted the new draft plan.");
    await changed();
  }

  return (
    <div className="space-y-4">
      {resource.phase === "loading" && !resource.data ? (
        <Notice tone="info" title="Reading plan activation state">
          The current plans are being loaded from the server. No activation state is claimed until they arrive.
        </Notice>
      ) : null}
      {resource.phase === "error" && !resource.data ? null : activePlans.length > 0 ? (
        <Notice tone="success" title="At least one plan is active">
          {activePlans.length} plan{activePlans.length === 1 ? " is" : "s are"} ACTIVE. Paid activation is approved per
          plan; any additional priced plan still needs its own approval and an approved, currently effective term.
        </Notice>
      ) : approvedPlans.length > 0 ? (
        <Notice tone="info" title="Paid activation recorded for at least one plan">
          {approvedPlans.length} plan{approvedPlans.length === 1 ? " has" : "s have"} paid-activation approval recorded.
          A priced plan still needs an approved, currently effective term before the server will activate it.
        </Notice>
      ) : (
        <Notice tone="warning" title="Paid activation remains disabled">
          {DISABLED_SENTENCE} Approval is recorded per plan as an external commercial decision; it never takes a payment.
          Activation requests are sent to the server and refusals are shown verbatim.
        </Notice>
      )}

      <Panel>
        <PanelHeader
          title="Plans"
          description="Prices are stored as exact integer minor units with an explicit currency."
          actions={
            canConfigure && !creating ? (
              <Button
                variant="primary"
                onClick={() => {
                  setCreating(true);
                  setNotice(null);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New plan
              </Button>
            ) : null
          }
        />
        {!canConfigure ? (
          <div className="mt-3">
            <ReadOnlyNote>
              Creating plans, changing prices, enabling countries, creating or approving terms, recording paid-activation
              approval and requesting activation require <code className="font-mono">plus:membership:configure</code>.
            </ReadOnlyNote>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-3">
            <Notice tone="success" title="Server response">{notice}</Notice>
          </div>
        ) : null}
      </Panel>

      {creating ? (
        <Panel>
          <PlanCreateForm onCreate={create} onCancel={() => setCreating(false)} />
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Configured plans"
          description="Every plan the server returned. No plan, price, benefit or term is generated by this screen."
        />
        <div className="mt-4">
          {resource.phase === "loading" && !resource.data ? <LoadingBlock label="Loading plans…" /> : null}
          {resource.phase === "error" && !resource.data ? (
            <ErrorBlock
              title="Could not load plans"
              error={resource.error}
              onRetry={resource.reload}
              permissionHint="Reading plans requires the plus:content:read permission."
            />
          ) : null}
          {resource.data && resource.data.length === 0 ? (
            <EmptyBlock
              title="No plans configured"
              action={
                canConfigure && !creating ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create the first plan
                  </Button>
                ) : null
              }
            >
              The server returned no Plus+ plans. No price, billing period or country eligibility exists to publish.
            </EmptyBlock>
          ) : null}
          {resource.data && resource.data.length > 0 ? (
            <ul className="space-y-3">
              {resource.data.map((plan) => (
                <PlanCard key={plan.id} plan={plan} canConfigure={canConfigure} onChanged={changed} />
              ))}
            </ul>
          ) : null}
          {resource.phase === "error" && resource.data ? (
            <div className="mt-3">
              <ErrorBlock title="Could not refresh the plan list" error={resource.error} onRetry={resource.reload} />
            </div>
          ) : null}
        </div>
      </Panel>

      {overviewPhase === "error" ? (
        <ErrorBlock title="Could not refresh the overview" error={overviewError} onRetry={onRetryOverview} />
      ) : null}

      <MembershipTables overview={overview} />
    </div>
  );
}
