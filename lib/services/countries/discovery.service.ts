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

export async function listAdminCountries(countryCodeScope?: string | null): Promise<AdminCountryRow[]> {
  const rows = await prisma.countryProfile.findMany({
    where: countryCodeScope ? { code: countryCodeScope } : {},
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

/**
 * Provenance kinds accepted for country-theme imagery. The kind describes what
 * the asset is (generated illustration, approved existing project asset or
 * code-native illustration), never a claim about the country itself.
 */
export const COUNTRY_IMAGE_KINDS = ["GENERATED", "APPROVED_EXISTING", "ILLUSTRATION"] as const;
export type CountryImageKind = (typeof COUNTRY_IMAGE_KINDS)[number];

function imageKindValue(value: unknown): CountryImageKind {
  if (typeof value === "string" && (COUNTRY_IMAGE_KINDS as readonly string[]).includes(value)) {
    return value as CountryImageKind;
  }
  throw new ApiError(
    400,
    "validation_error",
    `Image kind must be one of ${COUNTRY_IMAGE_KINDS.join(", ")}.`
  );
}

type ValidatedThemeSource = {
  title: string;
  publisher: string | null;
  url: string;
  accessedAt: Date;
  sortOrder: number;
};

/**
 * Validate a complete replacement source set before any write. Throwing here
 * means the surrounding transaction does not touch the theme or its sources.
 */
function validateThemeSources(raw: unknown): ValidatedThemeSource[] {
  if (!Array.isArray(raw)) {
    throw new ApiError(400, "validation_error", "Sources must be a list.");
  }
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    const source = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
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
    const dateText =
      typeof source.accessedAt === "string" && source.accessedAt.trim()
        ? source.accessedAt.trim()
        : new Date().toISOString().slice(0, 10);
    const accessedAt = new Date(`${dateText}T00:00:00.000Z`);
    if (Number.isNaN(accessedAt.getTime())) {
      throw new ApiError(400, "validation_error", "Source access date must be YYYY-MM-DD.");
    }
    return {
      title,
      publisher: optionalText(source.publisher, "Publisher", 160),
      url,
      accessedAt,
      sortOrder: index
    };
  });
}

/**
 * Lock the country profile row for the rest of the transaction.
 *
 * Every country mutation takes this lock first. Publication therefore validates
 * against content no concurrent edit can change before it commits, and two
 * concurrent source replacements cannot interleave delete/insert statements.
 */
async function lockCountryProfile(tx: Prisma.TransactionClient, code: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT "code" FROM "CountryProfile" WHERE "code" = ${code} FOR UPDATE
  `;
  return rows.length > 0;
}

/** Origin review is authorised by the product's marketplace, not its origin. */
function assertProductMarketScope(actor: SessionUser, productCountryCode: string | null) {
  const scope = actor.scopeCountryCode?.trim().toUpperCase();
  if (!scope) return;
  if (!productCountryCode) return;
  if (productCountryCode.trim().toUpperCase() !== scope) {
    throw new ApiError(
      403,
      "region_forbidden",
      `This product is fulfilled in ${productCountryCode.toUpperCase()} and your administrative scope is ${scope}.`
    );
  }
}

export async function updateCountryProfile(actor: SessionUser, input: CountryProfileInput) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockCountryProfile(tx, input.code))) {
      throw new ApiError(404, "country_not_found", "Country profile not found.");
    }
    const existing = await tx.countryProfile.findUnique({ where: { code: input.code } });
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
    if (Object.keys(data).length === 0) return;
    await tx.countryProfile.update({ where: { code: input.code }, data });
    await recordAudit({
      tx,
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
          introduction: input.introduction ?? existing.introduction,
          homeFeatured: input.homeFeatured ?? existing.homeFeatured,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          editorialStatus: input.editorialStatus ?? existing.editorialStatus
        }
      }
    });
  }, { timeout: 15_000, maxWait: 10_000 });
  return getAdminCountry(input.code);
}


export type CountryThemeInput = {
  themeId: string;
  label?: string;
  association?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageKind?: string | null;
  imageProvenance?: string | null;
  sortOrder?: number;
  editorialStatus?: "NEEDS_REVIEW" | "REVIEWED";
  sources?: Array<{ title?: string; publisher?: string | null; url?: string; accessedAt?: string }>;
};

type ThemeSourceContent = {
  title: string;
  publisher: string | null;
  url: string;
  accessedAt: string;
};

function sourceContent(sources: Array<{ title: string; publisher: string | null; url: string; accessedAt: Date }>): ThemeSourceContent[] {
  return sources.map((source) => ({
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    accessedAt: source.accessedAt.toISOString().slice(0, 10)
  }));
}

export async function updateCountryTheme(actor: SessionUser, input: CountryThemeInput) {
  const owner = await prisma.countryTheme.findUnique({
    where: { id: input.themeId },
    select: { countryCode: true }
  });
  if (!owner) throw new ApiError(404, "theme_not_found", "Country theme not found.");

  const countryCode = await prisma.$transaction(async (tx) => {
    // Lock order is profile → theme → sources everywhere. Publication and the
    // seed use the same lock, so a validated publication cannot be invalidated
    // by an edit that commits between validation and publication.
    if (!(await lockCountryProfile(tx, owner.countryCode))) {
      throw new ApiError(404, "country_not_found", "Country profile not found.");
    }
    const theme = await tx.countryTheme.findUnique({
      where: { id: input.themeId },
      include: {
        sources: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        country: { select: { publicationStatus: true } }
      }
    });
    if (!theme) throw new ApiError(404, "theme_not_found", "Country theme not found.");
    const published = theme.country.publicationStatus === "PUBLISHED";

    const imageProvided = input.imageUrl !== undefined;
    const nextImageUrl = imageProvided ? safeImageUrl(input.imageUrl) : theme.imageUrl;
    const nextImageAlt =
      input.imageAlt !== undefined ? optionalText(input.imageAlt, "Image alt text", 220) : theme.imageAlt;
    const nextImageKind =
      input.imageKind !== undefined
        ? input.imageKind === null || String(input.imageKind).trim() === ""
          ? null
          : imageKindValue(input.imageKind)
        : theme.imageKind;
    const nextImageProvenance =
      input.imageProvenance !== undefined
        ? optionalText(input.imageProvenance, "Image provenance", 400)
        : theme.imageProvenance;
    const imageChanged = imageProvided && (nextImageUrl ?? null) !== (theme.imageUrl ?? null);

    if (published) {
      if (imageProvided && !nextImageUrl) {
        throw new ApiError(409, "published_country_locked", "Unpublish the country before removing a published theme image.");
      }
      if (input.imageAlt !== undefined && !nextImageAlt) {
        throw new ApiError(409, "published_country_locked", "A published theme needs alt text. Unpublish before removing it.");
      }
      if (input.imageKind !== undefined && !nextImageKind) {
        throw new ApiError(409, "published_country_locked", "A published theme needs an image kind. Unpublish before removing it.");
      }
      if (input.imageProvenance !== undefined && !nextImageProvenance) {
        throw new ApiError(
          409,
          "published_country_locked",
          "A published theme needs recorded image provenance. Unpublish before removing it."
        );
      }
      if (input.editorialStatus === "NEEDS_REVIEW") {
        throw new ApiError(409, "published_country_locked", "Unpublish the country before marking a published theme unreviewed.");
      }
    }

    if (imageChanged && nextImageUrl) {
      if (typeof input.imageAlt !== "string" || !input.imageAlt.trim()) {
        throw new ApiError(400, "validation_error", "A changed image needs matching alt text in the same update.");
      }
      if (!input.imageKind || !input.imageKind.trim()) {
        throw new ApiError(
          400,
          "validation_error",
          "A changed image needs its provenance kind (GENERATED, APPROVED_EXISTING or ILLUSTRATION) in the same update."
        );
      }
      if (!input.imageProvenance || input.imageProvenance.trim().length < 10) {
        throw new ApiError(
          400,
          "validation_error",
          "A changed image needs recorded provenance of at least 10 characters in the same update."
        );
      }
    }
    if (imageProvided && nextImageUrl && !nextImageAlt) {
      throw new ApiError(400, "validation_error", "An image needs accessible alt text.");
    }
    if ((input.imageKind !== undefined || input.imageProvenance !== undefined) && !nextImageUrl) {
      throw new ApiError(400, "validation_error", "Image kind and provenance require an image.");
    }

    const data: Prisma.CountryThemeUpdateInput = {};
    if (input.label !== undefined) data.label = requiredText(input.label, "Theme label", 2, 80);
    if (input.association !== undefined) data.association = requiredText(input.association, "Association", 20, 900);
    if (imageProvided) data.imageUrl = nextImageUrl;
    if (input.imageAlt !== undefined) data.imageAlt = nextImageAlt;
    if (input.imageKind !== undefined) data.imageKind = nextImageKind;
    if (input.imageProvenance !== undefined) data.imageProvenance = nextImageProvenance;
    if (input.sortOrder !== undefined) {
      if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 1000) {
        throw new ApiError(400, "validation_error", "Theme sort order must be between 0 and 1000.");
      }
      data.sortOrder = input.sortOrder;
    }
    if (input.editorialStatus !== undefined) data.editorialStatus = editorialStatus(input.editorialStatus);

    let validatedSources: ValidatedThemeSource[] | undefined;
    if (input.sources !== undefined) {
      if (!Array.isArray(input.sources) || input.sources.length === 0) {
        if (published) {
          throw new ApiError(
            409,
            "published_country_locked",
            "A published theme needs at least one source record. Unpublish before removing sources."
          );
        }
        throw new ApiError(400, "validation_error", "A country theme needs at least one source record.");
      }
      validatedSources = validateThemeSources(input.sources);
    }

    const sourcesAfter = validatedSources ? validatedSources.length : theme.sources.length;
    if (published && (!nextImageUrl || !nextImageAlt || !nextImageKind || !nextImageProvenance || sourcesAfter === 0)) {
      throw new ApiError(
        409,
        "published_theme_incomplete",
        "A published theme needs an image, alt text, image provenance and at least one source. The update was refused without changing the theme."
      );
    }

    const beforeContent = {
      label: theme.label,
      association: theme.association,
      imageUrl: theme.imageUrl,
      imageAlt: theme.imageAlt,
      imageKind: theme.imageKind,
      imageProvenance: theme.imageProvenance,
      editorialStatus: theme.editorialStatus,
      sources: sourceContent(theme.sources)
    };
    const afterContent = {
      label: typeof data.label === "string" ? data.label : theme.label,
      association: typeof data.association === "string" ? data.association : theme.association,
      imageUrl: imageProvided ? nextImageUrl : theme.imageUrl,
      imageAlt: input.imageAlt !== undefined ? nextImageAlt : theme.imageAlt,
      imageKind: input.imageKind !== undefined ? nextImageKind : theme.imageKind,
      imageProvenance: input.imageProvenance !== undefined ? nextImageProvenance : theme.imageProvenance,
      editorialStatus: input.editorialStatus ?? theme.editorialStatus,
      sources: validatedSources
        ? validatedSources.map((source) => ({
            title: source.title,
            publisher: source.publisher,
            url: source.url,
            accessedAt: source.accessedAt.toISOString().slice(0, 10)
          }))
        : beforeContent.sources
    };

    await tx.countryTheme.update({ where: { id: input.themeId }, data });
    if (validatedSources) {
      // Delete-and-insert stays inside one serialized transaction. The profile
      // row lock means no other replacement is between these statements.
      await tx.countryThemeSource.deleteMany({ where: { themeId: input.themeId } });
      await tx.countryThemeSource.createMany({
        data: validatedSources.map((source) => ({
          themeId: input.themeId,
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          accessedAt: source.accessedAt,
          sortOrder: source.sortOrder
        }))
      });
    }

    await recordAudit({
      tx,
      actorId: actor.id,
      action: "country.theme.update",
      entity: "CountryTheme",
      entityId: input.themeId,
      metadata: {
        countryCode: theme.countryCode,
        key: theme.key,
        fields: Object.keys(input),
        sourcesReplaced: validatedSources !== undefined,
        before: beforeContent,
        after: afterContent
      }
    });

    return theme.countryCode;
  }, { timeout: 15_000, maxWait: 10_000 });

  return getAdminCountry(countryCode);
}


export async function publishCountry(actor: SessionUser, code: string) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockCountryProfile(tx, code))) {
      throw new ApiError(404, "country_not_found", "Country profile not found.");
    }
    // Read and validate after the lock: a concurrent theme edit either commits
    // before this snapshot or waits until publication commits.
    const row = await tx.countryProfile.findUnique({ where: { code }, include: profileInclude });
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
    const missingProvenance = row.themes.filter((theme) => !theme.imageKind || !theme.imageProvenance);
    if (missingProvenance.length > 0) {
      throw new ApiError(409, "country_incomplete", "Every published theme needs recorded image provenance.", {
        themes: missingProvenance.map((theme) => theme.key)
      });
    }
    if (row.themes.some((theme) => theme.editorialStatus !== "REVIEWED")) {
      throw new ApiError(409, "country_incomplete", "All themes must be editorially reviewed before publication.");
    }
    if (row.editorialStatus !== "REVIEWED") {
      throw new ApiError(409, "country_incomplete", "The country editorial review must be complete before publication.");
    }
    const themeCount = row.themes.length;
    const sourceCount = row.themes.reduce((sum, theme) => sum + theme.sources.length, 0);
    await tx.countryProfile.update({
      where: { code },
      data: { publicationStatus: "PUBLISHED", publishedAt: new Date(), publishedBy: actor.id }
    });
    await recordAudit({
      tx,
      actorId: actor.id,
      action: "country.publish",
      entity: "CountryProfile",
      entityId: code,
      metadata: {
        themes: themeCount,
        sources: sourceCount,
        before: { publicationStatus: row.publicationStatus, publishedAt: row.publishedAt?.toISOString() ?? null },
        after: { publicationStatus: "PUBLISHED" }
      }
    });
  }, { timeout: 15_000, maxWait: 10_000 });
  return getAdminCountry(code);
}

export async function unpublishCountry(actor: SessionUser, code: string) {
  await prisma.$transaction(async (tx) => {
    if (!(await lockCountryProfile(tx, code))) {
      throw new ApiError(404, "country_not_found", "Country profile not found.");
    }
    const row = await tx.countryProfile.findUnique({
      where: { code },
      select: { publicationStatus: true, publishedAt: true }
    });
    if (!row) throw new ApiError(404, "country_not_found", "Country profile not found.");
    await tx.countryProfile.update({
      where: { code },
      data: { publicationStatus: "DRAFT", publishedAt: null, publishedBy: null }
    });
    await recordAudit({
      tx,
      actorId: actor.id,
      action: "country.unpublish",
      entity: "CountryProfile",
      entityId: code,
      metadata: {
        preservedThemes: true,
        preservedOriginProducts: true,
        before: { publicationStatus: row.publicationStatus, publishedAt: row.publishedAt?.toISOString() ?? null },
        after: { publicationStatus: "DRAFT" }
      }
    });
  }, { timeout: 15_000, maxWait: 10_000 });
  return getAdminCountry(code);
}


export type OriginInput = {
  productId: string;
  originCountryCode: string | null;
  originBasis: "SELLER_DECLARED" | "VERIFIED" | null;
  originNote?: string | null;
};

type LockedOriginProduct = {
  id: string;
  name: string;
  countryCode: string;
  originCountryCode: string | null;
  originBasis: string | null;
  originNote: string | null;
};

export async function updateProductOrigin(actor: SessionUser, input: OriginInput) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedOriginProduct[]>`
      SELECT "id", "name", "countryCode", "originCountryCode", "originBasis", "originNote"
        FROM "Product"
       WHERE "id" = ${input.productId}
       FOR UPDATE
    `;
    const product = rows[0];
    if (!product) throw new ApiError(404, "product_not_found", "Product not found.");

    // Authorisation follows the product's marketplace (who owns the listing),
    // never equality between the origin country and the reviewer's scope. A
    // product fulfilled in one market may legitimately originate elsewhere.
    assertProductMarketScope(actor, product.countryCode);

    if (!input.originCountryCode || !input.originBasis) {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          originCountryCode: null,
          originBasis: null,
          originNote: null,
          originVerifiedAt: null,
          originVerifiedBy: null
        },
        select: {
          id: true,
          name: true,
          countryCode: true,
          originCountryCode: true,
          originBasis: true,
          originNote: true,
          originVerifiedAt: true
        }
      });
      await recordAudit({
        tx,
        actorId: actor.id,
        action: "product.origin.clear",
        entity: "Product",
        entityId: product.id,
        metadata: {
          productMarket: product.countryCode,
          before: {
            originCountryCode: product.originCountryCode,
            originBasis: product.originBasis,
            originNote: product.originNote
          },
          after: { originCountryCode: null, originBasis: null, originNote: null }
        }
      });
      return updated;
    }

    const country = await tx.countryProfile.findUnique({
      where: { code: input.originCountryCode },
      select: { code: true }
    });
    if (!country) throw new ApiError(400, "validation_error", "Origin must be a registered African discovery country.");
    if (input.originBasis !== "SELLER_DECLARED" && input.originBasis !== "VERIFIED") {
      throw new ApiError(400, "validation_error", "Origin basis must be SELLER_DECLARED or VERIFIED.");
    }
    const note = optionalText(input.originNote, "Origin note", 500);
    if (input.originBasis === "VERIFIED" && (!note || note.length < 20)) {
      throw new ApiError(400, "validation_error", "Verified origin needs a recorded evidence note of at least 20 characters.");
    }
    const verified = input.originBasis === "VERIFIED";
    const updated = await tx.product.update({
      where: { id: product.id },
      data: {
        originCountryCode: input.originCountryCode,
        originBasis: input.originBasis,
        originNote: note,
        originVerifiedAt: verified ? new Date() : null,
        originVerifiedBy: verified ? actor.id : null
      },
      select: {
        id: true,
        name: true,
        countryCode: true,
        originCountryCode: true,
        originBasis: true,
        originNote: true,
        originVerifiedAt: true
      }
    });
    await recordAudit({
      tx,
      actorId: actor.id,
      action: verified ? "product.origin.verify" : "product.origin.declare",
      entity: "Product",
      entityId: product.id,
      metadata: {
        productMarket: product.countryCode,
        before: {
          originCountryCode: product.originCountryCode,
          originBasis: product.originBasis,
          originNote: product.originNote
        },
        after: { originCountryCode: input.originCountryCode, originBasis: input.originBasis, originNote: note }
      }
    });
    return updated;
  }, { timeout: 15_000, maxWait: 10_000 });
}

export type OriginReviewFilters = {
  page?: number;
  pageSize?: number;
  search?: string | null;
  /** all | recorded | unrecorded */
  origin?: string | null;
  /** all | SELLER_DECLARED | VERIFIED */
  basis?: string | null;
  /** Marketplace fulfilment country. */
  market?: string | null;
  /** Server-enforced scope from the signed-in reviewer's account. */
  countryCodeScope?: string | null;
};

export type OriginReviewPage = {
  rows: Array<{
    id: string;
    name: string;
    slug: string;
    countryCode: string;
    status: string;
    isDemo: boolean;
    originCountryCode: string | null;
    originBasis: string | null;
    originNote: string | null;
    originVerifiedAt: Date | null;
    vendor: { name: string; countryCode: string };
    category: { name: string; slug: string };
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: { total: number; recorded: number; unrecorded: number; verified: number; declared: number };
  markets: string[];
  /**
   * Discovery-country reference list for the origin selector. Country names and
   * codes are public registry metadata, not another market's draft content; a
   * scoped reviewer may legitimately record a foreign origin.
   */
  countries: Array<{ code: string; name: string }>;
};

const ORIGIN_RECORDED_WHERE: Prisma.ProductWhereInput = {
  originCountryCode: { not: null },
  originBasis: { in: ["SELLER_DECLARED", "VERIFIED"] }
};

/**
 * Server-paginated origin review queue.
 *
 * Every eligible product is reachable by paging; there is no client-side
 * 1000-row cap. Scope is applied to the product's marketplace only, so a
 * reviewer never sees another market's listings and origin is never conflated
 * with the seller's market.
 */
export async function listProductsForOriginReview(filters: OriginReviewFilters = {}): Promise<OriginReviewPage> {
  const page = Number.isFinite(filters.page) && (filters.page as number) >= 1 ? Math.floor(filters.page as number) : 1;
  const requestedSize =
    Number.isFinite(filters.pageSize) && (filters.pageSize as number) >= 1
      ? Math.floor(filters.pageSize as number)
      : 25;
  const pageSize = Math.min(100, Math.max(1, requestedSize));
  const search = filters.search?.trim().slice(0, 120) ?? "";
  const market = filters.market?.trim().toUpperCase() || null;
  const basis =
    filters.basis === "VERIFIED" || filters.basis === "SELLER_DECLARED" ? filters.basis : null;
  const origin = filters.origin === "recorded" || filters.origin === "unrecorded" ? filters.origin : null;

  const scopeWhere: Prisma.ProductWhereInput = {
    isSample: false,
    ...(filters.countryCodeScope ? { countryCode: filters.countryCodeScope } : {}),
    ...(market ? { countryCode: market } : {})
  };
  const searchWhere: Prisma.ProductWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { vendor: { name: { contains: search, mode: "insensitive" } } },
          { category: { name: { contains: search, mode: "insensitive" } } }
        ]
      }
    : {};
  const baseWhere: Prisma.ProductWhereInput = { AND: [scopeWhere, searchWhere] };
  const originWhere: Prisma.ProductWhereInput =
    origin === "recorded"
      ? ORIGIN_RECORDED_WHERE
      : origin === "unrecorded"
        ? { OR: [{ originCountryCode: null }, { originBasis: null }] }
        : {};
  const basisWhere: Prisma.ProductWhereInput = basis ? { originBasis: basis } : {};
  const where: Prisma.ProductWhereInput = { AND: [baseWhere, originWhere, basisWhere] };

  const [rows, total, summaryTotal, recorded, verified, marketGroups, countryRows] = await prisma.$transaction([
    prisma.product.findMany({
      where,
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
      orderBy: [{ originCountryCode: "asc" }, { name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.product.count({ where }),
    prisma.product.count({ where: baseWhere }),
    prisma.product.count({ where: { AND: [baseWhere, ORIGIN_RECORDED_WHERE] } }),
    prisma.product.count({ where: { AND: [baseWhere, { originBasis: "VERIFIED" }] } }),
    prisma.product.groupBy({
      by: ["countryCode"],
      where: baseWhere,
      orderBy: { countryCode: "asc" }
    }),
    prisma.countryProfile.findMany({
      select: { code: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      total: summaryTotal,
      recorded,
      unrecorded: Math.max(0, summaryTotal - recorded),
      verified,
      declared: Math.max(0, recorded - verified)
    },
    markets: marketGroups.map((group) => group.countryCode),
    countries: countryRows
  };
}
