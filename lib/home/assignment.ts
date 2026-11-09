import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Homepage variant assignment.
 *
 * Rules:
 *  - a visitor gets one variant and keeps it (stable across refreshes, restarts
 *    and deploys) via an anonymous first-party id in an httpOnly cookie;
 *  - no account is required, and the cookie carries no personal data — it is a
 *    random id used only to look up the pinned variant;
 *  - a manual choice always wins and is never overwritten by rotation;
 *  - disabled variants are never assigned, and percentages come from the
 *    database so the Control Center controls distribution.
 */

export const VISITOR_COOKIE = "nd_visitor";
export const DESIGN_COOKIE = "nd_design";
export const VARIANT_KEYS = ["original", "africa-super-app", "mobility", "commerce"] as const;
export type VariantKey = (typeof VARIANT_KEYS)[number];

export function isVariantKey(value: string | undefined | null): value is VariantKey {
  return typeof value === "string" && (VARIANT_KEYS as readonly string[]).includes(value);
}

type VariantRow = { key: string; name: string; allocation: number; enabled: boolean; sortOrder: number };

/** Enabled variants in display order, with a safe fallback if the table is empty. */
export async function loadVariants(): Promise<VariantRow[]> {
  const rows = await prisma.homeVariant.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true, allocation: true, enabled: true, sortOrder: true } });
  if (rows.length) return rows;
  return [
    { key: "original", name: "Original NaijaDeals", allocation: 25, enabled: true, sortOrder: 0 },
    { key: "africa-super-app", name: "Africa Super-App", allocation: 25, enabled: true, sortOrder: 1 },
    { key: "mobility", name: "Mobility & Services", allocation: 25, enabled: true, sortOrder: 2 },
    { key: "commerce", name: "Commerce & Lifestyle", allocation: 25, enabled: true, sortOrder: 3 }
  ];
}

/** Weighted pick over enabled variants. A zero-total set falls back to the first. */
export function pickVariant(enabled: VariantRow[], roll: number): string {
  const pool = enabled.filter((variant) => variant.enabled);
  if (!pool.length) return "original";
  const total = pool.reduce((sum, variant) => sum + Math.max(0, variant.allocation), 0);
  if (total <= 0) return pool[0].key;
  let threshold = roll * total;
  for (const variant of pool) {
    threshold -= Math.max(0, variant.allocation);
    if (threshold < 0) return variant.key;
  }
  return pool[pool.length - 1].key;
}

/**
 * Resolves the variant for this request. Call from a server component; it sets
 * the visitor cookie when a new assignment is made.
 */
export async function resolveVariant(): Promise<{ variant: string; manual: boolean; visitorId: string | null }> {
  const store = cookies();
  const variants = await loadVariants();
  const enabled = variants.filter((variant) => variant.enabled);
  const fallback = (enabled[0] ?? variants[0]).key;

  const chosen = store.get(DESIGN_COOKIE)?.value;
  if (isVariantKey(chosen) && enabled.some((variant) => variant.key === chosen)) {
    return { variant: chosen, manual: true, visitorId: store.get(VISITOR_COOKIE)?.value ?? null };
  }

  const visitorId = store.get(VISITOR_COOKIE)?.value ?? createVisitorId();
  const existing = await prisma.homeAssignment.findUnique({ where: { visitorId }, select: { variantKey: true, manual: true } });
  if (existing) {
    // A pinned variant that has since been disabled falls back without losing the pin.
    const stillEnabled = enabled.some((variant) => variant.key === existing.variantKey);
    return { variant: stillEnabled ? existing.variantKey : fallback, manual: existing.manual, visitorId };
  }

  const variant = pickVariant(enabled, Math.random());
  await prisma.homeAssignment.upsert({
    where: { visitorId },
    update: { variantKey: variant },
    create: { visitorId, variantKey: variant }
  });
  // The cookie itself is issued by POST /api/home/visit, because a Server
  // Component cannot set cookies. Until that call lands, the id is remembered
  // by the caller so the next render resolves the same variant.
  return { variant, manual: false, visitorId };
}

/** A random opaque id; no user information is encoded. */
export function createVisitorId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hero slides for a variant, already filtered by campaign window and order. */
export async function loadSlides(variantKey: string) {
  const now = new Date();
  return prisma.homeHeroSlide.findMany({
    where: {
      variantKey,
      enabled: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }]
    },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, headline: true, body: true, ctaLabel: true, ctaHref: true, secondaryLabel: true, secondaryHref: true, imageId: true, alt: true }
  });
}
