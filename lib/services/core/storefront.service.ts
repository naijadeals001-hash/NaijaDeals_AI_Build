import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

export type StorefrontConfig = {
  announcement: string;
  heroTitle: string;
  heroSubtitle: string;
  visibleCategories: string[];
  categoryOrder: string[];
  shelfLimit: number;
  showDemoProducts: boolean;
  showHero: boolean;
  showShelves: boolean;
  version: number;
};

export const DEFAULT_STOREFRONT: StorefrontConfig = {
  announcement: "Demo inventory. These listings are for visual testing only; prices and stock are illustrative.",
  heroTitle: "Shop verified sellers across Africa",
  heroSubtitle: "Escrow-protected checkout, tracked delivery and server-verified payments.",
  visibleCategories: [],
  categoryOrder: [],
  shelfLimit: 4,
  showDemoProducts: true,
  showHero: true,
  showShelves: true,
  version: 1
};

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, "validation_error", `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

function boolField(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new ApiError(400, "validation_error", `${label} must be true or false.`);
  return value;
}

function listField(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "validation_error", `${label} must be a list of department slugs.`);
  }
  if (value.length > 40) throw new ApiError(400, "validation_error", `${label} has too many entries.`);
  return value.map((item) => item.trim()).filter(Boolean);
}

async function validate(input: Record<string, unknown>, current: StorefrontConfig) {
  const next: StorefrontConfig = { ...current, version: current.version };
  if (input.announcement !== undefined) next.announcement = textField(input.announcement, "Announcement", 200);
  if (input.heroTitle !== undefined) next.heroTitle = textField(input.heroTitle, "Hero title", 90);
  if (input.heroSubtitle !== undefined) next.heroSubtitle = textField(input.heroSubtitle, "Hero subtitle", 220);
  if (input.shelfLimit !== undefined) {
    const limit = Number(input.shelfLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new ApiError(400, "validation_error", "Shelf limit must be an integer between 1 and 8.");
    next.shelfLimit = limit;
  }
  if (input.showDemoProducts !== undefined) next.showDemoProducts = boolField(input.showDemoProducts, "Show demo inventory");
  if (input.showHero !== undefined) next.showHero = boolField(input.showHero, "Show hero");
  if (input.showShelves !== undefined) next.showShelves = boolField(input.showShelves, "Show shelves");
  if (input.visibleCategories !== undefined) next.visibleCategories = listField(input.visibleCategories, "Visible departments");
  if (input.categoryOrder !== undefined) next.categoryOrder = listField(input.categoryOrder, "Shelf order");

  const slugs = new Set((await prisma.category.findMany({ select: { slug: true } })).map((row) => row.slug));
  for (const slug of [...next.visibleCategories, ...next.categoryOrder]) {
    if (!slugs.has(slug)) throw new ApiError(400, "validation_error", `Unknown department slug: ${slug}`);
  }
  return next;
}

export async function getStorefrontConfig(): Promise<StorefrontConfig> {
  const rows = await prisma.$queryRaw<Array<{ config: unknown }>>`
    SELECT config FROM "StorefrontConfig" WHERE id = 'default' LIMIT 1`;
  if (!rows[0]) return DEFAULT_STOREFRONT;
  return { ...DEFAULT_STOREFRONT, ...(rows[0].config as Partial<StorefrontConfig>) };
}

export async function updateStorefrontConfig(adminId: string, input: Record<string, unknown>) {
  const current = await getStorefrontConfig();
  const expected = Number(input.version);
  if (!Number.isInteger(expected) || expected !== current.version) {
    throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");
  }
  const next = await validate(input, current);
  next.version = current.version + 1;
  const updated = await prisma.$executeRaw`
    UPDATE "StorefrontConfig"
    SET config = ${JSON.stringify(next)}::jsonb, "updatedBy" = ${adminId}, "updatedAt" = NOW()
    WHERE id = 'default' AND COALESCE((config->>'version')::int, 1) = ${current.version}`;
  if (updated === 0) throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");
  await recordAudit({
    actorId: adminId,
    action: "storefront.updated",
    entity: "StorefrontConfig",
    entityId: "default",
    metadata: JSON.parse(JSON.stringify({
      versionBefore: current.version,
      versionAfter: next.version,
      changes: Object.fromEntries(
        Object.keys(next)
          .filter((key) => key !== "version" && JSON.stringify((next as unknown as Record<string, unknown>)[key]) !== JSON.stringify((current as unknown as Record<string, unknown>)[key]))
          .map((key) => [key, { before: (current as unknown as Record<string, unknown>)[key], after: (next as unknown as Record<string, unknown>)[key] }])
      )
    }))
  });
  return next;
}

export function publicStorefrontConfig(config: StorefrontConfig): Omit<StorefrontConfig, "version"> {
  const { version: _version, ...rest } = config;
  return rest;
}
