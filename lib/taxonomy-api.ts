/**
 * UI client for the taxonomy API (see docs/taxonomy/api-contract.md).
 *
 * Every response is normalised here so a missing or partially implemented
 * endpoint surfaces as a real error instead of an invented category tree.
 * Nothing in this module writes to the catalogue: seller requests stay
 * pending, admin mutations are validated server-side and product counts come
 * from the server response.
 */

export type TaxonomyAttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

export type TaxonomyAttribute = {
  key: string;
  label: string;
  type: TaxonomyAttributeType;
  required: boolean;
  options: string[];
};

export type TaxonomyAlias = { alias: string; locale?: string | null };

export type TaxonomyCountryRule = {
  countryCode: string;
  canPublish: boolean;
  note?: string | null;
};

/** Machine-readable cause when publishing into a category is blocked. */
export type PublishRestrictionReason = "country_rule" | "market_eligibility_unresolved";

/** Shared shape of a published taxonomy node returned by `/api/taxonomy`. */
export type PublicTaxonomyNode = {
  id: string;
  key?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  isSelectable?: boolean;
  showOnHomepage?: boolean;
  /** 0 = department, 1 = category, 2 = selectable leaf. */
  level: number;
  sortOrder: number;
  /**
   * Browsing eligibility is independent of publishing eligibility. False hides
   * the node from browsing lists only; it remains published here and on its
   * category page.
   */
  browsingVisible: boolean;
  /**
   * Whether a seller may publish listings into the node in the requested
   * market. A false value does not remove a browsing-visible node from the
   * rail; the UI shows its restriction notice and its listing count is zero.
   */
  canPublish: boolean;
  /** Why publishing is restricted, or null when publishable. */
  restrictionNote: string | null;
  restrictionReason: PublishRestrictionReason | null;
  /** Regulated goods need an explicit country rule before publishing. */
  isRegulated: boolean;
  /** Server-reported public listing counts; null when the response omits it. */
  productCount: number | null;
  subtreeProductCount: number | null;
  parentId?: string | null;
  parentName?: string | null;
  children?: PublicTaxonomyNode[];
};

/**
 * Level-1 browsing projection returned by `/api/taxonomy/categories`. The
 * service returns active, reachable, browsing-visible categories in
 * merchandising order; `canPublish` may be false for a browsable category
 * whose market eligibility is unresolved.
 */
export type PublicCategoryLevel = Omit<PublicTaxonomyNode, "children"> & {
  parentId: string | null;
  parentName: string | null;
};

export type AdminTaxonomyNode = Omit<
  PublicTaxonomyNode,
  | "canPublish"
  | "restrictionNote"
  | "restrictionReason"
  | "productCount"
  | "subtreeProductCount"
  | "level"
  | "sortOrder"
  | "browsingVisible"
  | "isRegulated"
  | "children"
> & {
  parentId?: string | null;
  level?: number;
  isActive?: boolean;
  sortOrder?: number;
  browsingVisible?: boolean;
  isRegulated?: boolean;
  deprecatedAt?: string | null;
  productCount?: number;
  /** Some endpoints expose the Prisma relation count instead. */
  _count?: { products?: number };
  aliases?: TaxonomyAlias[];
  attributes?: TaxonomyAttribute[];
  countryRules?: TaxonomyCountryRule[];
  children?: AdminTaxonomyNode[];
};

export type SellerCategory = {
  id: string;
  key?: string | null;
  name: string;
  path: string;
  level: number;
  isSelectable: boolean;
  canPublish: boolean;
  restrictionNote?: string | null;
  restrictionReason?: PublishRestrictionReason | null;
  isRegulated?: boolean;
  attributes: TaxonomyAttribute[];
  description?: string | null;
  examples: string[];
};

export type CategoryRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type SellerCategoryRequest = {
  id: string;
  suggestedName: string;
  description: string;
  status: CategoryRequestStatus;
  adminNote?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  parentPath?: string | null;
  resolvedCategoryId?: string | null;
  resolvedCategoryPath?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  seller?: { name?: string | null; email?: string | null } | null;
};

/** A mutation error that keeps the server's field issues for inline display. */
export class TaxonomyApiError extends Error {
  status: number;
  code?: string;
  issues: Array<{ field: string; message: string }>;

  constructor(message: string, status: number, code?: string, issues: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "TaxonomyApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

function toIssues(value: unknown): Array<{ field: string; message: string }> {
  if (!Array.isArray(value)) return [];
  const issues: Array<{ field: string; message: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { field?: unknown; message?: unknown; path?: unknown };
    const field = typeof row.field === "string" ? row.field : typeof row.path === "string" ? row.path : "";
    const message = typeof row.message === "string" ? row.message : "";
    if (message) issues.push({ field: field || "category", message });
  }
  return issues;
}

async function requestTaxonomy<T>(path: string, init?: RequestInit): Promise<T> {
  // `path` is built from `taxonomyQuery`, so the selected country and city are
  // part of the cache key/URL. `no-store` below prevents one market's response
  // from being reused for another after a market switch.
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch {
    throw new TaxonomyApiError("The server could not be reached. Check your connection and try again.", 0, "network_error");
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | undefined;
    let issues: Array<{ field: string; message: string }> = [];
    try {
      const body = (await response.json()) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
        details?: { issues?: unknown };
      };
      if (typeof body?.error === "string") message = body.error;
      else if (typeof body?.message === "string") message = body.message;
      if (typeof body?.code === "string") code = body.code;
      issues = toIssues(body?.details?.issues);
    } catch {
      /* keep the HTTP status text and no field issues */
    }
    throw new TaxonomyApiError(message, response.status, code, issues);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function normaliseRestrictionReason(value: unknown): PublishRestrictionReason | null {
  return value === "country_rule" || value === "market_eligibility_unresolved" ? value : null;
}

/**
 * A response that cannot be interpreted is an unavailable taxonomy, never an
 * empty one. A valid empty array stays an honest empty state; a missing root,
 * a non-array body or a category without its eligibility flags fails closed.
 */
function malformedTaxonomyResponse(detail: string): TaxonomyApiError {
  return new TaxonomyApiError(
    `The category service returned an unusable response (${detail}). Categories are unavailable right now; try again.`,
    502,
    "malformed_taxonomy_response"
  );
}

function asResponseRecord(value: unknown, scope: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw malformedTaxonomyResponse(`${scope} is not an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw malformedTaxonomyResponse(`${path} must be a non-empty string`);
  }
  return value;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw malformedTaxonomyResponse(`${path} must be a finite number`);
  }
  return value;
}

function readBooleanFlag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw malformedTaxonomyResponse(`${path} must be a boolean`);
  }
  return value;
}

/**
 * A response that names a different market is stale/cross-market data. Treat it
 * as malformed rather than letting a previous market's rail replace the
 * selected one. A response without a country code is left to the other checks.
 */
function assertResponseMarket(
  body: Record<string, unknown>,
  market: TaxonomyMarket,
  scope: string
): void {
  const expected = market.country.trim().toUpperCase();
  const actual = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
  if (actual && actual !== expected) {
    throw malformedTaxonomyResponse(`${scope} was for ${actual}, not the requested market ${expected}`);
  }
}

/**
 * Validate one published node before it reaches normalisation.
 *
 * `browsingVisible` and `canPublish` are explicit contract fields: a response
 * that omits either cannot be interpreted safely, so it is rejected instead of
 * defaulting to visible/publishable. Counts stay optional because the UI has an
 * honest "count unavailable" state; malformed counts are carried as `null`.
 */
function readPublicNode(value: unknown, path: string): PublicTaxonomyNode {
  const record = asResponseRecord(value, path);
  readRequiredString(record.id, `${path}.id`);
  readRequiredString(record.name, `${path}.name`);
  readRequiredString(record.slug, `${path}.slug`);
  const level = readFiniteNumber(record.level, `${path}.level`);
  const sortOrder = readFiniteNumber(record.sortOrder, `${path}.sortOrder`);
  const browsingVisible = readBooleanFlag(record.browsingVisible, `${path}.browsingVisible`);
  const canPublish = readBooleanFlag(record.canPublish, `${path}.canPublish`);
  if (record.children !== undefined && !Array.isArray(record.children)) {
    throw malformedTaxonomyResponse(`${path}.children must be an array when present`);
  }
  const children = Array.isArray(record.children)
    ? record.children.map((child, index) => readPublicNode(child, `${path}.children[${index}]`))
    : [];
  return {
    ...(record as unknown as PublicTaxonomyNode),
    level,
    sortOrder,
    browsingVisible,
    canPublish,
    children
  };
}

/**
 * Display normalization for the published taxonomy contract. Eligibility flags
 * fail closed (`=== true`); counts stay null so the UI can say they are
 * unavailable instead of inventing zero. Country publishing permission is
 * always enforced server-side on mutation; the client flag drives the browsing
 * filter only.
 */
function normalisePublicNode(node: PublicTaxonomyNode): PublicTaxonomyNode {
  return {
    ...node,
    level: typeof node.level === "number" ? node.level : 0,
    sortOrder: typeof node.sortOrder === "number" ? node.sortOrder : 0,
    browsingVisible: node.browsingVisible === true,
    canPublish: node.canPublish === true,
    restrictionNote: typeof node.restrictionNote === "string" ? node.restrictionNote : null,
    restrictionReason: normaliseRestrictionReason(node.restrictionReason),
    isRegulated: node.isRegulated === true,
    productCount: finiteCount(node.productCount),
    subtreeProductCount: finiteCount(node.subtreeProductCount),
    children: Array.isArray(node.children) ? node.children.map(normalisePublicNode) : []
  };
}

function normaliseCategoryLevel(node: PublicCategoryLevel): PublicCategoryLevel {
  const normalised = normalisePublicNode({ ...node, children: [] });
  const { children: _children, ...fields } = normalised;
  void _children;
  if (node.parentId !== undefined && node.parentId !== null && typeof node.parentId !== "string") {
    throw malformedTaxonomyResponse("category parentId must be a string or null");
  }
  if (node.parentName !== undefined && node.parentName !== null && typeof node.parentName !== "string") {
    throw malformedTaxonomyResponse("category parentName must be a string or null");
  }
  return {
    ...fields,
    parentId: typeof node.parentId === "string" ? node.parentId : null,
    parentName: typeof node.parentName === "string" ? node.parentName : null
  };
}

function normaliseAdminNode(node: AdminTaxonomyNode): AdminTaxonomyNode {
  return {
    ...node,
    children: Array.isArray(node.children) ? node.children.map(normaliseAdminNode) : [],
    aliases: Array.isArray(node.aliases) ? node.aliases : [],
    attributes: Array.isArray(node.attributes)
      ? node.attributes.map((attribute) => ({ ...attribute, options: Array.isArray(attribute.options) ? attribute.options : [] }))
      : [],
    countryRules: Array.isArray(node.countryRules) ? node.countryRules : []
  };
}

export function normaliseAttributeType(value: unknown): TaxonomyAttributeType {
  return value === "NUMBER" || value === "SELECT" || value === "BOOLEAN" ? value : "TEXT";
}

/**
 * Human-readable failure copy. Database/schema failures are reported as an
 * environment setup problem (never as a successful empty taxonomy), with the
 * server detail kept for Control Center staff.
 */
export function taxonomyErrorMessage(
  error: unknown,
  options: { technical?: boolean; missingEndpoint?: string } = {}
): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/prisma|does not exist|no such column|no such table|relation .* does not exist/i.test(raw)) {
    const base =
      "The taxonomy database in this environment is not migrated, so taxonomy data cannot be loaded or saved.";
    return options.technical ? `${base} Server response: ${raw.trim()}` : `${base} The rest of the marketplace is unaffected.`;
  }
  if (error instanceof TaxonomyApiError) {
    if (error.status === 404) return options.missingEndpoint ?? "The taxonomy service is not enabled on this build yet.";
    if (error.status === 401) return "Sign in with an account that can use the taxonomy service.";
    if (error.status === 403) return "This account does not have permission for that taxonomy action.";
    if (error.status === 0) return error.message;
  }
  return raw || "The taxonomy request failed.";
}


function normaliseAttributes(value: unknown): TaxonomyAttribute[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      key: typeof entry.key === "string" ? entry.key : "",
      label: typeof entry.label === "string" ? entry.label : "",
      type: normaliseAttributeType(entry.type),
      required: entry.required === true,
      options: Array.isArray(entry.options) ? entry.options.filter((option): option is string => typeof option === "string") : []
    }))
    .filter((attribute) => attribute.key && attribute.label);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export type TaxonomyMarket = {
  /** ISO country selected by the visitor. Required: no silent NG fallback. */
  country: string;
  city?: string | null;
};

/**
 * Stable identity for a market-scoped taxonomy request. It is used in the
 * request URL and by consumers when keying refetches, so a market switch can
 * never reuse another country's categories or counts.
 */
export function taxonomyMarketKey(market: TaxonomyMarket): string {
  return `${market.country.trim().toUpperCase()}|${market.city?.trim() ?? ""}`;
}

function taxonomyQuery(options: TaxonomyMarket): string {
  const country = options.country?.trim().toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    throw new TaxonomyApiError(
      "Select a valid market before loading categories.",
      400,
      "country_required"
    );
  }
  const params = new URLSearchParams({ country });
  if (options.city) params.set("city", options.city);
  return `?${params.toString()}`;
}

type PublicTaxonomyOptions = TaxonomyMarket & {
  signal?: AbortSignal;
};

/** Public hierarchy. Throws a TaxonomyApiError when the endpoint is missing. */
export async function getPublicTaxonomy(
  options: PublicTaxonomyOptions
): Promise<{ countryCode: string | null; city: string | null; departments: PublicTaxonomyNode[] }> {
  const body = asResponseRecord(
    await requestTaxonomy<unknown>(`/api/taxonomy${taxonomyQuery(options)}`, { signal: options.signal }),
    "taxonomy response"
  );
  assertResponseMarket(body, options, "taxonomy response");
  // `departments` is the current field; `categories` is the legacy alias. A
  // present-but-wrong value is malformed rather than a reason to try the alias.
  const rootValue = Object.prototype.hasOwnProperty.call(body, "departments")
    ? body.departments
    : Object.prototype.hasOwnProperty.call(body, "categories")
      ? body.categories
      : undefined;
  if (!Array.isArray(rootValue)) {
    throw malformedTaxonomyResponse("taxonomy response does not contain a departments array");
  }
  return {
    countryCode: typeof body.countryCode === "string" ? body.countryCode : null,
    city: typeof body.city === "string" ? body.city : null,
    departments: rootValue.map((value, index) => normalisePublicNode(readPublicNode(value, `departments[${index}]`)))
  };
}

/**
 * Level-1 browsing categories for the rail and directory. The server already
 * applies active/reachable/browsingVisible filtering and merchandising order;
 * the client maps and renders that response without inventing a count.
 */
export async function getPublicLevelOneCategories(
  options: PublicTaxonomyOptions
): Promise<{ countryCode: string | null; city: string | null; categories: PublicCategoryLevel[] }> {
  const body = asResponseRecord(
    await requestTaxonomy<unknown>(`/api/taxonomy/categories${taxonomyQuery(options)}`, { signal: options.signal }),
    "category response"
  );
  assertResponseMarket(body, options, "category response");
  if (!Array.isArray(body.categories)) {
    throw malformedTaxonomyResponse("category response does not contain a categories array");
  }
  return {
    countryCode: typeof body.countryCode === "string" ? body.countryCode : null,
    city: typeof body.city === "string" ? body.city : null,
    categories: body.categories.map((value, index) =>
      normaliseCategoryLevel(readPublicNode(value, `categories[${index}]`) as PublicCategoryLevel)
    )
  };
}

/**
 * Seller-publishable categories for the authenticated seller's market.
 *
 * Publication state is explicit: a seller-category entry without a boolean
 * `canPublish` is a malformed response, and only `canPublish === true` is
 * exposed as publishable. Missing `isSelectable` also fails closed.
 */
export async function getSellerCategories(): Promise<SellerCategory[]> {
  const body = asResponseRecord(await requestTaxonomy<unknown>("/api/seller/categories"), "seller category response");
  if (!Array.isArray(body.categories)) {
    throw malformedTaxonomyResponse("seller category response does not contain a categories array");
  }
  return body.categories.map((value, index) => {
    const path = `categories[${index}]`;
    const entry = asResponseRecord(value, path);
    readRequiredString(entry.id, `${path}.id`);
    readRequiredString(entry.name, `${path}.name`);
    const canPublish = readBooleanFlag(entry.canPublish, `${path}.canPublish`);
    if (entry.isSelectable !== undefined && typeof entry.isSelectable !== "boolean") {
      throw malformedTaxonomyResponse(`${path}.isSelectable must be a boolean when present`);
    }
    return {
      id: String(entry.id),
      key: typeof entry.key === "string" ? entry.key : null,
      name: String(entry.name),
      path: typeof entry.path === "string" && entry.path ? entry.path : String(entry.name),
      level: typeof entry.level === "number" ? entry.level : 0,
      isSelectable: entry.isSelectable === true,
      canPublish: canPublish === true,
      restrictionNote: typeof entry.restrictionNote === "string" ? entry.restrictionNote : null,
      restrictionReason: normaliseRestrictionReason(entry.restrictionReason),
      isRegulated: entry.isRegulated === true,
      attributes: normaliseAttributes(entry.attributes),
      description: typeof entry.description === "string" ? entry.description : null,
      examples: Array.isArray(entry.examples)
        ? entry.examples.filter((example): example is string => typeof example === "string")
        : Array.isArray(entry.inclusionExamples)
          ? (entry.inclusionExamples as unknown[]).filter((example): example is string => typeof example === "string")
          : []
    };
  });
}

export async function suggestSellerCategories(query: string): Promise<Array<{ categoryId: string; path: string; reason: string }>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const body = await requestTaxonomy<{ suggestions?: unknown }>(
    `/api/seller/category-suggest?q=${encodeURIComponent(trimmed.slice(0, 80))}`
  );
  return asArray<Record<string, unknown>>(body?.suggestions).map((entry) => ({
    categoryId: String(entry.categoryId ?? ""),
    path: typeof entry.path === "string" ? entry.path : "",
    reason: typeof entry.reason === "string" ? entry.reason : "Matched name or alias"
  }));
}

export async function createCategoryRequest(input: {
  suggestedName: string;
  description: string;
  parentId?: string | null;
  imageUrl?: string | null;
}): Promise<{ id: string; status: CategoryRequestStatus }> {
  const body = await requestTaxonomy<{ id?: unknown; status?: unknown }>("/api/seller/category-requests", {
    method: "POST",
    body: JSON.stringify(input)
  });
  const status = body?.status === "APPROVED" || body?.status === "REJECTED" ? body.status : "PENDING";
  return { id: String(body?.id ?? ""), status };
}

function normaliseRequest(entry: Record<string, unknown>): SellerCategoryRequest {
  const status: CategoryRequestStatus =
    entry.status === "APPROVED" || entry.status === "REJECTED" ? entry.status : "PENDING";
  const resolved = entry.resolvedCategory && typeof entry.resolvedCategory === "object"
    ? (entry.resolvedCategory as { name?: unknown; path?: unknown })
    : null;
  return {
    id: String(entry.id ?? ""),
    suggestedName: typeof entry.suggestedName === "string" ? entry.suggestedName : "",
    description: typeof entry.description === "string" ? entry.description : "",
    status,
    adminNote: typeof entry.adminNote === "string" ? entry.adminNote : null,
    imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl : null,
    parentId: typeof entry.parentId === "string" ? entry.parentId : null,
    parentPath: typeof entry.parentPath === "string" ? entry.parentPath : null,
    resolvedCategoryId: typeof entry.resolvedCategoryId === "string" ? entry.resolvedCategoryId : null,
    resolvedCategoryPath:
      typeof entry.resolvedCategoryPath === "string"
        ? entry.resolvedCategoryPath
        : resolved
          ? typeof resolved.path === "string"
            ? resolved.path
            : typeof resolved.name === "string"
              ? resolved.name
              : null
          : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
    seller: entry.seller && typeof entry.seller === "object" ? (entry.seller as SellerCategoryRequest["seller"]) : null
  };
}

/** The signed-in seller's own category requests. */
export async function getMyCategoryRequests(): Promise<SellerCategoryRequest[]> {
  const body = await requestTaxonomy<unknown>("/api/seller/category-requests");
  const rows = Array.isArray(body) ? body : asArray<unknown>((body as { requests?: unknown } | null)?.requests);
  return asArray<Record<string, unknown>>(rows).map(normaliseRequest);
}

/** Full admin tree, including inactive and deprecated nodes. */
export async function getAdminTaxonomy(): Promise<{
  departments: AdminTaxonomyNode[];
  requests: SellerCategoryRequest[];
}> {
  const body = await requestTaxonomy<Record<string, unknown>>("/api/admin/taxonomy");
  const roots = Array.isArray(body?.departments) ? (body.departments as AdminTaxonomyNode[]) : asArray<AdminTaxonomyNode>(body?.categories);
  return {
    departments: roots.map(normaliseAdminNode),
    requests: asArray<Record<string, unknown>>(body?.requests).map(normaliseRequest)
  };
}

export async function getAdminCategoryRequests(status: "PENDING" | "ALL" = "ALL"): Promise<SellerCategoryRequest[]> {
  const body = await requestTaxonomy<unknown>(`/api/admin/taxonomy/requests?status=${status}`);
  const rows = Array.isArray(body) ? body : asArray<unknown>((body as { requests?: unknown } | null)?.requests);
  return asArray<Record<string, unknown>>(rows).map(normaliseRequest);
}

export async function createAdminTaxonomyNode(input: {
  parentId?: string | null;
  key?: string | null;
  name: string;
  slug?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  level?: number;
  isSelectable?: boolean;
  showOnHomepage?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<unknown> {
  return requestTaxonomy("/api/admin/taxonomy", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAdminTaxonomyNode(
  id: string,
  input: Record<string, unknown>
): Promise<unknown> {
  return requestTaxonomy(`/api/admin/taxonomy/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function resolveAdminCategoryRequest(
  id: string,
  input: {
    action: "APPROVED" | "REJECTED";
    categoryId?: string | null;
    note?: string | null;
    createCategory?: { name: string; parentId?: string | null; slug?: string | null } | null;
  }
): Promise<unknown> {
  return requestTaxonomy(`/api/admin/taxonomy/requests/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/**
 * Product-count warning copy for destructive taxonomy changes. Counts are
 * server-reported; when the server does not send one the UI must say so
 * instead of assuming zero listings.
 */
export function productCountLabel(node: { productCount?: number; _count?: { products?: number } }): string {
  const count = typeof node.productCount === "number" ? node.productCount : node._count?.products;
  if (typeof count !== "number") return "listed products unknown";
  if (count === 0) return "no listed products";
  return `${count} listed ${count === 1 ? "product" : "products"}`;
}

/** Flat, ordered projection used by pickers and selects. */
export type FlatTaxonomyNode = {
  node: PublicTaxonomyNode;
  level: number;
  path: string;
  parentId: string | null;
};

export function flattenTaxonomy(nodes: PublicTaxonomyNode[], parentPath = "", parentId: string | null = null): FlatTaxonomyNode[] {
  const rows: FlatTaxonomyNode[] = [];
  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
    rows.push({ node, level: parentPath ? parentPath.split(" / ").length : 0, path, parentId });
    if (node.children && node.children.length > 0) {
      rows.push(...flattenTaxonomy(node.children, path, node.id));
    }
  }
  return rows;
}

export function countTaxonomyNodes(nodes: PublicTaxonomyNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countTaxonomyNodes(node.children ?? []);
  }
  return total;
}

/** Unique slugs for a node and all of its descendants. */
export function taxonomySlugSet(node: PublicTaxonomyNode): string[] {
  const slugs = [node.slug];
  for (const child of node.children ?? []) slugs.push(...taxonomySlugSet(child));
  return slugs;
}
