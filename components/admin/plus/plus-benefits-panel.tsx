"use client";

import { Fragment, useCallback, useId, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { plusApi, type PlusBenefit, type PlusBenefitInput, type PlusPlan } from "./plus-api";
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

type BenefitFormValues = {
  title: string;
  description: string;
  planId: string;
};

function valuesFromBenefit(benefit: PlusBenefit): BenefitFormValues {
  return {
    title: benefit.title,
    description: benefit.description,
    planId: benefit.planId ?? ""
  };
}

function BenefitForm({
  heading,
  initial,
  plans,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel
}: {
  heading: string;
  initial: BenefitFormValues;
  plans: PlusPlan[];
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: PlusBenefitInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<BenefitFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  function update<K extends keyof BenefitFormValues>(key: K, value: BenefitFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const title = values.title.trim();
    const description = values.description.trim();
    const planId = values.planId;

    if (!title) nextErrors.title = "Enter the benefit title.";
    else if (title.length > 120) nextErrors.title = "Keep the title to 120 characters or fewer.";
    if (!description) nextErrors.description = "Describe the benefit that is actually delivered.";
    else if (description.length > 600) nextErrors.description = "Keep the description to 600 characters or fewer.";
    if (!planId) nextErrors.planId = "Choose the plan this benefit belongs to.";

    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    try {
      await onSubmit({ title, description, planId });
    } catch (error) {
      setServerError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-xl border border-[#30363D] bg-[#0B0E14]/70 p-3 sm:p-4">
      <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{heading}</h3>
      {serverError ? <ErrorBlock title="The server rejected the benefit" error={serverError} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-title`} label="Benefit title" required error={errors.title}>
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

        <Field
          id={`${id}-plan`}
          label="Plan"
          required
          error={errors.planId}
          hint="A benefit must belong to a plan. It is not a general service guarantee."
        >
          {({ id: fieldId, describedBy, invalid }) => (
            <select
              id={fieldId}
              value={values.planId}
              onChange={(event) => update("planId", event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required
              className={`${FIELD_CONTROL_CLASS} ${invalid ? FIELD_CONTROL_INVALID_CLASS : ""}`}
            >
              <option value="">Select a plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.status.toLowerCase()})
                </option>
              ))}
              {initial.planId && !plans.some((plan) => plan.id === initial.planId) ? (
                <option value={initial.planId}>Current plan ({initial.planId})</option>
              ) : null}
            </select>
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field
            id={`${id}-description`}
            label="Description"
            required
            error={errors.description}
            hint="State exactly what the member receives. Do not describe standard services as benefits."
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

export function PlusBenefitsPanel({
  canWrite,
  canPublish,
  plans,
  plansPhase
}: {
  canWrite: boolean;
  canPublish: boolean;
  plans: PlusPlan[];
  plansPhase: "loading" | "ready" | "error";
}) {
  const load = useCallback(() => plusApi.benefits.list(), []);
  const resource = useResource(load);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const benefits = resource.data ?? [];
  const canCreate = canWrite && plans.length > 0;

  async function create(input: PlusBenefitInput) {
    const result = await plusApi.benefits.create(input);
    setCreating(false);
    setEditingId(null);
    setActionError(null);
    setNotice(result.message ?? "The server accepted the new benefit.");
    await resource.reload();
  }

  async function update(id: string, input: PlusBenefitInput) {
    const result = await plusApi.benefits.update(id, input);
    setEditingId(null);
    setActionError(null);
    setNotice(result.message ?? "The server accepted the benefit changes.");
    await resource.reload();
  }

  async function transition(benefit: PlusBenefit, action: "publish" | "archive") {
    setBusyKey(`${action}:${benefit.id}`);
    setActionError(null);
    setNotice(null);
    try {
      const result =
        action === "publish" ? await plusApi.benefits.publish(benefit.id) : await plusApi.benefits.archive(benefit.id);
      setNotice(result.message ?? `The server accepted the ${action} request for “${benefit.title}”.`);
      await resource.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Service-awareness cards are not benefits">
        A benefit is an entitlement attached to a plan. Published discovery cards, standard services, discounts and
        marketing claims only belong here when they are approved member entitlements with real delivery.
      </Notice>

      <Panel>
        <PanelHeader
          title="Member benefits"
          description="Only genuine entitlements attached to a plan are listed. Publishing a benefit does not grant it to any account."
          actions={
            canCreate && !creating ? (
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
                New benefit
              </Button>
            ) : null
          }
        />
        {!canWrite ? (
          <div className="mt-3">
            <ReadOnlyNote>
              Creating, editing and archiving benefits requires <code className="font-mono">plus:content:write</code>.
            </ReadOnlyNote>
          </div>
        ) : null}
        {!canPublish ? (
          <p className="mt-2 text-xs leading-5 text-[#8B949E]">
            Publishing requires <code className="font-mono">plus:content:publish</code>.
          </p>
        ) : null}
        {notice ? (
          <div className="mt-3">
            <Notice tone="success" title="Server response">{notice}</Notice>
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-3">
            <ErrorBlock title="The server rejected the action" error={actionError} />
          </div>
        ) : null}
        {canWrite && plansPhase === "loading" ? (
          <p className="mt-2 text-xs text-[#8B949E]">Loading plans before a benefit can be attached…</p>
        ) : null}
        {canWrite && plansPhase !== "loading" && plans.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-[#F2CE72]">
            {plansPhase === "error"
              ? "Plans could not be loaded from the overview, so a benefit cannot be attached here. Retry the overview first."
              : "A benefit cannot be created until a plan exists. Create a plan in Plans & membership first."}
          </p>
        ) : null}
      </Panel>

      {creating ? (
        <Panel>
          <BenefitForm
            heading="New member benefit"
            initial={{ title: "", description: "", planId: "" }}
            plans={plans}
            submitLabel="Create draft benefit"
            pendingLabel="Creating…"
            onSubmit={create}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Benefit register"
          description="Draft, published and archived benefits returned by the server."
          headingId="plus-benefit-register-heading"
        />
        <div aria-labelledby="plus-benefit-register-heading" className="mt-4">
          {resource.phase === "loading" && !resource.data ? <LoadingBlock label="Loading benefits…" /> : null}
          {resource.phase === "error" && !resource.data ? (
            <ErrorBlock
              title="Could not load benefits"
              error={resource.error}
              onRetry={resource.reload}
              permissionHint="Reading benefits requires the plus:content:read permission."
            />
          ) : null}
          {resource.data && resource.data.length === 0 ? (
            <EmptyBlock
              title="No member benefits configured"
              action={
                canCreate && !creating ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create the first benefit
                  </Button>
                ) : null
              }
            >
              The server returned no Plus+ benefits. Standard services are not added here to fill the register.
            </EmptyBlock>
          ) : null}
          {resource.data && resource.data.length > 0 ? (
            <ul className="space-y-3">
              {benefits.map((benefit) => {
                const published = formatDateTime(benefit.publishedAt);
                const publishBusy = busyKey === `publish:${benefit.id}`;
                const archiveBusy = busyKey === `archive:${benefit.id}`;
                const planReady = Boolean(benefit.planId || benefit.planName);
                return (
                  <Fragment key={benefit.id}>
                    <li className="rounded-xl border border-[#21262D] bg-[#0B0E14]/50 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">{benefit.title}</h3>
                        <StatusBadge status={benefit.status} />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[#C9D1D9]">{benefit.description}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8B949E]">
                        Plan: {benefit.planName ?? benefit.planId ?? "Not recorded"}
                        {published ? ` · Published ${published}` : ""}
                      </p>
                      {!planReady ? (
                        <p className="mt-1 text-xs font-bold text-[#F2CE72]">
                          This benefit has no recorded plan, so it cannot be published as a member benefit.
                        </p>
                      ) : null}
                      {canWrite || canPublish ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canWrite ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditingId(benefit.id);
                                setCreating(false);
                                setActionError(null);
                                setNotice(null);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                          ) : null}
                          {canPublish && benefit.status !== "PUBLISHED" ? (
                            <Button
                              variant="primary"
                              onClick={() => void transition(benefit, "publish")}
                              busy={publishBusy}
                              disabled={!planReady || (busyKey !== null && !publishBusy)}
                            >
                              Publish
                            </Button>
                          ) : null}
                          {canWrite && benefit.status !== "ARCHIVED" ? (
                            <Button
                              variant="secondary"
                              onClick={() => void transition(benefit, "archive")}
                              busy={archiveBusy}
                              disabled={busyKey !== null && !archiveBusy}
                            >
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                    {editingId === benefit.id ? (
                      <li>
                        <BenefitForm
                          heading={`Edit “${benefit.title}”`}
                          initial={valuesFromBenefit(benefit)}
                          plans={plans}
                          submitLabel="Save changes"
                          pendingLabel="Saving…"
                          onSubmit={(input) => update(benefit.id, input)}
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
              <ErrorBlock title="Could not refresh the benefit register" error={resource.error} onRetry={resource.reload} />
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
