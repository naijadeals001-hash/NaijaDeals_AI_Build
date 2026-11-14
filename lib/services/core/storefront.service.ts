import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import {
  AFRICAN_FEATURE_SLUGS,
  DEFAULT_AFRICAN_DISCOVERY_COPY,
  DEFAULT_DISCOVERY_CARDS,
  MAX_AFRICAN_FEATURED_PRODUCTS,
  discoveryImageExists,
  discoveryImagePathError,
  isAfricanCategoryHref,
  isAllowedDiscoveryCardHref,
  type StorefrontDiscoveryCard,
  type StorefrontDiscoveryLink
} from "@/lib/config/storefront-discovery";

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
  /** African discovery band visibility. Disabling keeps every stored row. */
  showAfricanDiscovery: boolean;
  /** Ordered featured listing ids. Empty means the curated category fallback. */
  africanFeaturedProductIds: string[];
  africanDiscoveryEyebrow: string;
  africanDiscoveryTitle: string;
  africanDiscoveryIntro: string;
  africanDiscoveryLinks: StorefrontDiscoveryLink[];
  discoveryCards: StorefrontDiscoveryCard[];
  version: number;
};

export type StorefrontAdminState = {
  published: StorefrontConfig;
  draft: StorefrontConfig | null;
  draftSavedBy: string | null;
  draftSavedAt: string | null;
};

export type AfricanFeatureCandidate = {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  priceKobo: string;
  isDemo: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
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
  showAfricanDiscovery: true,
  africanFeaturedProductIds: [],
  africanDiscoveryEyebrow: DEFAULT_AFRICAN_DISCOVERY_COPY.eyebrow,
  africanDiscoveryTitle: DEFAULT_AFRICAN_DISCOVERY_COPY.title,
  africanDiscoveryIntro: DEFAULT_AFRICAN_DISCOVERY_COPY.intro,
  africanDiscoveryLinks: DEFAULT_AFRICAN_DISCOVERY_COPY.links.map((link) => ({ ...link })),
  discoveryCards: DEFAULT_DISCOVERY_CARDS.map((card) => ({ ...card })),
  version: 1
};

const MAX_SLIDES = 6;
const MAX_DISCOVERY_CARDS = 4;
const MAX_DISCOVERY_LINKS = 4;

/** Acceptance fixtures are real rows but never public storefront merchandise. */
const FIXTURE_LISTING = /^(variant fixture|test |upload test|last unit|product test)\b|-mw[0-9a-z]{8,}$/i;

const STOREFRONT_KEYS = [
  "announcement",
  "heroTitle",
  "heroSubtitle",
  "visibleCategories",
  "categoryOrder",
  "shelfLimit",
  "showDemoProducts",
  "showHero",
  "showShelves",
  "heroSlides",
  "showAfricanDiscovery",
  "africanFeaturedProductIds",
  "africanDiscoveryEyebrow",
  "africanDiscoveryTitle",
  "africanDiscoveryIntro",
  "africanDiscoveryLinks",
  "discoveryCards",
  "version"
] as const;

type RawConfig = Record<string, unknown>;

function isRecord(value: unknown): value is RawConfig {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

/**
 * Featured listings are explicit operator choices, so every id is verified
 * against the live catalogue: it must exist, be ACTIVE, be a non-sample row,
 * carry approved imagery and belong to one of the African feature categories.
 * Empty is valid and deliberately means "use the curated category fallback".
 */
async function featuredField(value: unknown): Promise<string[]> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "validation_error", "Featured listings must be a list of product ids.");
  }
  const ids = value.map((item) => item.trim()).filter(Boolean);
  if (ids.length > MAX_AFRICAN_FEATURED_PRODUCTS) {
    throw new ApiError(400, "validation_error", `Feature at most ${MAX_AFRICAN_FEATURED_PRODUCTS} listings.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, "validation_error", "Each featured listing may appear only once.");
  }
  if (ids.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      isSample: true,
      category: { select: { slug: true } },
      images: { select: { id: true }, take: 1 }
    }
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new ApiError(400, "validation_error", "A featured listing no longer exists. Reload the catalogue and choose again.");
    const label = `Featured listing “${row.name}”`;
    if (row.status !== "ACTIVE") throw new ApiError(400, "validation_error", `${label} is not ACTIVE.`);
    if (row.isSample) throw new ApiError(400, "validation_error", `${label} is a sample row and cannot be featured.`);
    if (FIXTURE_LISTING.test(row.name) || FIXTURE_LISTING.test(row.slug)) {
      throw new ApiError(400, "validation_error", `${label} is an acceptance fixture and cannot be featured.`);
    }
    if (!(AFRICAN_FEATURE_SLUGS as readonly string[]).includes(row.category.slug)) {
      throw new ApiError(400, "validation_error", `${label} is outside the African feature categories.`);
    }
    if (row.images.length === 0) throw new ApiError(400, "validation_error", `${label} has no image to show.`);
  }
  return ids;
}

function discoveryCardsField(value: unknown): StorefrontDiscoveryCard[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "Discovery cards must be a list.");
  if (value.length > MAX_DISCOVERY_CARDS) {
    throw new ApiError(400, "validation_error", `Configure at most ${MAX_DISCOVERY_CARDS} discovery cards.`);
  }
  const seen = new Set<string>();
  const cards = value.map((raw, index) => {
    const at = `Discovery card ${index + 1}`;
    const card = (raw ?? {}) as Record<string, unknown>;
    const id = textField(card.id, `${at} id`, 40).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new ApiError(400, "validation_error", `${at} id must use lowercase letters, numbers and hyphens.`);
    }
    if (seen.has(id)) throw new ApiError(400, "validation_error", `Discovery card id “${id}” is duplicated.`);
    seen.add(id);

    const label = textField(card.label, `${at} label`, 40);
    if (!label) throw new ApiError(400, "validation_error", `${at} needs a label.`);
    const description = textField(card.description, `${at} description`, 120);
    const href = textField(card.href, `${at} link`, 200);
    if (!isAllowedDiscoveryCardHref(href)) {
      throw new ApiError(400, "validation_error", `${at} must link to an implemented NaijaDeals destination.`);
    }
    const imageUrl = textField(card.imageUrl, `${at} image`, 300);
    const imageError = discoveryImagePathError(imageUrl);
    if (imageError) throw new ApiError(400, "validation_error", `${at}: ${imageError}`);
    if (!discoveryImageExists(imageUrl)) {
      throw new ApiError(400, "validation_error", `${at} image does not exist in this deployment.`);
    }
    const imageAlt = textField(card.imageAlt, `${at} image alt`, 120);
    if (!imageAlt) throw new ApiError(400, "validation_error", `${at} needs image alt text.`);
    const enabled = boolField(card.enabled, `${at} enabled`);
    const sortOrder = card.sortOrder === undefined ? index + 1 : Number(card.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      throw new ApiError(400, "validation_error", `${at} order must be an integer between 0 and 999.`);
    }
    return { id, label, description, href, imageUrl, imageAlt, enabled, sortOrder };
  });

  return cards
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .slice(0, MAX_DISCOVERY_CARDS)
    .map((card, index) => ({ ...card, sortOrder: index + 1 }));
}

function discoveryLinksField(value: unknown, slugs: Set<string>): StorefrontDiscoveryLink[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "Discovery links must be a list.");
  if (value.length > MAX_DISCOVERY_LINKS) {
    throw new ApiError(400, "validation_error", `Configure at most ${MAX_DISCOVERY_LINKS} discovery links.`);
  }
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const at = `Discovery link ${index + 1}`;
    const link = (raw ?? {}) as Record<string, unknown>;
    const label = textField(link.label, `${at} label`, 40);
    if (!label) throw new ApiError(400, "validation_error", `${at} needs a label.`);
    const href = textField(link.href, `${at} link`, 200);
    if (!isAfricanCategoryHref(href)) {
      throw new ApiError(400, "validation_error", `${at} must be an internal NaijaShop category link.`);
    }
    if (seen.has(href)) throw new ApiError(400, "validation_error", `${at} repeats another link.`);
    seen.add(href);
    const slug = href.slice("/naijashop/c/".length);
    if (!slugs.has(slug)) throw new ApiError(400, "validation_error", `${at} points at an unknown category: ${slug}`);
    return { label, href };
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
  if (input.showAfricanDiscovery !== undefined) next.showAfricanDiscovery = boolField(input.showAfricanDiscovery, "Show African discovery");
  if (input.africanFeaturedProductIds !== undefined) next.africanFeaturedProductIds = await featuredField(input.africanFeaturedProductIds);
  if (input.africanDiscoveryEyebrow !== undefined) next.africanDiscoveryEyebrow = textField(input.africanDiscoveryEyebrow, "Discovery eyebrow", 40);
  if (input.africanDiscoveryTitle !== undefined) {
    next.africanDiscoveryTitle = textField(input.africanDiscoveryTitle, "Discovery heading", 90);
    if (!next.africanDiscoveryTitle) throw new ApiError(400, "validation_error", "Discovery heading is required.");
  }
  if (input.africanDiscoveryIntro !== undefined) next.africanDiscoveryIntro = textField(input.africanDiscoveryIntro, "Discovery intro", 240);
  if (input.discoveryCards !== undefined) next.discoveryCards = discoveryCardsField(input.discoveryCards);

  const slugs = new Set((await prisma.category.findMany({ select: { slug: true } })).map((row) => row.slug));
  for (const slug of [...next.visibleCategories, ...next.categoryOrder]) {
    if (!slugs.has(slug)) throw new ApiError(400, "validation_error", `Unknown department slug: ${slug}`);
  }
  if (input.africanDiscoveryLinks !== undefined) next.africanDiscoveryLinks = discoveryLinksField(input.africanDiscoveryLinks, slugs);
  return next;
}

/* ------------------------------------------------------------------------- */
/* Stored config normalisation                                               */
/* ------------------------------------------------------------------------- */

function storedString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function storedBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function storedStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return fallback;
  return value.map((item) => item.trim()).filter(Boolean);
}

function storedVersion(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function storedCards(value: unknown): StorefrontDiscoveryCard[] {
  if (value === undefined || !Array.isArray(value)) return DEFAULT_DISCOVERY_CARDS.map((card) => ({ ...card }));
  // A stored row is repaired, not trusted. Invalid entries are dropped so a
  // hand-edited legacy value cannot render an external or broken card.
  const cards: StorefrontDiscoveryCard[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    const href = typeof raw.href === "string" ? raw.href.trim() : "";
    const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl.trim() : "";
    const imageAlt = typeof raw.imageAlt === "string" ? raw.imageAlt.trim() : "";
    const sortOrder = Number(raw.sortOrder);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !label || !isAllowedDiscoveryCardHref(href)) continue;
    if (discoveryImagePathError(imageUrl)) continue;
    if (!imageAlt) continue;
    cards.push({
      id,
      label,
      description,
      href,
      imageUrl,
      imageAlt,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
      sortOrder: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : cards.length + 1
    });
  }
  return cards
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .slice(0, MAX_DISCOVERY_CARDS)
    .map((card, index) => ({ ...card, sortOrder: index + 1 }));
}

function storedLinks(value: unknown): StorefrontDiscoveryLink[] {
  if (value === undefined || !Array.isArray(value)) return DEFAULT_AFRICAN_DISCOVERY_COPY.links.map((link) => ({ ...link }));
  const links: StorefrontDiscoveryLink[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const href = typeof raw.href === "string" ? raw.href.trim() : "";
    if (!label || !isAfricanCategoryHref(href)) continue;
    links.push({ label, href });
  }
  return links.slice(0, MAX_DISCOVERY_LINKS);
}

function storedHeroSlides(value: unknown): StorefrontHeroSlide[] {
  if (!Array.isArray(value)) return [];
  return value.filter((slide): slide is StorefrontHeroSlide => {
    if (!isRecord(slide)) return false;
    return typeof slide.id === "string" && typeof slide.headline === "string" && typeof slide.ctaHref === "string" && typeof slide.imageUrl === "string";
  });
}

/**
 * Build the published config from a stored JSON object. Unknown keys (in
 * particular the `draft` envelope) are deliberately dropped, which is what
 * keeps an unpublished draft out of the public projection.
 */
function normalizeStoredConfig(raw: RawConfig | null): StorefrontConfig {
  const source = raw ?? {};
  return {
    announcement: storedString(source.announcement, DEFAULT_STOREFRONT.announcement),
    heroTitle: storedString(source.heroTitle, DEFAULT_STOREFRONT.heroTitle),
    heroSubtitle: storedString(source.heroSubtitle, DEFAULT_STOREFRONT.heroSubtitle),
    visibleCategories: storedStringList(source.visibleCategories, []),
    categoryOrder: storedStringList(source.categoryOrder, []),
    shelfLimit: (() => {
      const value = Number(source.shelfLimit);
      return Number.isInteger(value) && value >= 1 && value <= 8 ? value : DEFAULT_STOREFRONT.shelfLimit;
    })(),
    showDemoProducts: storedBool(source.showDemoProducts, DEFAULT_STOREFRONT.showDemoProducts),
    showHero: storedBool(source.showHero, DEFAULT_STOREFRONT.showHero),
    showShelves: storedBool(source.showShelves, DEFAULT_STOREFRONT.showShelves),
    heroSlides: storedHeroSlides(source.heroSlides),
    showAfricanDiscovery: storedBool(source.showAfricanDiscovery, DEFAULT_STOREFRONT.showAfricanDiscovery),
    africanFeaturedProductIds: storedStringList(source.africanFeaturedProductIds, []).slice(0, MAX_AFRICAN_FEATURED_PRODUCTS),
    africanDiscoveryEyebrow: storedString(source.africanDiscoveryEyebrow, DEFAULT_STOREFRONT.africanDiscoveryEyebrow),
    africanDiscoveryTitle: storedString(source.africanDiscoveryTitle, DEFAULT_STOREFRONT.africanDiscoveryTitle),
    africanDiscoveryIntro: storedString(source.africanDiscoveryIntro, DEFAULT_STOREFRONT.africanDiscoveryIntro),
    africanDiscoveryLinks: storedLinks(source.africanDiscoveryLinks),
    discoveryCards: storedCards(source.discoveryCards),
    version: storedVersion(source.version)
  };
}

type StoredDraft = {
  config: StorefrontConfig;
  savedBy: string | null;
  savedAt: string | null;
};

function readDraft(raw: RawConfig | null): StoredDraft | null {
  if (!raw || !isRecord(raw.draft)) return null;
  const envelope = raw.draft;
  if (!isRecord(envelope.config)) return null;
  return {
    config: normalizeStoredConfig(envelope.config),
    savedBy: typeof envelope.savedBy === "string" ? envelope.savedBy : null,
    savedAt: typeof envelope.savedAt === "string" ? envelope.savedAt : null
  };
}

async function readStored(): Promise<{ published: StorefrontConfig; draft: StoredDraft | null }> {
  const rows = await prisma.$queryRaw<Array<{ config: unknown }>>`
    SELECT config FROM "StorefrontConfig" WHERE id = 'default' LIMIT 1`;
  const raw = rows[0] && isRecord(rows[0].config) ? rows[0].config : null;
  return { published: normalizeStoredConfig(raw), draft: readDraft(raw) };
}

/* ------------------------------------------------------------------------- */
/* Read APIs                                                                 */
/* ------------------------------------------------------------------------- */

/** Published configuration only. Never returns an unpublished draft. */
export async function getStorefrontConfig(): Promise<StorefrontConfig> {
  return (await readStored()).published;
}

/** Authorized Control Center view: published config plus the operator draft. */
export async function getStorefrontAdminState(): Promise<StorefrontAdminState> {
  const { published, draft } = await readStored();
  return {
    published,
    draft: draft?.config ?? null,
    draftSavedBy: draft?.savedBy ?? null,
    draftSavedAt: draft?.savedAt ?? null
  };
}

/** Draft preview for authorized staff. Anonymous callers are stopped by the route. */
export async function getStorefrontPreview() {
  const { published, draft } = await readStored();
  return {
    published,
    preview: draft?.config ?? published,
    isDraft: Boolean(draft),
    draftSavedBy: draft?.savedBy ?? null,
    draftSavedAt: draft?.savedAt ?? null
  };
}

export async function listAfricanFeatureCandidates(): Promise<AfricanFeatureCandidate[]> {
  const rows = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      isSample: false,
      category: { slug: { in: [...AFRICAN_FEATURE_SLUGS] } }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      priceKobo: true,
      isDemo: true,
      category: { select: { name: true, slug: true } },
      images: { select: { url: true, alt: true }, orderBy: { sortOrder: "asc" }, take: 1 }
    },
    orderBy: { name: "asc" },
    take: 40
  });
  return rows
    .filter((row) => !FIXTURE_LISTING.test(row.name) && !FIXTURE_LISTING.test(row.slug))
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      categoryName: row.category.name,
      categorySlug: row.category.slug,
      priceKobo: row.priceKobo.toString(),
      isDemo: row.isDemo,
      imageUrl: row.images[0]?.url ?? null,
      imageAlt: row.images[0]?.alt ?? row.name
    }));
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                    */
/* ------------------------------------------------------------------------- */

function changedFields(before: StorefrontConfig, after: StorefrontConfig) {
  return Object.fromEntries(
    STOREFRONT_KEYS.filter((key) => key !== "version" && JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => [
      key,
      { before: before[key], after: after[key] }
    ])
  );
}

async function auditChange(
  adminId: string,
  action: "storefront.updated" | "storefront.draft_saved" | "storefront.published" | "storefront.draft_discarded",
  before: StorefrontConfig,
  after: StorefrontConfig,
  extra: Record<string, unknown> = {}
) {
  await recordAudit({
    actorId: adminId,
    action,
    entity: "StorefrontConfig",
    entityId: "default",
    metadata: JSON.parse(
      JSON.stringify({
        versionBefore: before.version,
        versionAfter: after.version,
        changes: changedFields(before, after),
        ...extra
      })
    )
  });
}

/**
 * Legacy direct publish used by PATCH without a mode. It remains available for
 * existing clients and validates exactly the same way as the draft path.
 */
export async function updateStorefrontConfig(adminId: string, input: Record<string, unknown>) {
  const { published: current, draft } = await readStored();
  if (draft) {
    throw new ApiError(409, "draft_exists", "A storefront draft is waiting. Publish or discard it before using the legacy direct-save path.");
  }
  const expected = Number(input.version);
  if (!Number.isInteger(expected) || expected !== current.version) {
    throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");
  }
  const next = await validate(input, current);
  next.version = current.version + 1;

  const updated = await prisma.$executeRaw`
    INSERT INTO "StorefrontConfig" (id, config, "updatedBy", "updatedAt")
    VALUES ('default', ${JSON.stringify(next)}::jsonb, ${adminId}, NOW())
    ON CONFLICT (id) DO UPDATE
    SET config = ${JSON.stringify(next)}::jsonb, "updatedBy" = ${adminId}, "updatedAt" = NOW()
    WHERE COALESCE(("StorefrontConfig".config->>'version')::int, 1) = ${current.version}`;
  if (updated === 0) throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");

  await auditChange(adminId, "storefront.updated", current, next);
  return next;
}

/**
 * Save an operator draft. The draft is stored under a `draft` key in the same
 * JSONB row as the published config; `normalizeStoredConfig` and the public
 * projection both drop it, so it cannot leak through `/api/storefront`.
 */
export async function saveStorefrontDraft(adminId: string, input: Record<string, unknown>) {
  const { published: current, draft: existing } = await readStored();
  const expected = Number(input.version);
  if (!Number.isInteger(expected) || expected !== current.version) {
    throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");
  }
  const next = await validate(input, existing?.config ?? current);
  next.version = current.version;

  const savedAt = new Date().toISOString();
  const row = {
    ...current,
    draft: {
      config: next,
      savedBy: adminId,
      savedAt
    }
  };
  const updated = await prisma.$executeRaw`
    INSERT INTO "StorefrontConfig" (id, config, "updatedBy", "updatedAt")
    VALUES ('default', ${JSON.stringify(row)}::jsonb, ${adminId}, NOW())
    ON CONFLICT (id) DO UPDATE
    SET config = ${JSON.stringify(row)}::jsonb, "updatedBy" = ${adminId}, "updatedAt" = NOW()
    WHERE COALESCE(("StorefrontConfig".config->>'version')::int, 1) = ${current.version}`;
  if (updated === 0) throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before saving.");

  await auditChange(adminId, "storefront.draft_saved", current, next, { publishedVersion: current.version });
  return {
    published: current,
    draft: next,
    draftSavedBy: adminId,
    draftSavedAt: savedAt
  } satisfies StorefrontAdminState;
}

/** Publish the saved draft, if it still targets the current published version. */
export async function publishStorefrontDraft(adminId: string, input: Record<string, unknown>) {
  const { published: current, draft } = await readStored();
  const expected = Number(input.baseVersion ?? input.version);
  if (!Number.isInteger(expected) || expected !== current.version) {
    throw new ApiError(409, "version_conflict", "The published storefront changed. Reload and review the draft before publishing.");
  }
  if (!draft) throw new ApiError(409, "no_draft", "There is no saved draft to publish.");
  if (draft.config.version !== current.version) {
    throw new ApiError(409, "draft_stale", "This draft was written against an older published version. Discard and recreate it.");
  }

  // Re-validate at publication time: products, categories or assets may have
  // changed since the draft was saved.
  const next = await validate({ ...draft.config } as Record<string, unknown>, current);
  next.version = current.version + 1;

  const updated = await prisma.$executeRaw`
    UPDATE "StorefrontConfig"
    SET config = ${JSON.stringify(next)}::jsonb, "updatedBy" = ${adminId}, "updatedAt" = NOW()
    WHERE id = 'default'
      AND COALESCE((config->>'version')::int, 1) = ${current.version}
      AND config ? 'draft'`;
  if (updated === 0) {
    throw new ApiError(409, "version_conflict", "The published storefront changed. Reload and review the draft before publishing.");
  }

  await auditChange(adminId, "storefront.published", current, next, { publishedFromDraft: true });
  return next;
}

/** Discard the saved draft without touching the published config or rows. */
export async function discardStorefrontDraft(adminId: string, input: Record<string, unknown> = {}) {
  const { published: current, draft } = await readStored();
  const expected = input.version === undefined ? null : Number(input.version);
  if (expected !== null && (!Number.isInteger(expected) || expected !== current.version)) {
    throw new ApiError(409, "version_conflict", "Storefront settings changed since this form loaded. Reload before discarding.");
  }
  if (!draft) {
    return {
      published: current,
      draft: null,
      draftSavedBy: null,
      draftSavedAt: null,
      discarded: false
    } satisfies StorefrontAdminState & { discarded: boolean };
  }

  const updated = await prisma.$executeRaw`
    UPDATE "StorefrontConfig"
    SET config = config - 'draft', "updatedBy" = ${adminId}, "updatedAt" = NOW()
    WHERE id = 'default'
      AND COALESCE((config->>'version')::int, 1) = ${current.version}
      AND config ? 'draft'`;
  if (updated === 0) throw new ApiError(409, "version_conflict", "The storefront changed while the draft was being discarded. Reload and try again.");

  await auditChange(adminId, "storefront.draft_discarded", current, current, { discardedDraftVersion: draft.config.version });
  return {
    published: current,
    draft: null,
    draftSavedBy: null,
    draftSavedAt: null,
    discarded: true
  } satisfies StorefrontAdminState & { discarded: boolean };
}

/**
 * Public projection: an explicit whitelist. It never spreads the stored object,
 * so a `draft` envelope or a future internal key cannot reach the browser.
 */
export function publicStorefrontConfig(config: StorefrontConfig): Omit<StorefrontConfig, "version"> {
  return {
    announcement: config.announcement,
    heroTitle: config.heroTitle,
    heroSubtitle: config.heroSubtitle,
    visibleCategories: config.visibleCategories,
    categoryOrder: config.categoryOrder,
    shelfLimit: config.shelfLimit,
    showDemoProducts: config.showDemoProducts,
    showHero: config.showHero,
    showShelves: config.showShelves,
    heroSlides: config.heroSlides,
    showAfricanDiscovery: config.showAfricanDiscovery,
    africanFeaturedProductIds: config.africanFeaturedProductIds,
    africanDiscoveryEyebrow: config.africanDiscoveryEyebrow,
    africanDiscoveryTitle: config.africanDiscoveryTitle,
    africanDiscoveryIntro: config.africanDiscoveryIntro,
    africanDiscoveryLinks: config.africanDiscoveryLinks,
    discoveryCards: config.discoveryCards
  };
}
