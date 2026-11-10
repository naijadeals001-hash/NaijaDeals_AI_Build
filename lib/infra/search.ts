import { infraConfig } from "./config";
import { recordOperation } from "./metrics";

/**
 * Meilisearch catalogue index.
 *
 * The index is a derived copy of rows that live in Postgres. Postgres remains
 * the source of truth: a lost index is rebuilt from the database, and a stale
 * document is deleted rather than patched.
 */

export const PRODUCT_INDEX = "products";

export type ProductDocument = {
  id: string;
  title: string;
  description: string;
  vendorName: string;
  category: string | null;
  priceKobo: number;
  inStock: boolean;
  href: string;
  updatedAt: string;
};

export type SearchHit = ProductDocument & { _rankingScore?: number };

export type SearchResult = {
  hits: SearchHit[];
  estimatedTotalHits: number;
  processingTimeMs: number;
  query: string;
};

function meili(): { url: string; apiKey: string } | null {
  return infraConfig().meilisearch;
}

async function call(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const config = meili();
  if (!config) return { ok: false, status: 0, json: null };

  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store"
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    recordOperation("meilisearch", init.method === "GET" ? "read" : "write", response.ok ? "ok" : "error", Date.now() - startedAt);
    return { ok: response.ok, status: response.status, json };
  } catch {
    recordOperation("meilisearch", init.method === "GET" ? "read" : "write", "error", Date.now() - startedAt);
    return { ok: false, status: 0, json: null };
  }
}

export function isSearchConfigured(): boolean {
  return Boolean(meili());
}

/**
 * Meilisearch acknowledges writes with a task id and indexes asynchronously.
 * Treating the 202 as "done" is how a caller ends up querying an empty index,
 * so every write waits for its task before returning.
 */
async function waitForTask(taskUid: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await call(`/tasks/${taskUid}`);
    const body = response.json as { status?: string } | null;
    if (body?.status === "succeeded") return true;
    if (body?.status === "failed" || body?.status === "canceled") return false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function callTask(path: string, init: { method?: string; body?: unknown }): Promise<boolean> {
  const response = await call(path, init);
  if (!response.ok) return false;
  const taskUid = (response.json as { taskUid?: number } | null)?.taskUid;
  if (typeof taskUid !== "number") return true;
  return waitForTask(taskUid);
}

/** Creates the index if missing and applies the settings this schema needs. */
export async function ensureProductIndex(): Promise<boolean> {
  const created = await call("/indexes", { method: "POST", body: { uid: PRODUCT_INDEX, primaryKey: "id" } });
  // 409 = index already exists, which is the steady state.
  if (!created.ok && created.status !== 409) return false;

  return callTask(`/indexes/${PRODUCT_INDEX}/settings`, {
    method: "PATCH",
    body: {
      searchableAttributes: ["title", "description", "vendorName", "category"],
      filterableAttributes: ["category", "vendorName", "inStock", "priceKobo"],
      sortableAttributes: ["priceKobo", "updatedAt"],
      rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
      typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
      displayedAttributes: ["id", "title", "description", "vendorName", "category", "priceKobo", "inStock", "href", "updatedAt"]
    }
  });
}

export async function indexProducts(documents: ProductDocument[]): Promise<boolean> {
  if (documents.length === 0) return true;
  return callTask(`/indexes/${PRODUCT_INDEX}/documents`, { method: "PUT", body: documents });
}

export async function deleteProducts(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return callTask(`/indexes/${PRODUCT_INDEX}/documents/delete-batch`, { method: "POST", body: ids });
}

export async function searchProducts(
  query: string,
  options: { limit?: number; filter?: string; sort?: string[] } = {}
): Promise<SearchResult | null> {
  const response = await call(`/indexes/${PRODUCT_INDEX}/search`, {
    method: "POST",
    body: {
      q: query.slice(0, 200),
      limit: Math.min(Math.max(options.limit ?? 12, 1), 50),
      filter: options.filter,
      sort: options.sort,
      attributesToHighlight: []
    }
  });
  if (!response.ok) return null;

  const body = response.json as {
    hits?: SearchHit[];
    estimatedTotalHits?: number;
    processingTimeMs?: number;
  };
  return {
    hits: body.hits ?? [],
    estimatedTotalHits: body.estimatedTotalHits ?? 0,
    processingTimeMs: body.processingTimeMs ?? 0,
    query
  };
}

/** Number of documents currently in the index, or null when unreachable. */
export async function indexDocumentCount(): Promise<number | null> {
  const response = await call(`/indexes/${PRODUCT_INDEX}/stats`);
  if (!response.ok) return null;
  const body = response.json as { numberOfDocuments?: number } | null;
  return typeof body?.numberOfDocuments === "number" ? body.numberOfDocuments : null;
}

export async function searchHealth(): Promise<boolean> {
  const response = await call("/health");
  return response.ok;
}
