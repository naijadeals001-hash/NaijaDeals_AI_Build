import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * Discover Africa is editorial discovery, not a commerce-country registry.
 *
 * A published CountryProfile never enables checkout, delivery, currency,
 * language or an operating entity in that country. Only the separate
 * `COUNTRIES` commerce configuration does that. Products shown under a country
 * require a recorded origin code and basis; the seller's location is never used
 * as a substitute.
 */

export const COUNTRY_DISCOVERY_MIN_THEMES = 6;

export type CountryThemeView = {
  id: string;
  key: string;
  label: string;
  association: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageKind: string | null;
  imageProvenance: string | null;
  sortOrder: number;
  editorialStatus: "NEEDS_REVIEW" | "REVIEWED";
  sources: Array<{
    id: string;
    title: string;
    publisher: string | null;
    url: string;
    accessedAt: string;
  }>;
};

export type CountryCardView = {
  code: string;
  slug: string;
  name: string;
  region: string;
  introduction: string;
  localizedNames: Record<string, string>;
  homeFeatured: boolean;
  sortOrder: number;
  editorialStatus: "NEEDS_REVIEW" | "REVIEWED";
  themes: CountryThemeView[];
};

const themeInclude = {
  sources: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] }
} satisfies Prisma.CountryThemeInclude;

const profileInclude = {
  themes: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    include: themeInclude
  }
} satisfies Prisma.CountryProfileInclude;

type ProfileRow = Prisma.CountryProfileGetPayload<{ include: typeof profileInclude }>;

function localizedNames(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) out[key] = entry.trim();
  }
  return out;
}

function toTheme(row: ProfileRow["themes"][number]): CountryThemeView {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    association: row.association,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    imageKind: row.imageKind,
    imageProvenance: row.imageProvenance,
    sortOrder: row.sortOrder,
    editorialStatus: row.editorialStatus,
    sources: row.sources.map((source) => ({
      id: source.id,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      accessedAt: source.accessedAt.toISOString()
    }))
  };
}

function toCard(row: ProfileRow): CountryCardView {
  return {
    code: row.code,
    slug: row.slug,
    name: row.name,
    region: row.region,
    introduction: row.introduction,
    localizedNames: localizedNames(row.localizedNames),
    homeFeatured: row.homeFeatured,
    sortOrder: row.sortOrder,
    editorialStatus: row.editorialStatus,
    themes: row.themes.map(toTheme)
  };
}


/** Lightweight card payload for the Home row and directory. */
export type CountryCardThemeSummary = {
  id: string;
  key: string;
  label: string;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
};

export type CountryCardSummary = {
  code: string;
  slug: string;
  name: string;
  region: string;
  introduction: string;
  localizedNames: Record<string, string>;
  homeFeatured: boolean;
  sortOrder: number;
  editorialStatus: "NEEDS_REVIEW" | "REVIEWED";
  themes: CountryCardThemeSummary[];
};

export async function listPublishedCountryCards(): Promise<CountryCardSummary[]> {
  const rows = await prisma.countryProfile.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: {
      code: true,
      slug: true,
      name: true,
      region: true,
      introduction: true,
      localizedNames: true,
      homeFeatured: true,
      sortOrder: true,
      editorialStatus: true,
      themes: {
        select: { id: true, key: true, label: true, imageUrl: true, imageAlt: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
      }
    },
    orderBy: [{ homeFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
  });
  return rows.map((row) => ({
    code: row.code,
    slug: row.slug,
    name: row.name,
    region: row.region,
    introduction: row.introduction,
    localizedNames: localizedNames(row.localizedNames),
    homeFeatured: row.homeFeatured,
    sortOrder: row.sortOrder,
    editorialStatus: row.editorialStatus,
    themes: row.themes
  }));
}

/** All published countries with full theme sources, for a landing page. */
export async function listPublishedCountries(): Promise<CountryCardView[]> {
  const rows = await prisma.countryProfile.findMany({
    where: { publicationStatus: "PUBLISHED" },
    include: profileInclude,
    orderBy: [{ homeFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
  });
  return rows.map(toCard);
}

/** The country is resolved by its stable slug, never by a display name. */
export async function getPublishedCountry(slug: string): Promise<CountryCardView | null> {
  const row = await prisma.countryProfile.findFirst({
    where: { slug, publicationStatus: "PUBLISHED" },
    include: profileInclude
  });
  return row ? toCard(row) : null;
}

/** A draft preview is callable only after the route checks an editorial permission. */
export async function getCountryForPreview(slug: string): Promise<CountryCardView | null> {
  const row = await prisma.countryProfile.findFirst({ where: { slug }, include: profileInclude });
  return row ? toCard(row) : null;
}

export type CountryOriginProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  brand: string | null;
  priceKobo: number;
  compareAtKobo: number | null;
  isDemo: boolean;
  saleMode: "escrow" | "contact";
  originCountryCode: string;
  originBasis: "SELLER_DECLARED" | "VERIFIED";
  originNote: string | null;
  originVerifiedAt: string | null;
  category: { id: string; name: string; slug: string };
  vendor: { id: string; name: string; slug: string; market: string; status: string };
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
  variants: Array<{ id: string; name: string; sku: string; priceKobo: number; stock: number; reserved: number; isActive: boolean }>;
  stock: { quantity: number; reserved: number } | null;
  available: number;
};

/**
 * Listings explicitly recorded as originating in this country.
 *
 * Filters intentionally do NOT include `vendor.countryCode`. A Ghanaian seller
 * may sell goods made elsewhere; seller location is not origin evidence.
 */
export async function listCountryOriginProducts(code: string, take = 12): Promise<CountryOriginProduct[]> {
  const rows = await prisma.product.findMany({
    where: {
      originCountryCode: code,
      originBasis: { in: ["SELLER_DECLARED", "VERIFIED"] },
      status: "ACTIVE",
      isSample: false,
      vendor: { status: "VERIFIED" },
      category: { isActive: true, deprecatedAt: null }
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      vendor: { select: { id: true, name: true, slug: true, market: true, status: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      stock: true,
      variants: { where: { isActive: true }, orderBy: { name: "asc" } }
    },
    orderBy: [{ originBasis: "desc" }, { createdAt: "desc" }],
    take
  });

  return rows.map((row) => {
    const variantStock = row.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock - variant.reserved), 0);
    const productStock = row.stock ? Math.max(0, row.stock.quantity - row.stock.reserved) : 0;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      brand: row.brand,
      priceKobo: Number(row.priceKobo),
      compareAtKobo: row.compareAtKobo === null ? null : Number(row.compareAtKobo),
      isDemo: row.isDemo,
      saleMode: row.saleMode === "contact" ? "contact" : "escrow",
      originCountryCode: code,
      originBasis: row.originBasis === "VERIFIED" ? "VERIFIED" : "SELLER_DECLARED",
      originNote: row.originNote,
      originVerifiedAt: row.originVerifiedAt?.toISOString() ?? null,
      category: row.category,
      vendor: row.vendor,
      images: row.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, sortOrder: image.sortOrder })),
      variants: row.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        priceKobo: Number(variant.priceKobo),
        stock: variant.stock,
        reserved: variant.reserved,
        isActive: variant.isActive
      })),
      stock: row.stock ? { quantity: row.stock.quantity, reserved: row.stock.reserved } : null,
      available: row.variants.length > 0 ? variantStock : productStock
    };
  });
}

/** Participating sellers are derived only from recorded-origin listings. */
export async function listCountrySellers(code: string) {
  const rows = await prisma.product.findMany({
    where: {
      originCountryCode: code,
      originBasis: { in: ["SELLER_DECLARED", "VERIFIED"] },
      status: "ACTIVE",
      isSample: false,
      vendor: { status: "VERIFIED" }
    },
    distinct: ["vendorId"],
    select: { vendor: { select: { id: true, name: true, slug: true, market: true } } }
  });
  return rows.map((row) => row.vendor);
}

export async function listCountryCategories(code: string) {
  const rows = await prisma.product.findMany({
    where: {
      originCountryCode: code,
      originBasis: { in: ["SELLER_DECLARED", "VERIFIED"] },
      status: "ACTIVE",
      isSample: false,
      vendor: { status: "VERIFIED" }
    },
    distinct: ["categoryId"],
    select: { category: { select: { id: true, name: true, slug: true } } }
  });
  return rows.map((row) => row.category);
}

export type AdminCountryRow = CountryCardView & {
  publicationStatus: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  publishedBy: string | null;
  themeCount: number;
  sourcedThemeCount: number;
  missingImageCount: number;
};

function toAdminRow(row: ProfileRow): AdminCountryRow {
  return {
    ...toCard(row),
    publicationStatus: row.publicationStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedBy: row.publishedBy,
    themeCount: row.themes.length,
    sourcedThemeCount: row.themes.filter((theme) => theme.sources.length > 0).length,
    missingImageCount: row.themes.filter((theme) => !theme.imageUrl || !theme.imageAlt).length
  };
}

export async function listAdminCountries(): Promise<AdminCountryRow[]> {
  const rows = await prisma.countryProfile.findMany({
    include: profileInclude,
    orderBy: [{ homeFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
  });
  return rows.map(toAdminRow);
}

export async function getAdminCountry(code: string): Promise<AdminCountryRow> {
  const row = await prisma.countryProfile.findUnique({ where: { code }, include: profileInclude });
  if (!row) throw new ApiError(404, "country_not_found", "Country profile not found.");
  return toAdminRow(row);
}

export type CountryProfileInput = {
  code: string;
  introduction?: string;
  editorialStatus?: "NEEDS_REVIEW" | "REVIEWED";
  homeFeatured?: boolean;
  sortOrder?: number;
};

function requiredText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) {
    throw new ApiError(400, "validation_error", `${label} must be ${min}-${max} characters.`);
  }
  return text;
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new ApiError(400, "validation_error", `${label} must be at most ${max} characters.`);
  return text || null;
}

function safeImageUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "Image URL must be text.");
  const url = value.trim();
  if (url.startsWith("/generated/") || url.startsWith("/images/")) return url;
  throw new ApiError(400, "validation_error", "Country imagery must use an approved project asset path.");
}

function editorialStatus(value: unknown): "NEEDS_REVIEW" | "REVIEWED" {
  if (value === "NEEDS_REVIEW" || value === "REVIEWED") return value;
  throw new ApiError(400, "validation_error", "Editorial status must be NEEDS_REVIEW or REVIEWED.");
}

export async function updateCountryProfile(actor: SessionUser, input: CountryProfileInput) {
  const existing = await prisma.countryProfile.findUnique({ where: { code: input.code } });
  if (!existing) throw new ApiError(404, "country_not_found", "Country profile not found.");
  if (existing.publicationStatus === "PUBLISHED" && input.editorialStatus === "NEEDS_REVIEW") {
    throw new ApiError(409, "published_country_locked", "Unpublish the country before marking it unreviewed.");
  }
  const data: Prisma.CountryProfileUpdateInput = {};
  if (input.introduction !== undefined) data.introduction = requiredText(input.introduction, "Introduction", 80, 1200);
  if (input.editorialStatus !== undefined) data.editorialStatus = editorialStatus(input.editorialStatus);
  if (input.homeFeatured !== undefined) data.homeFeatured = Boolean(input.homeFeatured);
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 10000) {
      throw new ApiError(400, "validation_error", "Sort order must be a whole number between 0 and 10000.");
    }
    data.sortOrder = input.sortOrder;
  }
  if (Object.keys(data).length === 0) return getAdminCountry(input.code);
  const updated = await prisma.countryProfile.update({ where: { code: input.code }, data });
  await recordAudit({
    actorId: actor.id,
    action: "country.editorial.update",
    entity: "CountryProfile",
    entityId: input.code,
    metadata: {
      fields: Object.keys(data),
      before: {
        introduction: existing.introduction,
        homeFeatured: existing.homeFeatured,
        sortOrder: existing.sortOrder,
        editorialStatus: existing.editorialStatus
      },
      after: {
        introduction: typeof input.introduction === "string" ? input.introduction : undefined,
        homeFeatured: input.homeFeatured,
        sortOrder: input.sortOrder,
        editorialStatus: input.editorialStatus
      }
    }
  });
  return getAdminCountry(updated.code);
}

export type CountryThemeInput = {
  themeId: string;
  label?: string;
  association?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  sortOrder?: number;
  editorialStatus?: "NEEDS_REVIEW" | "REVIEWED";
  sources?: Array<{ title?: string; publisher?: string | null; url?: string; accessedAt?: string }>;
};

export async function updateCountryTheme(actor: SessionUser, input: CountryThemeInput) {
  const theme = await prisma.countryTheme.findUnique({
    where: { id: input.themeId },
    include: { sources: true, country: { select: { publicationStatus: true } } }
  });
  if (!theme) throw new ApiError(404, "theme_not_found", "Country theme not found.");
  if (theme.country.publicationStatus === "PUBLISHED") {
    if (input.imageUrl !== undefined && !String(input.imageUrl ?? "").trim()) {
      throw new ApiError(409, "published_country_locked", "Unpublish the country before removing a published theme image.");
    }
    if (input.imageAlt !== undefined && !String(input.imageAlt ?? "").trim()) {
      throw new ApiError(409, "published_country_locked", "A published theme needs alt text. Unpublish before removing it.");
    }
    if (input.editorialStatus === "NEEDS_REVIEW") {
      throw new ApiError(409, "published_country_locked", "Unpublish the country before marking a published theme unreviewed.");
    }
  }
  const data: Prisma.CountryThemeUpdateInput = {};
  if (input.label !== undefined) data.label = requiredText(input.label, "Theme label", 2, 80);
  if (input.association !== undefined) data.association = requiredText(input.association, "Association", 20, 900);
  if (input.imageUrl !== undefined) data.imageUrl = safeImageUrl(input.imageUrl);
  if (input.imageAlt !== undefined) data.imageAlt = optionalText(input.imageAlt, "Image alt text", 220);
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 1000) {
      throw new ApiError(400, "validation_error", "Theme sort order must be between 0 and 1000.");
    }
    data.sortOrder = input.sortOrder;
  }
  if (input.editorialStatus !== undefined) data.editorialStatus = editorialStatus(input.editorialStatus);
  if (input.imageUrl && (typeof input.imageAlt !== "string" || !input.imageAlt.trim())) {
    throw new ApiError(400, "validation_error", "An image needs accessible alt text.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.countryTheme.update({ where: { id: input.themeId }, data });
    if (input.sources !== undefined) {
      if (!Array.isArray(input.sources) || input.sources.length === 0) {
        throw new ApiError(400, "validation_error", "A published theme needs at least one source record.");
      }
      await tx.countryThemeSource.deleteMany({ where: { themeId: input.themeId } });
      const seen = new Set<string>();
      for (const [index, source] of input.sources.entries()) {
        const title = requiredText(source.title, "Source title", 2, 240);
        const url = requiredText(source.url, "Source URL", 8, 1000);
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new ApiError(400, "validation_error", "Source URL must be an absolute http(s) URL.");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new ApiError(400, "validation_error", "Source URL must use http or https.");
        }
        if (seen.has(url)) throw new ApiError(400, "validation_error", "A source URL is duplicated.");
        seen.add(url);
        const dateText = source.accessedAt || new Date().toISOString().slice(0, 10);
        const accessedAt = new Date(`${dateText}T00:00:00.000Z`);
        if (Number.isNaN(accessedAt.getTime())) {
          throw new ApiError(400, "validation_error", "Source access date must be YYYY-MM-DD.");
        }
        await tx.countryThemeSource.create({
          data: {
            themeId: input.themeId,
            title,
            publisher: optionalText(source.publisher, "Publisher", 160),
            url,
            accessedAt,
            sortOrder: index
          }
        });
      }
    }
    return row;
  });

  await recordAudit({
    actorId: actor.id,
    action: "country.theme.update",
    entity: "CountryTheme",
    entityId: input.themeId,
    metadata: {
      countryCode: theme.countryCode,
      key: theme.key,
      fields: Object.keys(input),
      sourcesReplaced: input.sources !== undefined
    }
  });
  return getAdminCountry(theme.countryCode);
}

export async function publishCountry(actor: SessionUser, code: string) {
  const row = await prisma.countryProfile.findUnique({ where: { code }, include: profileInclude });
  if (!row) throw new ApiError(404, "country_not_found", "Country profile not found.");
  if (!row.introduction.trim()) throw new ApiError(409, "country_incomplete", "The country introduction is empty.");
  if (row.themes.length < COUNTRY_DISCOVERY_MIN_THEMES) {
    throw new ApiError(409, "country_incomplete", `At least ${COUNTRY_DISCOVERY_MIN_THEMES} themes are required to publish.`);
  }
  const unsourced = row.themes.filter((theme) => theme.sources.length === 0);
  if (unsourced.length > 0) {
    throw new ApiError(409, "country_incomplete", "Every theme needs at least one source record before publication.", {
      themes: unsourced.map((theme) => theme.key)
    });
  }
  const missingImages = row.themes.filter((theme) => !theme.imageUrl || !theme.imageAlt);
  if (missingImages.length > 0) {
    throw new ApiError(409, "country_incomplete", "Every published theme needs an image and alt text.", {
      themes: missingImages.map((theme) => theme.key)
    });
  }
  if (row.themes.some((theme) => theme.editorialStatus !== "REVIEWED")) {
    throw new ApiError(409, "country_incomplete", "All themes must be editorially reviewed before publication.");
  }
  if (row.editorialStatus !== "REVIEWED") {
    throw new ApiError(409, "country_incomplete", "The country editorial review must be complete before publication.");
  }
  await prisma.countryProfile.update({
    where: { code },
    data: { publicationStatus: "PUBLISHED", publishedAt: new Date(), publishedBy: actor.id }
  });
  await recordAudit({
    actorId: actor.id,
    action: "country.publish",
    entity: "CountryProfile",
    entityId: code,
    metadata: { themes: row.themes.length, sources: row.themes.reduce((sum, theme) => sum + theme.sources.length, 0) }
  });
  return getAdminCountry(code);
}

export async function unpublishCountry(actor: SessionUser, code: string) {
  const row = await prisma.countryProfile.findUnique({ where: { code } });
  if (!row) throw new ApiError(404, "country_not_found", "Country profile not found.");
  await prisma.countryProfile.update({
    where: { code },
    data: { publicationStatus: "DRAFT", publishedAt: null, publishedBy: null }
  });
  await recordAudit({
    actorId: actor.id,
    action: "country.unpublish",
    entity: "CountryProfile",
    entityId: code,
    metadata: { preservedThemes: true, preservedOriginProducts: true }
  });
  return getAdminCountry(code);
}

export type OriginInput = {
  productId: string;
  originCountryCode: string | null;
  originBasis: "SELLER_DECLARED" | "VERIFIED" | null;
  originNote?: string | null;
};

export async function updateProductOrigin(actor: SessionUser, input: OriginInput) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      name: true,
      countryCode: true,
      vendorId: true,
      originCountryCode: true,
      originBasis: true,
      originNote: true
    }
  });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");

  if (!input.originCountryCode || !input.originBasis) {
    if (
      actor.scopeCountryCode &&
      product.originCountryCode &&
      actor.scopeCountryCode.toUpperCase() !== product.originCountryCode.toUpperCase()
    ) {
      throw new ApiError(403, "region_forbidden", "Clearing another country's origin evidence is outside your scope.");
    }
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        originCountryCode: null,
        originBasis: null,
        originNote: null,
        originVerifiedAt: null,
        originVerifiedBy: null
      }
    });
    await recordAudit({
      actorId: actor.id,
      action: "product.origin.clear",
      entity: "Product",
      entityId: product.id,
      metadata: { before: { originCountryCode: product.originCountryCode, originBasis: product.originBasis } }
    });
    return updated;
  }

  const country = await prisma.countryProfile.findUnique({
    where: { code: input.originCountryCode },
    select: { code: true }
  });
  if (!country) throw new ApiError(400, "validation_error", "Origin must be a registered African discovery country.");
  if (actor.scopeCountryCode && actor.scopeCountryCode.toUpperCase() !== input.originCountryCode.toUpperCase()) {
    throw new ApiError(403, "region_forbidden", "Origin evidence for another country is outside your administrative scope.");
  }
  if (input.originBasis !== "SELLER_DECLARED" && input.originBasis !== "VERIFIED") {
    throw new ApiError(400, "validation_error", "Origin basis must be SELLER_DECLARED or VERIFIED.");
  }
  const note = optionalText(input.originNote, "Origin note", 500);
  if (input.originBasis === "VERIFIED" && (!note || note.length < 20)) {
    throw new ApiError(400, "validation_error", "Verified origin needs a recorded evidence note of at least 20 characters.");
  }
  const verified = input.originBasis === "VERIFIED";
  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      originCountryCode: input.originCountryCode,
      originBasis: input.originBasis,
      originNote: note,
      originVerifiedAt: verified ? new Date() : null,
      originVerifiedBy: verified ? actor.id : null
    }
  });
  await recordAudit({
    actorId: actor.id,
    action: verified ? "product.origin.verify" : "product.origin.declare",
    entity: "Product",
    entityId: product.id,
    metadata: {
      before: { originCountryCode: product.originCountryCode, originBasis: product.originBasis, originNote: product.originNote },
      after: { originCountryCode: input.originCountryCode, originBasis: input.originBasis, originNote: note }
    }
  });
  return updated;
}

export async function listProductsForOriginReview(take = 1000, countryCode?: string | null) {
  return prisma.product.findMany({
    where: { isSample: false, ...(countryCode ? { countryCode } : {}) },
    select: {
      id: true,
      name: true,
      slug: true,
      countryCode: true,
      status: true,
      isDemo: true,
      originCountryCode: true,
      originBasis: true,
      originNote: true,
      originVerifiedAt: true,
      vendor: { select: { name: true, countryCode: true } },
      category: { select: { name: true, slug: true } }
    },
    orderBy: [{ originCountryCode: "asc" }, { name: "asc" }],
    take
  });
}
