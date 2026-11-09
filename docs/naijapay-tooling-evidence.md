# NaijaPay tooling verification (2026-11-05)

Recorded before implementation, as required by AGENTS.md rule 4. Each entry states
what was executed and what was observed. Nothing here is inferred.

## REA — available and functional

- Binary: `C:\Users\User\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs`
- Command: `node <path> --help`
- Result: exit 0, `rea@6.8.0 — Reverse engineer anything from your terminal or agent.`
  Command list includes `analyze-web-bundle`, `capture-browser-scenario`,
  `capture-web-screenshot`, `compare`, `capabilities`.
- MCP registration: present in `~/.zcode/cli/config.json` under `mcp.servers.rea`
  (node + `rea.mjs mcp`, `JAVA_HOME` JDK 21, jadx headless MCP jar).
- Use in this increment: reference research for provider webhook/signature
  behaviour and for capturing the rendered NaijaPay pages as Evidence.

## ECC — not installed

- No ECC skill, binary or MCP server exists on this host: `~/.agents/skills` holds
  only `find-skills`, `gemini-api-dev`, `gemini-interactions-api`, `gepeto`,
  `pinokio`, `reverse-engineer-anything`, and `mcp.servers` has no ECC entry.
- Recorded as unavailable. Development proceeded with the repository's own
  workflow (AGENTS.md "Repeatable execution method", its test scripts and the
  project's preview task). No ECC execution evidence is claimed.

## Soup — not installed

- No Soup skill or MCP server on this host.
- Recorded as unavailable. Skill/context selection used the skills that do exist
  (`reverse-engineer-anything` for reference research).

## Kie.ai — available and functional (MCP)

- MCP server: `@felores/kie-ai-mcp-server` v5.6.2 at
  `%APPDATA%\npm\kie-ai-mcp-server.cmd`, registered as `mcp.servers.kie-ai`.
- Verification: spawned the server over stdio, completed the MCP `initialize`
  handshake and listed tools.
  - Response: `protocolVersion 2024-11-05`, `serverInfo {"name":"kie-ai-mcp-server","version":"5.6.2"}`.
  - Tool count: 39 (`Tool filtering: all tools enabled`).
  - Generation-relevant tools: `list_models`, `prepare_media_generation`,
    `submit_media_generation`, `get_task_status`, `wait_for_task`, `list_tasks`,
    `upload_file`, `get_upload_url`, `finalize_upload`, `upload_widget`.
- The MCP server reads `KIE_AI_API_KEY`. The project `.env` supplies it as
  `KIE_API_KEY`; the process environment must expose it under the MCP's name.
  Presence only — the value is never printed.
- Fallback used earlier in this session: the project's own REST generator
  (`scripts/generate-*.mjs`), documented as the authorized fallback where MCP
  tools are not exposed to the agent toolset.

## Database

- `naijadeals_core` on `localhost:5432` (host `::1/128`), classified local
  development. Shared financial data is never mutated without an approved
  correction; all financial tests run in isolated schemas.

## Preview

- Scheduled task `NaijaDealsPreview3015` runs `scripts/preview-3015.cmd`, which
  sets `NEXT_DIST_DIR=.next-pay` and serves on port 3015.
- Rebuilding must therefore use `NEXT_DIST_DIR=.next-pay npm run build`;
  building into `.next` alone leaves the preview serving stale chunks.
