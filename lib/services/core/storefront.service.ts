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
  showShelves: true
};

function sanitize(input: Record<string, unknown>): StorefrontConfig {
  const text = (value: unknown, max: number, fallback: string) =>
    typeof value === "string" ? value.trim().slice(0, max) : fallback;
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 40) : [];
  return {
    announcement: text(input.announcement, 200, DEFAULT_STOREFRONT.announcement),
    heroTitle: text(input.heroTitle, 90, DEFAULT_STOREFRONT.heroTitle),
    heroSubtitle: text(input.heroSubtitle, 220, DEFAULT_STOREFRONT.heroSubtitle),
    visibleCategories: list(input.visibleCategories),
    categoryOrder: list(input.categoryOrder),
    shelfLimit: Math.min(8, Math.max(1, Number(input.shelfLimit ?? 4) || 4)),
    showDemoProducts: input.showDemoProducts !== false,
    showHero: input.showHero !== false,
    showShelves: input.showShelves !== false
  };
}

export async function getStorefrontConfig(): Promise<StorefrontConfig> {
  const rows = await prisma.$queryRaw<Array<{ config: unknown }>>`
    SELECT config FROM "StorefrontConfig" WHERE id = 'default' LIMIT 1`;
  if (!rows[0]) return DEFAULT_STOREFRONT;
  return { ...DEFAULT_STOREFRONT, ...(rows[0].config as Partial<StorefrontConfig>) };
}

export async function updateStorefrontConfig(adminId: string, input: Record<string, unknown>) {
  const current = await getStorefrontConfig();
  const next = sanitize({ ...current, ...input });
  if (!next.heroTitle) throw new ApiError(400, "validation_error", "Hero title is required.");
  await prisma.$executeRaw`
    INSERT INTO "StorefrontConfig" (id, config, "updatedBy", "updatedAt")
    VALUES ('default', ${JSON.stringify(next)}::jsonb, ${adminId}, NOW())
    ON CONFLICT (id) DO UPDATE SET config = ${JSON.stringify(next)}::jsonb, "updatedBy" = ${adminId}, "updatedAt" = NOW()`;
  await recordAudit({
    actorId: adminId,
    action: "storefront.updated",
    entity: "StorefrontConfig",
    entityId: "default",
    metadata: { before: current, after: next }
  });
  return next;
}
