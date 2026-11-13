import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

export type StorefrontHeroSlide = {
  id: string;
  eyebrow?: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
  sideTitle?: string;
  sideBody?: string;
  sideCtaLabel?: string;
  sideCtaHref?: string;
};

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
  /** Operator-published hero campaigns. Empty means the built-in launch slides. */
  heroSlides: StorefrontHeroSlide[];
  version: number;
};

export const DEFAULT_STOREFRONT: StorefrontConfig = {
  announcement: "Demo inventory. These listings are for visual testing only; prices and stock are illustrative.",
  heroTitle: "Shop sellers across Africa",
  heroSubtitle: "Escrow-protected checkout, tracked delivery and server-verified payments.",
  visibleCategories: [],
  categoryOrder: [],
  shelfLimit: 4,
  showDemoProducts: true,
  showHero: true,
  showShelves: true,
  heroSlides: [],
  version: 1
};

const MAX_SLIDES = 6;

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

/**
 * Hero slides are operator-authored campaigns: every destination must be an
 * internal NaijaShop/catalogue path and every image an approved generated
 * asset, so a bad paste can never point the storefront at an external host.
 */
function slidesField(value: unknown): StorefrontHeroSlide[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "Hero slides must be a list.");
  if (value.length > MAX_SLIDES) throw new ApiError(400, "validation_error", `Publish at most ${MAX_SLIDES} hero slides.`);
  const internal = (href: string, label: string) => {
    if (!href.startsWith("/") || href.startsWith("//")) throw new ApiError(400, "validation_error", `${label} must be an internal path.`);
    return href.slice(0, 300);
  };
  const image = (url: string) => {
    if (!/^\/(generated|uploads)\/[\w\-./]+\.(jpg|jpeg|png|webp)$/i.test(url)) {
      throw new ApiError(400, "validation_error", "Hero images must be approved assets under /generated or /uploads.");
    }
    return url;
  };
  return value.map((raw, index) => {
    const slide = (raw ?? {}) as Record<string, unknown>;
    const at = `Slide ${index + 1}`;
    return {
      id: textField(slide.id, `${at} id`, 40).replace(/[^\w-]/g, "") || `slide-${index + 1}`,
      eyebrow: slide.eyebrow === undefined ? undefined : textField(slide.eyebrow, `${at} eyebrow`, 30),
      headline: textField(slide.headline, `${at} headline`, 70) || (() => { throw new ApiError(400, "validation_error", `${at} needs a headline.`); })(),
      body: textField(slide.body, `${at} body`, 200),
      ctaLabel: textField(slide.ctaLabel, `${at} CTA label`, 30) || (() => { throw new ApiError(400, "validation_error", `${at} needs a CTA.`); })(),
      ctaHref: internal(textField(slide.ctaHref, `${at} CTA link`, 300), `${at} CTA link`),
      imageUrl: image(textField(slide.imageUrl, `${at} image`, 300)),
      sideTitle: slide.sideTitle === undefined ? undefined : textField(slide.sideTitle, `${at} side title`, 40),
      sideBody: slide.sideBody === undefined ? undefined : textField(slide.sideBody, `${at} side body`, 160),
      sideCtaLabel: slide.sideCtaLabel === undefined ? undefined : textField(slide.sideCtaLabel, `${at} side CTA`, 30),
      sideCtaHref: slide.sideCtaHref === undefined ? undefined : internal(textField(slide.sideCtaHref, `${at} side CTA link`, 300), `${at} side CTA link`)
    };
  });
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
  if (input.heroSlides !== undefined) next.heroSlides = slidesField(input.heroSlides);

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
