"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  plusApi,
  type PlusMutationResult,
  type PlusOverview,
  type PlusPlan,
  type PlusPlanTerm
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
  describeError,
  formatDateTime,
  formatMinorUnits,
  useResource
} from "./plus-ui";

type Feedback =
  | { kind: "success"; message: string; action: string }
  | { kind: "error"; error: unknown; action: string };

type PendingKey = string | null;

const APPROVAL_SENTENCE = "Paid activation remains disabled until pricing, billing rules and customer terms are approved.";

/* ------------------------------------------------------------------ */
/* Plan creation                                                       */
/* ------------------------------------------------------------------ */

type PlanFormValues = {
  name: string;
  description: string;
  priceMinor: string;
  currency: string;
  billingPeriod: string;
};

const EMPTY_PLAN_FORM: PlanFormValues = {
  name: "",
  description: "",
  priceMinor: "",
  currency: "NGN",
  billingPeriod: ""
};

function parsePlanPrice(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function PlanCreateForm({
  onCreate,
  onCancel
}: {
  onCreate: (input: {
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    billingPeriod: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<PlanFormValues>(EMPTY_PLAN_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  function update<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const name = values.name.trim();
    const description = values.description.trim();
    const priceMinor = parsePlanPrice(values.priceMinor);
    const currency = values.currency.trim().toUpperCase();
    const billingPeriod = values.billingPeriod.trim();

    if (!name) nextErrors.name = "Enter a plan name.";
    else if (name.length > 120) nextErrors.name = "Keep the name to 120 characters or fewer.";
    if (description.length > 600) nextErrors.description = "Keep the description to 600 characters or fewer.";
    if (!values.priceMinor.trim()) nextErrors.priceMinor = "Enter the price as an integer minor-unit amount.";
    else if (priceMinor === null) nextErrors.priceMinor = "Use whole digits only, up to 15 digits.";
    if (!currency) nextErrors.currency = "Enter the ISO currency code.";
    else if (!/^[A-Za-z]{3}$/.test(currency)) nextErrors.currency = "Use a three-letter ISO currency code.";
    if (!billingPeriod) nextErrors.billingPeriod = "Enter the billing interval label.";
    else if (billingPeriod.length > 32) nextErrors.billingPeriod = "Keep the billing interval to 32 characters or fewer.";

    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0 || priceMinor === null) return;

    setPending(true);
    try {
      await onCreate({ name, description: description || null, priceMinor, currency, billingPeriod });
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
        <Field id={`${id}-name`} label="Plan name" required error={errors.name} hint="The internal name shown to staff.">
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={140}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <Field
          id={`${id}-price`}
          label="Price"
          required
          error={errors.priceMinor}
          hint="Integer minor units. No decimal point and no rounding."
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
          hint="Billing interval label, for example MONTHLY or ANNUAL."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <input
              id={fieldId}
              value={values.billingPeriod}
              onChange={(event) => update("billingPeriod", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              maxLength={40}
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field id={`${id}-description`} label="Description" error={errors.description} hint="Optional internal description.">
            {({ id: fieldId, describedBy, invalid }) => (
              <textarea
                id={fieldId}
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                rows={2}
                maxLength={700}
                className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
              />
            )}
          </Field>
        </div>
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
/* Plan card                                                           */
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
  const effective = formatDateTime(term.effectiveAt);
  const approved = formatDateTime(term.approvedAt);
  const alreadyApproved = term.status === "APPROVED";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[#21262D] bg-[#161B22] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#F0F6FC]">{term.version ?? "Version not recorded"}</p>
        <p className="text-xs leading-5 text-[#8B949E]">
          {term.summary ?? "No summary recorded"}
          {effective ? ` · Effective ${effective}` : ""}
          {approved ? ` · Approved ${approved}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={term.status} />
        {canConfigure && !alreadyApproved ? (
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
  const [countryCode, setCountryCode] = useState("");
  const [countryError, setCountryError] = useState("");
  const [termVersion, setTermVersion] = useState("");
  const [termSummary, setTermSummary] = useState("");
  const [termEffectiveAt, setTermEffectiveAt] = useState("");
  const [termError, setTermError] = useState("");
  const [editValues, setEditValues] = useState({
    priceMinor: plan.priceMinor ?? "",
    currency: plan.currency ?? "",
    billingPeriod: plan.billingPeriod ?? ""
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const activationError = feedback?.kind === "error" ? describeError(feedback.error) : null;
  const activationRefused =
    feedback?.kind === "error" && feedback.action === "activate" && activationError?.code === "paid_activation_not_approved";

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
    if (!/^[A-Z]{2,3}$/.test(code)) {
      setCountryError("Use a two-letter ISO country code, for example NG.");
      return;
    }
    setCountryError("");
    const ok = await run(
      `country:${plan.id}`,
      () => plusApi.plans.addCountry(plan.id, code),
      `The server accepted country ${code} for this plan.`
    );
    if (ok) setCountryCode("");
  }

  async function submitTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = termVersion.trim();
    if (!version) {
      setTermError("Enter a term version label.");
      return;
    }
    if (version.length > 60) {
      setTermError("Keep the version label to 60 characters or fewer.");
      return;
    }
    setTermError("");
    const ok = await run(
      `term-create:${plan.id}`,
      () =>
        plusApi.plans.addTerm(plan.id, {
          version,
          summary: termSummary.trim() || null,
          effectiveAt: termEffectiveAt || null
        }),
      "The server accepted the new term version."
    );
    if (ok) {
      setTermVersion("");
      setTermSummary("");
      setTermEffectiveAt("");
    }
  }

  async function submitPlanEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const priceMinor = parsePlanPrice(editValues.priceMinor);
    const currency = editValues.currency.trim().toUpperCase();
    const billingPeriod = editValues.billingPeriod.trim();

    if (priceMinor === null) nextErrors.priceMinor = "Use whole digits only, up to 15 digits.";
    if (!/^[A-Za-z]{3}$/.test(currency)) nextErrors.currency = "Use a three-letter ISO currency code.";
    if (!billingPeriod) nextErrors.billingPeriod = "Enter the billing interval label.";

    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || priceMinor === null) return;

    await run(
      `edit:${plan.id}`,
      () => plusApi.plans.update(plan.id, { priceMinor, currency, billingPeriod }),
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
          <p className="mt-1 text-sm leading-6 text-[#C9D1D9]">{plan.description ?? "No description recorded."}</p>
          <p className="mt-1 text-xs leading-5 text-[#8B949E]">
            {formatMinorUnits(plan.priceMinor, plan.currency)} · {plan.billingPeriod ?? "Billing period not recorded"}
          </p>
          <p className="text-xs leading-5 text-[#8B949E]">
            {plan.activatedAt ? `Activated ${formatDateTime(plan.activatedAt)}` : "Not activated"}
            {plan.code ? ` · Code ${plan.code}` : ""}
          </p>
        </div>
        {canConfigure ? (
          <Button
            variant="primary"
            onClick={() =>
              void run(`activate:${plan.id}`, () => plusApi.plans.activate(plan.id), "The server accepted the activation request.")
            }
            busy={pending === `activate:${plan.id}`}
            disabled={pending !== null && pending !== `activate:${plan.id}`}
          >
            {pending === `activate:${plan.id}` ? "Requesting activation…" : "Request activation"}
          </Button>
        ) : null}
      </div>

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
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {plan.countries.map((country) => (
                <li
                  key={country.code}
                  className="rounded-full border border-[#30363D] bg-[#0B0E14] px-2.5 py-1 text-[11px] font-bold text-[#C9D1D9]"
                >
                  {country.code}
                  {country.name !== country.code ? ` · ${country.name}` : ""}
                  {country.enabled === false ? " · disabled" : ""}
                </li>
              ))}
            </ul>
          )}
          {canConfigure ? (
            <form onSubmit={submitCountry} className="mt-3 space-y-2">
              <Field
                id={`${id}-country`}
                label="Enable country"
                error={countryError}
                hint="ISO 3166-1 alpha-2 code. Enabling a country here does not open membership by itself."
              >
                {({ id: fieldId, describedBy, invalid }) => (
                  <input
                    id={fieldId}
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    placeholder="NG"
                    maxLength={3}
                    className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                  />
                )}
              </Field>
              <Button type="submit" variant="secondary" busy={pending === `country:${plan.id}`} disabled={!countryCode.trim()}>
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
                  canConfigure={canConfigure}
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
          {canConfigure ? (
            <details className="mt-3 rounded-lg border border-[#30363D] bg-[#0B0E14]/60 p-3">
              <summary className="cursor-pointer text-sm font-bold text-[#F0F6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]">
                Add a term version
              </summary>
              <form onSubmit={submitTerm} className="mt-3 space-y-2">
                <Field id={`${id}-term-version`} label="Version" required error={termError} hint="For example 2026-11 or v1.">
                  {({ id: fieldId, describedBy, invalid }) => (
                    <input
                      id={fieldId}
                      value={termVersion}
                      onChange={(event) => setTermVersion(event.target.value)}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      aria-required
                      maxLength={70}
                      className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                    />
                  )}
                </Field>
                <Field id={`${id}-term-summary`} label="Summary" hint="Optional. What this term version changes.">
                  {({ id: fieldId, describedBy }) => (
                    <textarea
                      id={fieldId}
                      value={termSummary}
                      onChange={(event) => setTermSummary(event.target.value)}
                      aria-describedby={describedBy}
                      rows={2}
                      maxLength={600}
                      className={FIELD_CONTROL_CLASS}
                    />
                  )}
                </Field>
                <Field id={`${id}-term-effective`} label="Effective date" hint="Optional. The date the term takes effect.">
                  {({ id: fieldId, describedBy }) => (
                    <input
                      id={fieldId}
                      type="date"
                      value={termEffectiveAt}
                      onChange={(event) => setTermEffectiveAt(event.target.value)}
                      aria-describedby={describedBy}
                      className={FIELD_CONTROL_CLASS}
                    />
                  )}
                </Field>
                <Button type="submit" variant="secondary" busy={pending === `term-create:${plan.id}`} disabled={!termVersion.trim()}>
                  Add term
                </Button>
              </form>
            </details>
          ) : null}
        </div>
      </div>

      {canConfigure ? (
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
                <input
                  id={fieldId}
                  value={editValues.billingPeriod}
                  onChange={(event) => setEditValues((previous) => ({ ...previous, billingPeriod: event.target.value }))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
                />
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

  async function changed() {
    await resource.reload();
    onRetryOverview();
  }

  async function create(input: {
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    billingPeriod: string;
  }) {
    const result = await plusApi.plans.create(input);
    setCreating(false);
    setNotice(result.message ?? "The server accepted the new draft plan.");
    await changed();
  }

  return (
    <div className="space-y-4">
      <Notice tone="warning" title="Paid activation remains disabled">
        {APPROVAL_SENTENCE} Activation requests are sent to the server, and a refusal is shown verbatim. Nothing is
        reported as activated unless the server responds successfully.
      </Notice>

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
              Creating plans, changing prices, enabling countries, creating or approving terms and requesting activation
              require <code className="font-mono">plus:membership:configure</code>.
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
          <PlanCreateForm
            onCreate={create}
            onCancel={() => setCreating(false)}
          />
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
