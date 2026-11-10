-- Runs once, on first initialisation of the isolated vector database.
-- This instance holds embeddings only: it never holds ledger, order or
-- identity data, and it is not the application's primary database.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS naijadeals_infra;

-- Collections are created per embedding model at runtime by
-- lib/infra/vectors.ts, because the vector width depends on the embedding
-- model that is actually authorised. No width is assumed here.

COMMENT ON SCHEMA naijadeals_infra IS
  'Derived vector data for Aura retrieval. Rebuildable from the core database.';
