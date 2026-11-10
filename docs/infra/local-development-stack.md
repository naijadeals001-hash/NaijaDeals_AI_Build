# Local development infrastructure stack

Seven engines run locally for development. All images are pinned, every host port binds to
`127.0.0.1`, and every secret is generated on this machine into a gitignored file.

**This stack is development only.** No TLS, single-node storage, generated credentials, no backup
policy, and no replication. Nothing here should be promoted to production unchanged.

## Start

```bash
node deploy/dev-infra/gen-secrets.mjs              # idempotent; creates .env + valkey.conf + S3 IAM
docker compose -f deploy/dev-infra/docker-compose.yml up -d
```

`gen-secrets.mjs` also appends the client-side variables (`VALKEY_URL`, `MEILISEARCH_*`, `S3_*`,
`VECTOR_DATABASE_URL`, `OSRM_URL`, `PROMETHEUS_URL`, `GRAFANA_URL`, `METRICS_TOKEN`) to the
gitignored root `.env` if they are missing. It never overwrites an existing value and never prints
one.

## What runs, and what uses it

| Container | Image (pinned) | Host port | Consumed by |
| --- | --- | --- | --- |
| `nd-valkey` | `valkey/valkey:9.1.3-alpine` | `127.0.0.1:6380` | `lib/infra/cache.ts`, `lib/infra/queue.ts` |
| `nd-meilisearch` | `getmeili/meilisearch:v1.56.2` | `127.0.0.1:7700` | `lib/infra/search.ts` → `app/api/products/route.ts` |
| `nd-seaweedfs` | `chrislusf/seaweedfs:4.53` | `127.0.0.1:9002` (S3 only) | `lib/infra/storage.ts` |
| `nd-pgvector` | `pgvector/pgvector:0.8.7-pg18` | `127.0.0.1:5433` | `lib/infra/vectors.ts` |
| `nd-prometheus` | `prom/prometheus:v3.16.0` | `127.0.0.1:9091` | scrapes `app/api/metrics` |
| `nd-grafana` | `grafana/grafana:13.3.0` | `127.0.0.1:3002` | dashboards over Prometheus |
| `nd-osrm` | `ghcr.io/project-osrm/osrm-backend:26.11.0-amd64-debian` | `127.0.0.1:5000` | `lib/infra/routing.ts` |

SeaweedFS publishes only the S3 API. Its master, volume and filer ports stay on the compose network —
that is the surface the 2026-11-09 advisories attack.

The application database is unchanged: native PostgreSQL 18.4 on `::1:5432`, database
`naijadeals_core`. The vector instance is separate and holds embeddings only.

## Routing dataset

OSRM needs a prepared graph before it can answer anything:

```bash
mkdir -p deploy/dev-infra/osrm-data
curl -L -o deploy/dev-infra/osrm-data/nigeria-latest.osm.pbf \
  https://download.geofabrik.de/africa/nigeria-latest.osm.pbf     # ~715 MB, ODbL

# Git Bash rewrites /data/... into a Windows path; disable that for these calls.
MSYS_NO_PATHCONV=1 docker compose -f deploy/dev-infra/docker-compose.yml --profile routing \
  run --rm osrm-prep osrm-extract -p /opt/car.lua /data/nigeria-latest.osm.pbf
MSYS_NO_PATHCONV=1 docker compose -f deploy/dev-infra/docker-compose.yml --profile routing \
  run --rm osrm-prep osrm-partition /data/nigeria-latest
MSYS_NO_PATHCONV=1 docker compose -f deploy/dev-infra/docker-compose.yml --profile routing \
  run --rm osrm-prep osrm-customize /data/nigeria-latest

docker compose -f deploy/dev-infra/docker-compose.yml --profile routing up -d osrm
```

The extract is ODbL data: any map UI that displays OSRM results must carry OpenStreetMap attribution.

## Verify

```bash
npx tsx scripts/infra-verify.ts                # engines + HTTP endpoints + observability
npx tsx scripts/infra-verify.ts --only=engines # engines only, works without a running app
node scripts/mcp-verify.mjs playwright rea kie-ai
```

Every check performs the real operation: a cache round-trip and TTL expiry, a BullMQ job that a
worker executes and whose return value is read back, a typo query against an index built from real
product rows, an object uploaded and read back with a SHA-256 comparison, a k-NN query, a Lagos
route, and authenticated metrics scrapes.

## Restart behaviour

All six always-on containers use `restart: unless-stopped` and named volumes. Valkey has AOF enabled
so queued jobs and cache entries survive a restart.

```bash
docker compose -f deploy/dev-infra/docker-compose.yml restart
```

No job, index, object or vector needs rebuilding after a restart. The OSRM dataset is a mounted file
set and is not affected.

## Stop and clean

```bash
docker compose -f deploy/dev-infra/docker-compose.yml stop          # keep data
docker compose -f deploy/dev-infra/docker-compose.yml down          # keep volumes
docker compose -f deploy/dev-infra/docker-compose.yml down -v       # DELETE data — ask first
```

`down -v` deletes the Meilisearch index, stored objects and the vector database. All of it is
derived data and can be rebuilt, but the OSM extract and its contracted graph are expensive to
regenerate.

## Do not touch

| Thing | Why |
| --- | --- |
| `naijadeals-infra` volume contents | shared local dev data for search, objects and vectors |
| Container `vigorous_goodall` | pre-existing `postgres:18` on IPv4 5432, unrelated to this stack, not created here |
| Native `postgresql-x64-18` service | the application database |
| `deploy/dev-infra/.env`, `.runtime/` | generated credentials, gitignored on purpose |

## Known Windows gotchas

1. **Path rewriting.** Git Bash converts `/data/...` into `C:/Program Files/Git/data/...` before
   Docker sees it, which makes OSRM print its help text instead of processing. Prefix one-off
   `docker compose run` calls with `MSYS_NO_PATHCONV=1`.
2. **PostgreSQL 18 volume path.** The official image rejects a mount at `/var/lib/postgresql/data`
   and wants `/var/lib/postgresql`. The compose file already does this.
3. **Prometheus flags.** `--web.enable-lifecycle=false` is a parse error; the flag must be omitted
   entirely, and both admin APIs are off by default.
