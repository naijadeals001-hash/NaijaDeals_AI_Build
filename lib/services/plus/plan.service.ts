import { Prisma, type PlusBillingPeriod, type PlusPlan, type PlusPlanTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { requirePlusPermission } from "./access";
import {
  assertWindow,
  normaliseCountries,
  normaliseCurrency,
  optionalLinkUrl,
  optionalText,
  parseOptionalDate,
  parsePlanCode,
  parsePriceMinor,
  parseRequiredDate,
  parseSortOrder,
  requiredText
} from "./validation";

/**
 * Plus+ plan, country and commercial-term configuration.
 *
 * Activation is deliberately strict: a plan with a positive price cannot go
 * live unless paid activation has been explicitly approved and a currently
 * effective, approved term exists. The public availability reader repeats that
 * check so a direct database edit cannot silently publish a priced plan.
 */

const BILLING_PERIODS: readonly PlusBillingPeriod[] = ["MONTHLY", "ANNUAL", "NONE"];

export type PlanWithConfiguration = Prisma.PlusPlanGetPayload<{
  include: { countries: true; terms: true };
}>;

function parseBillingPeriod(value: unknown, fallback: PlusBillingPeriod | null): PlusBillingPeriod | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !BILLING_PERIODS.includes(value as PlusBillingPeriod)) {
    throw new ApiError(400, "validation_error", `billingPeriod must be one of: ${BILLING_PERIODS.join(", ")}.`);
  }
  return value as PlusBillingPeriod;
}

function parseBoolean(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "boolean") throw new ApiError(400, "validation_error", `${field} must be true or false.`);
  return value;
}

function parseVersion(value: unknown): number {
  const version = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(version) || version < 1 || version > 1_000_000) {
    throw new ApiError(400, "validation_error", "version must be a positive integer.");
  }
  return version;
}

async function findPlan(id: string): Promise<PlanWithConfiguration> {
  const plan = await prisma.plusPlan.findUnique({
    where: { id },
    include: { countries: { orderBy: { countryCode: "asc" } }, terms: { orderBy: { version: "desc" } } }
  });
  if (!plan) throw new ApiError(404, "not_found", "Plus+ plan not found.");
  return plan;
}

export async function listPlans(): Promise<PlanWithConfiguration[]> {
  return prisma.plusPlan.findMany({
    include: { countries: { orderBy: { countryCode: "asc" } }, terms: { orderBy: { version: "desc" } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 200
  });
}

export async function getPlan(id: string): Promise<PlanWithConfiguration> {
  return findPlan(id);
}

export async function createPlan(actor: SessionUser, input: Record<string, unknown>): Promise<PlanWithConfiguration> {
  requirePlusPermission(actor, "plus:membership:configure");
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw new ApiError(400, "status_via_activation", "New plans start as DRAFT; use the activate route to make one available.");
  }

  try {
    const plan = await prisma.plusPlan.create({
      data: {
        code: parsePlanCode(input.code),
        name: requiredText(input.name, "name"),
        description: requiredText(input.description, "description", 2000),
        status: "DRAFT",
        currency: normaliseCurrency(input.currency),
        priceMinor: parsePriceMinor(input.priceMinor),
        billingPeriod: parseBillingPeriod(input.billingPeriod, null),
        paidActivationApproved: parseBoolean(input.paidActivationApproved, "paidActivationApproved"),
        sortOrder: parseSortOrder(input.sortOrder)
      },
      include: { countries: true, terms: true }
    });
    await recordAudit({
      actorId: actor.id,
      action: "plus.plan.created",
      entity: "PlusPlan",
      entityId: plan.id,
      metadata: {
        code: plan.code,
        currency: plan.currency,
        priceMinor: { from: null, to: plan.priceMinor?.toString() ?? null },
        paidActivationApproved: { from: false, to: plan.paidActivationApproved }
      }
    });
    return plan;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "duplicate_code", "A Plus+ plan with that code already exists.");
    }
    throw error;
  }
}

export async function updatePlan(actor: SessionUser, id: string, input: Record<string, unknown>): Promise<PlanWithConfiguration> {
  requirePlusPermission(actor, "plus:membership:configure");
  const existing = await findPlan(id);

  const data: Prisma.PlusPlanUpdateInput = {};
  const changed: string[] = [];
  if ("name" in input) {
    data.name = requiredText(input.name, "name");
    changed.push("name");
  }
  if ("description" in input) {
    data.description = requiredText(input.description, "description", 2000);
    changed.push("description");
  }

  const nextCurrency = "currency" in input ? normaliseCurrency(input.currency) : existing.currency;
  const nextPriceMinor = "priceMinor" in input ? parsePriceMinor(input.priceMinor) : existing.priceMinor;
  const nextBillingPeriod = "billingPeriod" in input ? parseBillingPeriod(input.billingPeriod, null) : existing.billingPeriod;
  const nextPaidActivationApproved =
    "paidActivationApproved" in input
      ? parseBoolean(input.paidActivationApproved, "paidActivationApproved")
      : existing.paidActivationApproved;

  if (existing.status === "ACTIVE") {
    const frozen: string[] = [];
    if (nextCurrency !== existing.currency) frozen.push("currency");
    if (nextPriceMinor !== existing.priceMinor) frozen.push("priceMinor");
    if (nextBillingPeriod !== existing.billingPeriod) frozen.push("billingPeriod");
    if (nextPaidActivationApproved !== existing.paidActivationApproved) frozen.push("paidActivationApproved");
    if (frozen.length > 0) {
      throw new ApiError(
        409,
        "terms_frozen",
        `Active plan terms are frozen; create a new approved plan or term instead of changing ${frozen.join(", ")}.`
      );
    }
  }

  if ("currency" in input) {
    data.currency = nextCurrency;
    changed.push("currency");
  }
  if ("priceMinor" in input) {
    data.priceMinor = nextPriceMinor;
    changed.push("priceMinor");
  }
  if ("billingPeriod" in input) {
    data.billingPeriod = nextBillingPeriod;
    changed.push("billingPeriod");
  }
  if ("paidActivationApproved" in input) {
    data.paidActivationApproved = nextPaidActivationApproved;
    changed.push("paidActivationApproved");
  }
  if ("sortOrder" in input) {
    data.sortOrder = parseSortOrder(input.sortOrder);
    changed.push("sortOrder");
  }
  if ("status" in input) {
    if (input.status !== "RETIRED") {
      throw new ApiError(400, "status_via_activation", "Use the activate route to make a plan active; only retirement is accepted here.");
    }
    if (existing.status !== "RETIRED") {
      data.status = "RETIRED";
      changed.push("status");
    }
  }

  let plan: PlanWithConfiguration;
  try {
    plan = await prisma.plusPlan.update({
      where: { id, status: existing.status },
      data,
      include: { countries: { orderBy: { countryCode: "asc" } }, terms: { orderBy: { version: "desc" } } }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError(409, "state_changed", "This plan changed while the action was being applied. Reload and try again.");
    }
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: "plus.plan.updated",
    entity: "PlusPlan",
    entityId: plan.id,
    metadata: {
      code: plan.code,
      fields: changed,
      priceMinor: { from: existing.priceMinor?.toString() ?? null, to: plan.priceMinor?.toString() ?? null },
      paidActivationApproved: { from: existing.paidActivationApproved, to: plan.paidActivationApproved }
    }
  });
  return plan;
}

export async function setPlanCountry(
  actor: SessionUser,
  planId: string,
  input: Record<string, unknown>
): Promise<{ planId: string; countryCode: string; enabled: boolean }> {
  requirePlusPermission(actor, "plus:membership:configure");
  await findPlan(planId);
  const codes = normaliseCountries([input.countryCode], "countryCode");
  const countryCode = codes[0];
  if (!countryCode) throw new ApiError(400, "validation_error", "countryCode is required.");
  const enabled = parseBoolean(input.enabled, "enabled", false);

  const row = await prisma.plusPlanCountry.upsert({
    where: { planId_countryCode: { planId, countryCode } },
    create: { planId, countryCode, enabled },
    update: { enabled }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.plan.country_updated",
    entity: "PlusPlan",
    entityId: planId,
    metadata: { countryCode, enabled }
  });
  return row;
}

export async function createPlanTerm(
  actor: SessionUser,
  planId: string,
  input: Record<string, unknown>
): Promise<PlusPlanTerm> {
  requirePlusPermission(actor, "plus:membership:configure");
  const plan = await findPlan(planId);

  const effectiveFrom = parseRequiredDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = parseOptionalDate(input.effectiveTo, "effectiveTo");
  assertWindow(effectiveFrom, effectiveTo);

  const billingPeriod = parseBillingPeriod(input.billingPeriod, plan.billingPeriod);
  if (!billingPeriod) throw new ApiError(400, "validation_error", "billingPeriod is required for a plan term.");

  const requestedVersion = input.version === undefined || input.version === null || input.version === ""
    ? null
    : parseVersion(input.version);
  const version = requestedVersion ?? ((plan.terms[0]?.version ?? 0) + 1);

  try {
    const term = await prisma.plusPlanTerm.create({
      data: {
        planId,
        version,
        priceMinor: "priceMinor" in input ? parsePriceMinor(input.priceMinor) : plan.priceMinor,
        currency: normaliseCurrency(input.currency, plan.currency),
        billingPeriod,
        cancellationSummary: optionalText(input.cancellationSummary, "cancellationSummary", 2000),
        termsUrl: optionalLinkUrl(input.termsUrl, "termsUrl"),
        effectiveFrom,
        effectiveTo
      }
    });
    await recordAudit({
      actorId: actor.id,
      action: "plus.plan.term_created",
      entity: "PlusPlan",
      entityId: planId,
      metadata: { termId: term.id, version: term.version, priceMinor: term.priceMinor?.toString() ?? null, currency: term.currency }
    });
    return term;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "term_version_exists", "That term version already exists for this plan.");
    }
    throw error;
  }
}

export async function approvePlanTerm(
  actor: SessionUser,
  planId: string,
  termId: string
): Promise<PlusPlanTerm> {
  requirePlusPermission(actor, "plus:membership:configure");
  const term = await prisma.plusPlanTerm.findUnique({ where: { id: termId } });
  if (!term || term.planId !== planId) throw new ApiError(404, "not_found", "Plus+ plan term not found.");
  if (term.approvedAt) return term;

  const approved = await prisma.plusPlanTerm.update({
    where: { id: term.id },
    data: { approvedAt: new Date(), approvedById: actor.id }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.plan.term_approved",
    entity: "PlusPlan",
    entityId: planId,
    metadata: { termId: term.id, version: term.version, priceMinor: term.priceMinor?.toString() ?? null, currency: term.currency }
  });
  return approved;
}

export async function activatePlan(actor: SessionUser, planId: string): Promise<PlanWithConfiguration> {
  requirePlusPermission(actor, "plus:membership:configure");
  const plan = await findPlan(planId);
  if (plan.status === "RETIRED") {
    throw new ApiError(409, "plan_retired", "A retired Plus+ plan cannot be reactivated; create a new approved plan instead.");
  }
  if (plan.status === "ACTIVE") return plan;

  const priced = plan.priceMinor !== null && plan.priceMinor > BigInt(0);
  let effectiveTermId: string | null = null;

  if (priced) {
    if (!plan.paidActivationApproved) {
      throw new ApiError(
        409,
        "paid_activation_not_approved",
        "This plan has a price but paid activation has not been approved. Record the commercial approval first."
      );
    }
    const now = new Date();
    const term = await prisma.plusPlanTerm.findFirst({
      where: {
        planId: plan.id,
        approvedAt: { not: null },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      },
      orderBy: { version: "desc" }
    });
    if (!term) {
      throw new ApiError(
        409,
        "paid_activation_not_approved",
        "This plan has a price but no approved, currently effective term. Approve the commercial terms before activation."
      );
    }
    if (term.priceMinor === null || term.priceMinor !== plan.priceMinor) {
      throw new ApiError(
        409,
        "paid_activation_not_approved",
        "The approved term must freeze the same price as the plan before a priced plan can activate."
      );
    }
    if (term.currency !== plan.currency) {
      throw new ApiError(
        409,
        "paid_activation_not_approved",
        "The approved term currency must match the plan currency before a priced plan can activate."
      );
    }
    effectiveTermId = term.id;
  }

  const activated = await prisma.plusPlan.update({
    where: { id: plan.id },
    data: { status: "ACTIVE" },
    include: { countries: { orderBy: { countryCode: "asc" } }, terms: { orderBy: { version: "desc" } } }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.plan.activated",
    entity: "PlusPlan",
    entityId: activated.id,
    metadata: {
      code: activated.code,
      priceMinor: activated.priceMinor?.toString() ?? null,
      currency: activated.currency,
      paidActivationApproved: activated.paidActivationApproved,
      effectiveTermId
    }
  });
  return activated;
}

/** Internal helper used by activation and availability tests. */
export function isPricedPlan(plan: Pick<PlusPlan, "priceMinor">): boolean {
  return plan.priceMinor !== null && plan.priceMinor > BigInt(0);
}
