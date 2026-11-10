import { Pool } from "pg";
import { infraConfig } from "./config";
import { recordOperation } from "./metrics";

/**
 * pgvector collections for Aura retrieval.
 *
 * The vector database is a separate, isolated PostgreSQL instance because the
 * native Windows server has no `vector` extension. It stores derived data only:
 * every collection can be rebuilt from `naijadeals_core`.
 *
 * Collection names are interpolated into DDL, which PostgreSQL cannot
 * parameterise. They are therefore validated against a strict pattern and never
 * taken from request input.
 */

const COLLECTION_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
const SCHEMA = "naijadeals_infra";

const globalKey = "__naijadealsVectorPool" as const;
type GlobalWithPool = typeof globalThis & { [globalKey]?: Pool };

function pool(): Pool | null {
  const config = infraConfig().vectors;
  if (!config) return null;

  const scope = globalThis as GlobalWithPool;
  if (!scope[globalKey]) {
    scope[globalKey] = new Pool({
      connectionString: config.connectionString,
      max: 4,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10_000
    });
    scope[globalKey]!.on("error", () => {
      // Pool-level errors surface through recordOperation; this listener keeps
      // an idle-client failure from crashing the process.
    });
  }
  return scope[globalKey]!;
}

function assertCollection(name: string): void {
  if (!COLLECTION_PATTERN.test(name)) {
    throw new Error("invalid_collection_name");
  }
}

export function isVectorsConfigured(): boolean {
  return Boolean(infraConfig().vectors);
}

/** Creates the collection table if it does not exist. Width must match the model. */
export async function ensureCollection(collection: string, dimensions: number): Promise<boolean> {
  assertCollection(collection);
  if (!Number.isInteger(dimensions) || dimensions < 2 || dimensions > 16000) {
    throw new Error("invalid_vector_dimensions");
  }

  const client = pool();
  if (!client) return false;

  const startedAt = Date.now();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${SCHEMA}.${collection} (
         id text PRIMARY KEY,
         content text NOT NULL,
         metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
         embedding vector(${dimensions}) NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    recordOperation("pgvector", "ensure-collection", "ok", Date.now() - startedAt);
    return true;
  } catch {
    recordOperation("pgvector", "ensure-collection", "error", Date.now() - startedAt);
    return false;
  }
}

export type VectorRow = {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

export async function upsertVectors(collection: string, rows: VectorRow[]): Promise<number> {
  assertCollection(collection);
  if (rows.length === 0) return 0;

  const client = pool();
  if (!client) return 0;

  const startedAt = Date.now();
  try {
    let written = 0;
    for (const row of rows) {
      const vector = `[${row.embedding.join(",")}]`;
      await client.query(
        `INSERT INTO ${SCHEMA}.${collection} (id, content, metadata, embedding, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::vector, now())
         ON CONFLICT (id) DO UPDATE
           SET content = EXCLUDED.content,
               metadata = EXCLUDED.metadata,
               embedding = EXCLUDED.embedding,
               updated_at = now()`,
        [row.id, row.content, JSON.stringify(row.metadata ?? {}), vector]
      );
      written += 1;
    }
    recordOperation("pgvector", "upsert", "ok", Date.now() - startedAt);
    return written;
  } catch {
    recordOperation("pgvector", "upsert", "error", Date.now() - startedAt);
    return 0;
  }
}

export type NearestHit = { id: string; content: string; metadata: Record<string, unknown>; distance: number };

/** Cosine-distance k-nearest-neighbour query. Lower distance means closer. */
export async function nearest(
  collection: string,
  embedding: number[],
  limit = 5
): Promise<NearestHit[]> {
  assertCollection(collection);
  const client = pool();
  if (!client) return [];

  const startedAt = Date.now();
  try {
    const vector = `[${embedding.join(",")}]`;
    const result = await client.query<{ id: string; content: string; metadata: Record<string, unknown>; distance: string }>(
      `SELECT id, content, metadata, embedding <=> $1::vector AS distance
         FROM ${SCHEMA}.${collection}
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [vector, Math.min(Math.max(limit, 1), 100)]
    );
    recordOperation("pgvector", "nearest", "ok", Date.now() - startedAt);
    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      distance: Number(row.distance)
    }));
  } catch {
    recordOperation("pgvector", "nearest", "error", Date.now() - startedAt);
    return [];
  }
}

export async function dropCollection(collection: string): Promise<boolean> {
  assertCollection(collection);
  const client = pool();
  if (!client) return false;
  try {
    await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.${collection}`);
    return true;
  } catch {
    return false;
  }
}

export async function vectorsHealth(): Promise<boolean> {
  const client = pool();
  if (!client) return false;
  const startedAt = Date.now();
  try {
    const result = await client.query<{ ok: number }>("SELECT 1 AS ok");
    const ok = result.rows[0]?.ok === 1;
    recordOperation("pgvector", "health", ok ? "ok" : "error", Date.now() - startedAt);
    return ok;
  } catch {
    recordOperation("pgvector", "health", "error", Date.now() - startedAt);
    return false;
  }
}

export async function closeVectors(): Promise<void> {
  const scope = globalThis as GlobalWithPool;
  await scope[globalKey]?.end().catch(() => undefined);
  scope[globalKey] = undefined;
}
