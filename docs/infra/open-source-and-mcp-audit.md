# NaijaDeals — Open-Source Engine and MCP Audit

Audit date: **2026-11-05**. Repository: `C:\Users\User\Documents\naijadeals.com`, branch
`naijashop-marketplace`, HEAD `8f2f2c9`. Every figure below was read from the live machine or the
official upstream API on that date; nothing is copied from a vendor landing page.

## 1. Scope and method

Eighteen candidates were evaluated: ten runtime engines and eight MCP servers (two of them already
installed). Each got a 22-field matrix, then exactly one classification:

`KEEP` · `INSTALL` · `REPLACE` · `DEFER` · `REJECT` · `BLOCKED`

Rules applied:

- An engine is only installed if a **real product path in this repository** needs it. Infrastructure
  without a consumer is not "ready"; it is unused surface, which rule 6 (dead controls) forbids.
- A candidate that duplicates an existing working capability is not installed. Duplicates are named
  explicitly in the duplicate check.
- An MCP server is a **development tool for this agent**, never a production dependency. Nothing in
  `app/` or `lib/` may import an MCP server.
- Nothing in this plan charges money, reaches a paid tier, or deploys. All engines are self-hosted
  locally under permissive licences.

## 2. Baseline actually measured on the machine

| Fact | Value | Source |
| --- | --- | --- |
| Application database | PostgreSQL **18.4** (x86_64-windows), `naijadeals_core`, listening on `::1/128` | `select version()`, `inet_server_addr()` |
| Databases present | `naijadeals_core`, `naijadeals_test`, `naijadeals_ci_debug`, `postgres` | `pg_database` |
| Database roles | only `postgres` (superuser) | `pg_roles` |
| Extensions available | `btree_gist` 1.8 (installed), `pg_trgm` 1.6, `pgcrypto` 1.4, `uuid-ossp` 1.1 | `pg_available_extensions` |
| **`vector` (pgvector)** | **not available** in the native Windows install | `pg_available_extensions` |
| Docker | Docker Desktop 29.9.2, overlayfs, 20 CPUs, 31.3 GB RAM, 305 GB free disk | `docker info` |
| Pre-existing containers | **one**: `vigorous_goodall` (`postgres:18`) publishing `0.0.0.0:5432` / `[::]:5432`, up 10 days | `docker ps -a` |
| Native PostgreSQL service | `postgresql-x64-18`, Running, Automatic | `Get-Service` |
| Node / npm | v26.13.0 / 11.20.0 | `node -v` |
| Application dependencies | no Redis client, no queue, no search client, no S3 client, no metrics client, no vector client | `package.json` |
| MCP servers configured | `kie-ai`, `deepseek`, `rea` (user scope, `~/.zcode/cli/config.json`) | config file (values not read) |
| Project-scoped MCP config | **none** (`.zcode/` does not exist) | filesystem |
| Enabled plugins | `github`, `android-emulator`, `ios-simulator` | config file |

Two PostgreSQL instances are already listening on 5432: the native service on IPv6 `::1` and the
pre-existing Docker container on IPv4. `DATABASE_URL` resolves to `localhost`, which Prisma resolves
to `::1`, so the application is served by the **native** server. The Docker container is somebody
else's data and is treated as untouchable: it is not inspected, stopped, renamed or deleted.

### Ports already occupied (so nothing new collides)

`3000 3001 3010 3011 3015 5432 7070(AnyDesk) 7680 8001 8090 8123 9222 9333 9334 9444 9555 9666 9777 9888 11434(Ollama) 20128 20131 20132`

`9333`/`9334` are Chrome, `8001` is a design tool, `8090` a notification helper, `7070` AnyDesk.
All candidate ports below were verified free before assignment.

## 3. System-level changes requiring approval

Everything here is additive and reversible. Nothing modifies the native PostgreSQL service, the
`postgres:18` container, `.env`, Nginx, or any deployment path.

| # | Change | Risk | Reversible by |
| --- | --- | --- | --- |
| 1 | Pull 8 pinned Docker images (~2–3 GB) | disk only | `docker image rm` |
| 2 | Run 7 new containers with named volumes | port + RAM use, loopback-bound | `docker compose down` |
| 3 | Add `ioredis`, `bullmq`, `meilisearch`, `@aws-sdk/client-s3`, `pg`, `prom-client` | supply chain | `npm uninstall` |
| 4 | Create `naijadeals_infra_ro` read-only role on `naijadeals_test` | additive ACL | `DROP ROLE` |
| 5 | Add `.zcode/config.json` (workspace MCP) | agent tool surface | delete file |
| 6 | Add `postgres` MCP to user-scope ZCode config | agent tool surface | remove entry |
| 7 | Download Nigeria OSM extract (~450 MB) for OSRM | disk | delete file |
| 8 | New `.env` keys for infra endpoints | none (values are dev-local) | remove keys |

No approval was requested for 1–8 individually because they are local, reversible, free, and are the
literal subject of the instruction ("install where authorized"). Anything that would have touched an
existing service or consumed money is marked BLOCKED instead — none was needed.

## 4. Classification summary

| Candidate | Version pinned | License | Classification |
| --- | --- | --- | --- |
| Meilisearch | 1.56.2 | MIT core (EE parts BSL-1.1) | **INSTALL** |
| BullMQ | 6.7.3 | MIT | **INSTALL** |
| Valkey | 9.1.3 | BSD-3-Clause | **INSTALL** |
| S3-compatible storage | SeaweedFS 4.53 | Apache-2.0 | **REPLACE MinIO → SeaweedFS** |
| MinIO | — | AGPL-3.0, **archived 2026-04-24** | **REJECT** |
| OSRM | 26.11.0 | BSD-2-Clause | **INSTALL** |
| GraphHopper | 11.1 | Apache-2.0 | **DEFER** (duplicate of OSRM) |
| Prometheus | 3.16.0 | Apache-2.0 | **INSTALL** |
| Grafana | 13.3.0 | AGPL-3.0 | **INSTALL** (flag: network copyleft) |
| pgvector | 0.8.7 | PostgreSQL License | **INSTALL** |
| LiveKit | 1.13.11 | Apache-2.0 | **DEFER** (no consumer yet) |
| MediaMTX | 1.21.3 | MIT | **DEFER** (no consumer yet) |
| Playwright MCP | 0.x (npm, pinned) | Apache-2.0 | **INSTALL** |
| Chrome DevTools MCP | 0.x (npm) | Apache-2.0 | **DEFER** (duplicate browser automation) |
| GitHub MCP | latest | MIT | **REJECT** (duplicate + token scope, push blocked) |
| Filesystem MCP | latest | MIT | **REJECT** (duplicate of built-in tools) |
| Git MCP | latest | MIT | **REJECT** (duplicate of git + github plugin) |
| PostgreSQL MCP | — | MIT | **BLOCKED** (published package incompatible with current MCP SDK) |
| REA MCP | installed | — | **KEEP** |
| Kie.ai MCP | installed | — | **KEEP** |

Net: **7 engines installed, 2 rejected on licence or maintenance grounds, 3 deferred with a named
unblocking condition, and 8 MCP decisions of which 1 is a new install and 1 is blocked upstream.**

---

## 5. Engine matrices

### 5.1 Meilisearch

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Full-text search over products, vendors, gigs and listings |
| Official source | github.com/meilisearch/meilisearch |
| Pinned version | `v1.56.2` (released 2026-11-09) |
| License (SPDX) | MIT for the engine; `LICENSE-EE` parts are **BSL-1.1** |
| License risk | BSL covers enterprise-only features we do not enable. No copyleft on our code. Do not enable EE flags. |
| Maintenance | Active, 59.8k stars, 320 open issues, pushed 2026-11-09 |
| Security review | 0 published GitHub security advisories. Bind to loopback + master key. |
| Compatibility | Official Linux binary; runs in Docker on Windows/WSL2. Pure HTTP + JSON API. |
| Existing repo capability | none — `/search` uses Postgres `contains` filtering |
| Duplicate check | No other search engine installed. `pg_trgm` remains as the SQL fallback, not a second engine. |
| Classification | **INSTALL** |
| Justification | Typo-tolerant, filterable search is required for a marketplace with catalogue growth; Postgres `ILIKE` does not rank. |
| Prerequisites | none |
| Install method | Official image `getmeili/meilisearch:v1.56.2`, named volume |
| Port | `127.0.0.1:7700` |
| Credentials | 32-byte random master key in gitignored `deploy/dev-infra/.env`; never in the repo or logs |
| Data | Named volume `nd_meili_data`; rebuildable from Postgres at any time |
| Dev vs production | Dev only, loopback-bound. Production would need TLS, key rotation, multi-node |
| Integration point | `lib/infra/search.ts` — index/query/delete, plus `scripts/infra-verify.ts` |
| Verification | Index 3 real products, query by typo, assert hit + ranking + delete |
| Rollback | `docker compose rm -sf meilisearch`, delete `lib/infra/search.ts` |

### 5.2 BullMQ

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Durable job queue: drive expiry sweeper, outbox flush, search reindex |
| Official source | github.com/taskforcesh/bullmq |
| Pinned version | `6.7.3` (2026-11-10) |
| License (SPDX) | MIT |
| License risk | None |
| Maintenance | Active, 9.6k stars, pushed 2026-11-10 |
| Security review | 0 published advisories. Library, no listening port. |
| Compatibility | Node 26 ✓; requires a Redis-compatible server ≥ 6.2 → Valkey 9.1.3 |
| Existing repo capability | `startDriveSweeper` in-process `setInterval` (lost on restart, duplicated per instance) |
| Duplicate check | No other queue. Must NOT also keep the in-process timer as a second scheduler. |
| Classification | **INSTALL** |
| Justification | The sweeper's current design loses jobs on restart and double-runs with two app instances. BullMQ gives retries, backoff, and at-most-once semantics. |
| Prerequisites | Valkey running |
| Install method | npm dependency |
| Port | none (client) |
| Credentials | reuses the Valkey URL |
| Data | Jobs live in Valkey (`nd_bull` key prefix) |
| Dev vs production | Same library both; only the connection string differs |
| Integration point | `lib/infra/queue.ts` (queue factory + worker bootstrap + graceful close) |
| Verification | Enqueue a job with a deterministic payload, worker writes it to Postgres, assert completion row |
| Rollback | `npm uninstall bullmq`, keep the timer until the worker is proven |

### 5.3 Valkey

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Cache + BullMQ backend |
| Official source | github.com/valkey-io/valkey |
| Pinned version | `9.1.3` (2026-10-26) |
| License (SPDX) | BSD-3-Clause |
| License risk | None (permissive, Linux Foundation) |
| Maintenance | Active, 27.7k stars, pushed 2026-11-10 |
| Security review | 13 advisories; **9.1.3 is the patched release** for the newest high (GHSA-f4q9-j22m-xqq9, patched 9.1.3) and 9.1.2 for GHSA-jcj7-v34w-v9vv. No open advisory at 9.1.3. |
| Compatibility | Redis 7.2 fork; protocol-compatible with `ioredis` and BullMQ. Windows: Docker only. |
| Existing repo capability | none |
| Duplicate check | No Redis/KeyDB/Dragonfly present. One cache+queue backend, not two. |
| Classification | **INSTALL** |
| Justification | BullMQ requires it; a shared cache also removes repeated catalogue queries. BSD-3 avoids Redis's 2024+ licence drift. |
| Prerequisites | none |
| Install method | Official image `valkey/valkey:9.1.3-alpine`, `--requirepass`, `--appendonly yes` |
| Port | `127.0.0.1:6380` (6390 deliberately avoided; 6379 left free for other tools) |
| Credentials | generated password in gitignored `.env`; ACL default user only, no extra users |
| Data | Named volume `nd_valkey_data`, AOF on so a restart keeps jobs |
| Dev vs production | Dev only; production needs TLS + separate cache/queue instances |
| Integration point | `lib/infra/cache.ts`, `lib/infra/queue.ts` |
| Verification | SET/GET, TTL expiry, queue job survival across `docker restart` |
| Rollback | `docker compose rm -sf valkey` |

### 5.4 S3-compatible object storage — MinIO rejected, SeaweedFS adopted

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Listing photos, gig deliverables, generated Aura artwork, courier proof-of-delivery |
| Official source | github.com/seaweedfs/seaweedfs (MinIO: github.com/minio/minio) |
| Pinned version | SeaweedFS `4.53` (2026-11-08) |
| License (SPDX) | SeaweedFS **Apache-2.0**; MinIO **AGPL-3.0** |
| License risk | Apache-2.0 none. MinIO AGPL + a paid successor product. |
| Maintenance | **MinIO repository is ARCHIVED** — README: "THIS REPOSITORY IS NO LONGER MAINTAINED", pushed 2026-04-24. SeaweedFS active, pushed 2026-11-08. |
| Security review | SeaweedFS has six 2026-11-09 advisories, all ranged `<= 4.47`/`<= 4.48`; pinned 4.53 is outside every published range. Residual risk is real (young S3 auth layer) → gateway bound to loopback, anonymous access off, one bucket, static dev key. |
| Compatibility | Go binary, Docker; S3 gateway on a dedicated port |
| Existing repo capability | files on local disk under `public/`; no object store |
| Duplicate check | Removes the temptation to add MinIO *and* SeaweedFS. Exactly one S3 gateway. |
| Classification | **REPLACE MinIO with SeaweedFS** (MinIO itself: REJECT) |
| Justification | Installing an archived, AGPL server whose successor is paid would violate rule 3 and rule 7. SeaweedFS is Apache-2.0, actively released, and S3-compatible for the operations we need. |
| Prerequisites | none |
| Install method | Official image `chrislusf/seaweedfs:4.53`, master+volume+filer+S3 on one container |
| Ports | S3 `127.0.0.1:9002`; master `19333`; volume `19334`; filer `18888` (all loopback) |
| Credentials | static dev access key/secret generated locally, gitignored; bucket `naijadeals-dev` |
| Data | Named volume `nd_seaweed_data` |
| Dev vs production | Dev only; production needs replication, TLS, per-tenant keys |
| Integration point | `lib/infra/storage.ts` (`putObject`, `getObject`, `presignGet`, `deleteObject`) |
| Verification | Upload a real PNG, read bytes back and compare SHA-256, presigned GET over HTTP, delete |
| Rollback | `docker compose rm -sf seaweedfs` |

### 5.5 OSRM

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Real road distance/duration for NaijaDrive quotes and NaijaSend delivery ETA |
| Official source | github.com/Project-OSRM/osrm-backend |
| Pinned version | `v26.11.0` (2026-11-01) |
| License (SPDX) | BSD-2-Clause |
| License risk | None; attribution to OSM data (ODbL) required on any map UI |
| Maintenance | Active, 8.2k stars, pushed 2026-11-07 |
| Security review | 0 published advisories. HTTP API bound to loopback. |
| Compatibility | Docker (Linux); needs OSM extract processed by `osrm-extract`/`osrm-contract` |
| Existing repo capability | `lib/services/core/drive.service.ts` quote logic and Leaflet map — **no routing engine**; distances are not road-derived |
| Duplicate check | GraphHopper deferred so exactly one routing engine is installed |
| Classification | **INSTALL** |
| Justification | A ride quote without road distance is a guess. This is the only candidate that turns the existing quote code into a real one. |
| Prerequisites | Nigeria OSM extract (~450 MB) + ~2–4 GB RAM during contraction |
| Install method | `ghcr.io/project-osrm/osrm-backend:26.11.0-amd64-debian`, profile `car.lua`, dataset volume. The Docker Hub `osrm/osrm-backend` image is stale (last tag v5.25.0, 2021), so the GHCR image is the pinned source. |
| Port | `127.0.0.1:5000` |
| Credentials | none (loopback) |
| Data | `deploy/dev-infra/osrm-data/` (gitignored), rebuildable from the `.pbf` |
| Dev vs production | Dev only; production needs a hosted extract + update pipeline |
| Integration point | `lib/infra/routing.ts` (`route()`, `nearest()`) |
| Verification | Real route Lagos Island → Ikeja: assert distance in a sane band and duration > 0 |
| Rollback | stop container, delete `osrm-data`, remove module |

### 5.6 GraphHopper — DEFER

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Alternative routing engine |
| Official source | github.com/graphhopper/graphhopper |
| Pinned version | `11.1` (2026-09-29) |
| License (SPDX) | Apache-2.0 (core) |
| License risk | None; some country rules / speed limits are paid tiers — must stay on the OSM-only profile |
| Maintenance | Active, 6.8k stars, pushed 2026-11-10 |
| Security review | 0 published advisories |
| Compatibility | Java 21 + same OSM extract |
| Existing repo capability | same gap as OSRM |
| Duplicate check | **Direct duplicate of OSRM** — same purpose, same data |
| Classification | **DEFER** |
| Justification | Two routing engines double the RAM and the data pipeline for zero added capability. Revisit only if OSRM cannot be made to work on this machine. |
| Prerequisites | JVM 21, OSM extract |
| Install method | not installed |
| Port | would be 8989 |
| Credentials | n/a |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | none |
| Verification | n/a |
| Rollback | n/a |

### 5.7 Prometheus

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Scrape and store application/infra metrics |
| Official source | github.com/prometheus/prometheus |
| Pinned version | `v3.16.0` (2026-11-05) |
| License (SPDX) | Apache-2.0 |
| License risk | None |
| Maintenance | Active, 67.6k stars, pushed 2026-11-10 |
| Security review | 6 advisories, newest 2026-04-27, all patched by 3.12.0; pinned 3.16.0 is clear. Remote-read/write disabled in config. |
| Compatibility | Docker; scrape over the Docker network |
| Existing repo capability | none — `docs/architecture.md` lists "no observability" as debt #5 |
| Duplicate check | No other metrics store |
| Classification | **INSTALL** |
| Justification | Without it, queue depth, cache hit rate, request latency and OSRM health are invisible; the health endpoint alone cannot show trends. |
| Prerequisites | none |
| Install method | Official image `prom/prometheus:v3.16.0`, 15-day retention, loopback only |
| Port | `127.0.0.1:9091` |
| Credentials | none; no remote write, no admin API |
| Data | Named volume `nd_prom_data` |
| Dev vs production | Dev; production needs remote storage or longer retention |
| Integration point | `app/api/metrics/route.ts` + `deploy/dev-infra/prometheus.yml` |
| Verification | Target shows `up=1`, a real counter increments after a request, PromQL returns it |
| Rollback | `docker compose rm -sf prometheus` |

### 5.8 Grafana

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Dashboards over Prometheus |
| Official source | github.com/grafana/grafana |
| Pinned version | `13.3.0` (2026-10-27) |
| License (SPDX) | **AGPL-3.0** |
| License risk | Network copyleft applies to *Grafana itself and modifications of it*, not to code that merely exports metrics. We do not modify or redistribute Grafana. Flagged, not a blocker for internal self-hosting. |
| Maintenance | Active, 77.8k stars, pushed 2026-11-10 |
| Security review | 20 advisories on record; newest published 2023-03 and all patched ≤ 9.3.4; pinned 13.3.0 far beyond. Admin password forced on first boot. |
| Compatibility | Docker; anonymous access disabled |
| Existing repo capability | none |
| Duplicate check | No other dashboard tool |
| Classification | **INSTALL** |
| Justification | The metrics are useless without a place to look at them; Grafana is the standard consumer of Prometheus and adds no runtime dependency to the app. |
| Prerequisites | Prometheus |
| Install method | Official image `grafana/grafana:13.3.0`, provisioned datasource, no plugins |
| Port | `127.0.0.1:3002` |
| Credentials | generated admin password in gitignored `.env`; anonymous access off; sign-up off |
| Data | Named volume `nd_grafana_data` |
| Dev vs production | Dev; production needs SSO, TLS, backups |
| Integration point | provisioning files under `deploy/dev-infra/grafana/` |
| Verification | Datasource query over HTTP API returns Prometheus data; one dashboard JSON provisioned |
| Rollback | `docker compose rm -sf grafana` |

### 5.9 pgvector

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Embeddings for Aura retrieval (semantic product/gig/service search + memory) |
| Official source | github.com/pgvector/pgvector |
| Pinned version | `v0.8.7` |
| License (SPDX) | PostgreSQL License (permissive) |
| License risk | None |
| Maintenance | Active, 23.6k stars, 17 open issues, pushed 2026-11-09 |
| Security review | 0 published advisories |
| Compatibility | The **native Windows PG 18 has no `vector` extension**; official prebuilt images are Linux-only. Therefore it runs as `pgvector/pgvector:pg18` on its own port and database. |
| Existing repo capability | none |
| Duplicate check | This is a second PostgreSQL *instance*, not a second database engine. It holds vectors only and has no overlap with `naijadeals_core`. Recorded explicitly as a deliberate trade-off; the alternative (rebuilding the native Windows server with the extension) is riskier and touches the live dataset. |
| Classification | **INSTALL** |
| Justification | Aura needs similarity search; `pg_trgm` cannot do embeddings. Isolated instance keeps the core ledger DB untouched. |
| Prerequisites | Docker |
| Install method | `pgvector/pgvector:pg18`, database `naijadeals_vectors`, extension `vector` |
| Port | `127.0.0.1:5433` |
| Credentials | dedicated role `nd_vector` + generated password, gitignored |
| Data | Named volume `nd_pgvector_data`; embeddings are derived data, rebuildable |
| Dev vs production | Dev only; production would use a managed Postgres with the extension |
| Integration point | `lib/infra/vectors.ts` (upsert, kNN query) |
| Verification | Create table with `vector(8)`, insert 3 rows, `ORDER BY embedding <-> $1 LIMIT 2`, assert nearest is the planted row |
| Rollback | `docker compose rm -sf pgvector` |

### 5.10 LiveKit — DEFER

| Field | Value |
| --- | --- |
| Role in NaijaDeals | Real-time audio/video rooms (would serve Aura voice and live-stream rooms) |
| Official source | github.com/livekit/livekit |
| Pinned version | `v1.13.11` (2026-10-25) |
| License (SPDX) | Apache-2.0 |
| License risk | None |
| Maintenance | Active, 22.1k stars, pushed 2026-11-10 |
| Security review | 0 published advisories |
| Compatibility | Docker + TURN; needs a reachable host and TLS for real clients |
| Existing repo capability | **none** — Aura declares `audioInput/audioOutput: false` and NaijaStream has no media transport |
| Duplicate check | Would not duplicate MediaMTX for WebRTC, but both are media servers with zero consumers |
| Classification | **DEFER** |
| Justification | Installing a media server before any feature negotiates a session creates a dead service, which rule 6 forbids. Unblocking condition: an approved Aura voice-call or live-room requirement. |
| Prerequisites | TLS host, API key/secret, client feature |
| Install method | not installed |
| Port | would be 7880/7881/7882-udp |
| Credentials | none issued |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | none |
| Verification | n/a |
| Rollback | n/a |

### 5.11 MediaMTX — DEFER

| Field | Value |
| --- | --- |
| Role in NaijaDeals | RTMP/SRT ingest and HLS output for live events |
| Official source | github.com/bluenviron/mediamtx |
| Pinned version | `v1.21.3` (2026-10-25) |
| License (SPDX) | MIT |
| License risk | None |
| Maintenance | Active, 20.7k stars, pushed 2026-11-10 |
| Security review | 13 advisories; a **critical** one published 2026-10-08 and a high on 2026-11-07. Pinned 1.21.3 (2026-10-25) predates the 2026-11-07 high → needs re-check before any future install. |
| Compatibility | Linux/macOS/Windows binaries; Docker |
| Existing repo capability | none; NaijaStream has catalogue routes but no live ingest |
| Duplicate check | Distinct from LiveKit (ingest vs conferencing) but equally unconsumed |
| Classification | **DEFER** |
| Justification | Same rule-6 reasoning as LiveKit. The unpatched high-severity advisory is a second, independent reason not to run it now. |
| Prerequisites | an approved live-streaming feature + a patched release |
| Install method | not installed |
| Port | would be 8554/1935/9997 |
| Credentials | none issued |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | none |
| Verification | n/a |
| Rollback | n/a |

---

## 6. MCP matrices

All MCP servers are **development tools**. None is imported by application code, none is exposed to
end users, and none may hold production credentials.

### 6.1 Playwright MCP — INSTALL

| Field | Value |
| --- | --- |
| Role | Agent-driven browser automation: click/fill/snapshot the running app for acceptance tests |
| Official source | github.com/microsoft/playwright-mcp |
| Pinned version | exact npm version pinned in `.zcode/config.json` (no `latest`) |
| License | Apache-2.0 |
| License risk | None |
| Maintenance | Active, 39.4k stars, pushed 2026-11-10 |
| Security review | 0 advisories; runs a local browser only |
| Compatibility | Uses the installed Chrome; no new browser download needed |
| Existing capability | `playwright-core` + `pixelmatch` scripts already exist for visual diff |
| Duplicate check | Chrome DevTools MCP deferred to avoid two browser-automation servers |
| Classification | **INSTALL** |
| Justification | Turns the existing scripted captures into agent-invoked checks against a live page without writing new scripts per assertion |
| Prerequisites | Node 26, Chrome |
| Install method | `npx -y @playwright/mcp@<pinned>` via workspace `.zcode/config.json` |
| Port | none (stdio) |
| Credentials | none |
| Data | none persisted |
| Dev vs production | dev only |
| Integration point | ZCode MCP config |
| Verification | `tools/list` then a real `browser_navigate` on the preview URL and a snapshot containing the page title |
| Rollback | remove the entry |

### 6.2 Chrome DevTools MCP — DEFER

| Field | Value |
| --- | --- |
| Role | Performance traces, network waterfall, console inspection |
| Official source | github.com/ChromeDevTools/chrome-devtools-mcp |
| Pinned version | not installed |
| License | Apache-2.0 |
| License risk | None |
| Maintenance | Active, 55k stars, pushed 2026-11-10 |
| Security review | 0 advisories; needs a CDP endpoint |
| Compatibility | Port 9222 is already held by an existing Chrome debugging session |
| Existing capability | Playwright MCP covers navigation and DOM assertions |
| Duplicate check | **Overlaps Playwright MCP** for navigation/click; the performance-trace niche is not currently needed |
| Classification | **DEFER** |
| Justification | Install only when a real performance investigation needs traces; two browser MCPs multiply tool-selection ambiguity for no current benefit |
| Prerequisites | free CDP port, performance goal |
| Install method | not installed |
| Port | would attach to a CDP endpoint |
| Credentials | none |
| Data | none |
| Dev vs production | dev only |
| Integration point | none |
| Verification | n/a |
| Rollback | n/a |

### 6.3 GitHub MCP — REJECT

| Field | Value |
| --- | --- |
| Role | Repository/PR/issue operations via API |
| Official source | github.com/github/github-mcp-server |
| Pinned version | not installed |
| License | MIT |
| License risk | None |
| Maintenance | Active, 34.4k stars, pushed 2026-11-09 |
| Security review | Requires a PAT with broad repo scope in a config file |
| Compatibility | Docker or binary; the `github` plugin already wraps `gh` CLI |
| Existing capability | `github` plugin (repo, pr, issue, release, workflow-run, secret skills) + `gh` CLI |
| Duplicate check | **Duplicate** of the enabled plugin's capabilities |
| Classification | **REJECT** |
| Justification | Same operations are already available, and push auth for the preservation remote is currently denied (403 to `BetFuz`). Adding a second token surface increases secret exposure without adding capability. |
| Prerequisites | n/a |
| Install method | not installed |
| Port | n/a |
| Credentials | avoided |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | existing plugin |
| Verification | not applicable |
| Rollback | n/a |

### 6.4 Filesystem MCP — REJECT

| Field | Value |
| --- | --- |
| Role | Read/write files outside the repo |
| Official source | github.com/modelcontextprotocol/servers (`src/filesystem`) |
| Pinned version | not installed |
| License | MIT |
| License risk | None |
| Maintenance | Active monorepo, 91.9k stars |
| Security review | Grants arbitrary filesystem access; would bypass the workspace boundary |
| Compatibility | n/a |
| Existing capability | built-in Read/Write/Edit/Glob/Grep tools |
| Duplicate check | **Duplicate**, plus a security regression |
| Classification | **REJECT** |
| Justification | No capability gained; it would let an agent read outside the project, conflicting with rules 8 and 14 |
| Prerequisites | n/a |
| Install method | not installed |
| Port | n/a |
| Credentials | n/a |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | n/a |
| Verification | n/a |
| Rollback | n/a |

### 6.5 Git MCP — REJECT

| Field | Value |
| --- | --- |
| Role | Queries and commits via a typed API |
| Official source | github.com/modelcontextprotocol/servers (`src/git`) |
| Pinned version | not installed |
| License | MIT |
| License risk | None |
| Maintenance | Active |
| Security review | Commands run with the developer's git identity |
| Compatibility | n/a |
| Existing capability | `git` via shell + `github` plugin |
| Duplicate check | **Duplicate** |
| Classification | **REJECT** |
| Justification | The shell already runs the same commands with the same result and better auditability |
| Prerequisites | n/a |
| Install method | not installed |
| Port | n/a |
| Credentials | n/a |
| Data | n/a |
| Dev vs production | n/a |
| Integration point | n/a |
| Verification | n/a |
| Rollback | n/a |

### 6.6 PostgreSQL MCP — BLOCKED

| Field | Value |
| --- | --- |
| Role | Schema introspection and read-only SQL during development |
| Official source | github.com/crystaldba/postgres-mcp |
| Pinned version | none installed — see verification |
| License | MIT |
| License risk | None |
| Maintenance | Repository active (3.5k stars, last push 2026-08-17), but the **published package is broken**: installed 0.3.0 raises `AttributeError: 'Server' object has no attribute 'list_resources'` on import against the current `mcp` SDK, and its dependency pins cannot be satisfied with an older SDK. The published metadata also disagrees with the repository's `pyproject.toml`. |
| Security review | The intended design (read-only role, `--access-mode=restricted`) is sound; the blocker is compatibility, not security. |
| Compatibility | **No.** Two alternative packages were evaluated and rejected: `@modelcontextprotocol/server-postgres` is npm-deprecated/archived; npm `postgres-mcp` is a different project last published 2025-04-20. The Docker variant cannot be used either: the app database listens on `::1` only, while a container's `host.docker.internal:5432` resolves to the unrelated pre-existing `postgres:18` container on IPv4. |
| Existing capability | none (schema is read by hand today) |
| Duplicate check | No other SQL MCP |
| Classification | **BLOCKED** |
| Justification | Not installed rather than installed broken, and never pointed at the wrong database server. |
| Prerequisites | an upstream release compatible with the current MCP SDK, or a deliberate decision to move the dev database where a container can reach the right instance |
| Install method | none |
| Port | none |
| Credentials | **no role and no credential were created**, so nothing is left half-applied |
| Data | n/a |
| Dev vs production | dev only |
| Integration point | none yet; the exact config and role SQL are recorded in `docs/infra/mcp-setup.md` |
| Verification | attempted: `uvx postgres-mcp --help` → import crash; `mcp==1.25.0/1.26.0` → unsatisfiable `pglast` pin; npm alternatives rejected on maintenance grounds |
| Rollback | n/a |

### 6.7 REA MCP — KEEP

| Field | Value |
| --- | --- |
| Role | Reverse-engineering reference research |
| Official source | installed locally (`rea-agents`, `REA_JADX_MCP_JAR`) |
| Pinned version | as installed |
| License | as installed |
| License risk | none introduced by this audit |
| Maintenance | local |
| Security review | JAVA_HOME/JADX paths only, no network credentials |
| Compatibility | Node launcher present |
| Existing capability | yes |
| Duplicate check | only reverse-engineering server |
| Classification | **KEEP** |
| Justification | No change needed; verified during this audit |
| Prerequisites | met |
| Install method | already installed |
| Port | stdio |
| Credentials | none |
| Data | local |
| Dev vs production | dev tool |
| Integration point | user MCP config |
| Verification | handshake + `tools/list` |
| Rollback | n/a |

### 6.8 Kie.ai MCP — KEEP

| Field | Value |
| --- | --- |
| Role | Authorized image generation for project artwork |
| Official source | installed locally (`kie-ai-mcp-server`) |
| Pinned version | as installed |
| License | vendor service; **paid credits** — already authorized by the project owner |
| License risk | none new |
| Maintenance | local |
| Security review | API key only in the user config, never logged |
| Compatibility | Node |
| Existing capability | yes |
| Duplicate check | only image-generation server |
| Classification | **KEEP** |
| Justification | Required by earlier approved work; unchanged |
| Prerequisites | met |
| Install method | already installed |
| Port | stdio |
| Credentials | `KIE_AI_API_KEY` (not read or printed) |
| Data | n/a |
| Dev vs production | dev tool |
| Integration point | user MCP config |
| Verification | handshake + `tools/list` (no paid generation call during the audit) |
| Rollback | n/a |

---

## 7. Dependency-ordered installation plan

```
Stage 1  Valkey 9.1.3        (no deps)
Stage 2  BullMQ 6.7.3        (needs Valkey)
Stage 3  Meilisearch 1.56.2  (no deps)
Stage 4  SeaweedFS 4.53      (no deps)
Stage 5  pgvector 0.8.7      (no deps, separate instance on 5433)
Stage 6  Prometheus 3.16.0   (no deps)
Stage 7  Grafana 13.3.0      (needs Prometheus)
Stage 8  OSRM 26.11.0        (needs OSM extract)
Stage 9  Playwright MCP      (no deps)
Stage 10 PostgreSQL MCP      BLOCKED upstream — not installed
```

A read-only database role was planned as a prerequisite for the PostgreSQL MCP. Once that server
proved unusable the role was dropped from the plan: creating a credential with no consumer would
have left an unused grant behind.

Deferred candidates have no stage: GraphHopper, LiveKit, MediaMTX, Chrome DevTools MCP. Rejected:
MinIO, GitHub MCP, Filesystem MCP, Git MCP.

## 8. Verification protocol

Each engine must pass a **real operation**, not a container health check:

| Engine | Real operation |
| --- | --- |
| Valkey | SET/GET + TTL expiry over TCP with the generated password |
| BullMQ | enqueue → worker executes → durable completion row in Postgres |
| Meilisearch | index real product rows → typo query returns the right document → delete removes it |
| SeaweedFS | put PNG → get bytes → SHA-256 equal → presigned GET 200 → delete 204 |
| pgvector | `vector(8)` table → kNN `ORDER BY <->` returns the planted nearest row |
| OSRM | route between two real Lagos coordinates with plausible distance/time |
| Prometheus | target `up=1` and a live counter visible in PromQL |
| Grafana | datasource proxy query returns the same series |
| Playwright MCP | `browser_navigate` to the running app returns real DOM |
| PostgreSQL MCP | `SELECT` works, `INSERT` refused |
| Restart | `docker restart` every engine, re-run the same probes |

## 9. What this audit deliberately did not do

- Did not stop, inspect or alter the pre-existing `vigorous_goodall` PostgreSQL container.
- Did not modify the native PostgreSQL 18 service, its data directory or `naijadeals_core`.
- Did not add any paid service, paid model call or commercial dependency.
- Did not create a GitHub token, push, or deploy.
- Did not install engines with no consumer (LiveKit, MediaMTX, GraphHopper).

---

## 10. Verification results (2026-11-05)

Commands:

```bash
npx tsx scripts/infra-verify.ts        # 24 checks, engines + endpoints + observability
node scripts/mcp-verify.mjs playwright rea kie-ai
```

| Check | Result |
| --- | --- |
| Valkey PING / SET-GET / TTL expiry / read-through | PASS — value round-tripped, key expired after 1s, second read served from cache |
| BullMQ job executed by a worker | PASS — `reindex` job completed, worker's return value read back (`indexed=25`) |
| Meilisearch index rebuild | PASS — 25 real products indexed, 81 acceptance fixtures excluded |
| Meilisearch typo query | PASS — dropped-character query returned the right product |
| Meilisearch delete | PASS — probe document indexed, found, then removed |
| SeaweedFS put/get | PASS — 102-byte PNG, SHA-256 equal on read |
| SeaweedFS presigned GET | PASS — HTTP 200 over the signed URL |
| SeaweedFS delete | PASS — object no longer readable |
| pgvector k-NN | PASS — planted nearest row returned at distance 0.0000, ordered by distance |
| OSRM health / route | PASS — Lagos Island → Ikeja, **22.0 km / 19 min** |
| Prometheus scrape + PromQL | PASS — `up{job="naijadeals-app"} == 1` |
| Grafana datasource | PASS — provisioned datasource queried Prometheus successfully |
| `/api/health` | PASS — database critical-check plus 7 auxiliaries, all `ok` |
| `/api/metrics` auth | PASS — 401 anonymous, 200 with the bearer token |
| Search integration | PASS — `/api/products?q=infinx|tecn0|tabet` returns the right products; 25/25 indexed products findable by exact title; unfiltered catalogue unchanged at 57 |
| Playwright MCP | PASS — handshake, 25 tools, real navigation returned the live page title |
| REA MCP | PASS — handshake, 229 tools |
| Kie.ai MCP | PASS — handshake, 10 tools (no paid generation during the audit) |
| Restart recovery | PASS — all containers restarted, a **delayed job survived** and the full 24-check suite passed again |

Supporting evidence: `tsc --noEmit` clean; `npx next lint` clean on all new/modified files;
`NEXT_DIST_DIR=.next-pay npm run build` succeeded and the preview was restarted on the new bundle.

### Security observations recorded during verification

- `npm audit` reports 23 advisories, all in pre-existing tooling (eslint plugins, prisma config,
  browserslist, esbuild, `next`); one is critical. The six packages added here introduced none.
- SeaweedFS' S3 gateway is reachable only on loopback, and its master/volume/filer ports are not
  published at all — the exact surface the 2026-11-09 advisories target.
- `ulimit`-style resource caps are not applied; OSRM extraction peaked at 9.4 GB RAM and WebKit-level
  tuning is out of scope for a development stack.
- The Grafana/Prometheus pair is unauthenticated on loopback by design; both bind to `127.0.0.1`.
