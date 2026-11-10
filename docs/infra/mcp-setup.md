# MCP server setup for NaijaDeals development

An MCP server is a **development tool for the coding agent**. Nothing under `app/` or `lib/`
imports one, no end user can reach one, and none holds a production credential. That distinction is
the reason the GitHub, filesystem and git servers were rejected in the audit: they duplicate tools
that already exist while widening the agent's reach.

## Configured servers (verified 2026-11-05)

| Server | Command | Tools advertised | Status |
| --- | --- | --- | --- |
| `kie-ai` | `kie-ai-mcp-server.cmd` | 10 | KEEP — handshake + `tools/list` verified |
| `deepseek` | `deepseek-mcp-server.cmd` | not re-run (no project change) | KEEP |
| `rea` | `node rea-agents/scripts/rea.mjs mcp` | 229 | KEEP — handshake + `tools/list` verified |
| `playwright` | `scripts/mcp/playwright.cmd` | 25 | INSTALLED — navigated to the running app and returned its title |
| `postgres` | — | — | **BLOCKED**, see below |

## Where each server lives

- `kie-ai`, `deepseek`, `rea`, `playwright`: user scope, `~/.zcode/cli/config.json` → `mcp.servers`.
  The existing three were already there; the Playwright entry joins them so that every server the
  agent can launch is in one auditable file, and no machine-specific path enters the repository.
- Application build/deploy config never reads these entries.

### Playwright entry

```json
"playwright": {
  "type": "stdio",
  "command": "C:\\Users\\<you>\\Documents\\naijadeals.com\\scripts\\mcp\\playwright.cmd",
  "args": [],
  "env": {}
}
```

[`scripts/mcp/playwright.cmd`](../../scripts/mcp/playwright.cmd) is version-pinned:

```cmd
npx -y @playwright/mcp@0.0.85 --headless --browser chrome --isolated %*
```

- `--headless` — no window steals focus while an agent works.
- `--isolated` — a fresh browser profile per session, so no cookie or storage state leaks between
  runs. It also means the agent cannot see a real signed-in account.
- `--browser chrome` — reuses the installed Chrome; no browser download.
- Pinned version — `@playwright/mcp@0.0.85` currently depends on `playwright@1.66.0-alpha-…`.
  That is a pre-release, so the version is fixed and reviewed on upgrade rather than floated.

On macOS/Linux the equivalent command is `npx -y @playwright/mcp@0.0.85 --headless --isolated`.

## Restricted by choice

| Not installed | Why |
| --- | --- |
| Chrome DevTools MCP | Duplicate navigation/click surface; would compete with Playwright MCP for tool choice. Revisit only for a real performance-trace investigation. |
| GitHub MCP | The `github` plugin already covers repo/PR/issue/release through `gh`, and push authentication to the preservation remote is currently denied. A second token surface adds risk without capability. |
| Filesystem MCP | Duplicates the built-in Read/Write/Edit tools and would allow reads outside the repository. |
| Git MCP | Duplicates `git` in the shell and the `github` plugin. |

## PostgreSQL MCP — BLOCKED

Three candidates were tried and none is usable on this machine today:

1. **`crystaldba/postgres-mcp` (MIT)** — the intended choice. Its published PyPI package installs
   but crashes on import with the current MCP SDK:

   ```
   AttributeError: 'Server' object has no attribute 'list_resources'
   ```

   The server was written against an older `mcp` SDK API that no longer exists. Pinning the SDK
   fails dependency resolution (`pglast` pin), and the published 0.3.0 metadata does not match the
   repository's `pyproject.toml`.
2. **`@modelcontextprotocol/server-postgres`** — npm marks it *"Archived and unmaintained; no
   security guarantees"*. Rejected.
3. **`postgres-mcp` on npm** — a different project (`llm-graph/postgres-mcp`), last published
   2025-04-20 and untested against MCP protocol revisions in use here. Rejected rather than adopted
   because a database tool is the last place to accept an unmaintained dependency.

The **Docker** variant of candidate 1 is not a workaround here: the application database is the
native PostgreSQL 18 service bound to `::1` only, while a container reaching `host.docker.internal:5432`
would land on the unrelated `postgres:18` container that already holds IPv4 5432. Pointing a database
tool at the wrong server is worse than not having the tool.

No read-only role and no credential were created, so there is nothing to clean up.

**Unblocks when** either upstream ships a release compatible with the current MCP SDK, or the
project deliberately moves the application database somewhere a container can address. At that point
the configuration is:

```json
"postgres": {
  "type": "stdio",
  "command": "<path to postgres-mcp>",
  "args": ["postgresql://naijadeals_infra_ro:<read-only-password>@localhost:5432/naijadeals_test", "--access-mode=restricted"],
  "env": {}
}
```

with the role created as `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`, granted `CONNECT` plus
`SELECT` on `public` only, and `ALTER ROLE … SET default_transaction_read_only = on`.

## Verifying a server

```bash
node scripts/mcp-verify.mjs playwright rea kie-ai
```

The script reads the same user configuration ZCode launches from, performs the `initialize`
handshake, calls `tools/list`, and — when a browser server is present — performs one real navigation
to the running app and checks the response. Argument and environment values are never printed.

Expected output (2026-11-05):

```
PASS playwright   protocol=2025-06-18 server=Playwright@1.66.0-alpha-2026-11-09 tools=25 [...]
PASS rea          protocol=2025-06-18 server=rea@6.8.0 tools=229 [...]
PASS kie-ai       protocol=2025-06-18 server=kie-ai-mcp-server@5.6.2 tools=10 [...]
```

## Upgrading a pinned server

1. Read the upstream release notes and the diff of the tool schemas.
2. Change the version in `scripts/mcp/playwright.cmd` only.
3. Run `node scripts/mcp-verify.mjs playwright`.
4. If the tool list changed, note it here — the agent's available actions changed with it.
