# Aura AI — tooling and provider verification (2026-11-05)

Recorded before implementation, as AGENTS.md rule 4 requires. Each entry states what
was executed and what was observed.

## Model provider — DeepSeek (configured and live)

- Credential: `DEEPSEEK_API_KEY` present in `.env` (non-empty; value never printed).
  `.env` is git-ignored.
- Endpoint: `POST https://api.deepseek.com/chat/completions`.
- **Basic completion:** HTTP 200, `model: deepseek-flash`, reply `OK`.
- **Tool calling:** HTTP 200; the model returned a structured call
  `search_gigs {"query": "electrician in Abuja"}` for a prompt and schema supplied
  in the request. Tool calls are therefore usable for Aura.
- **Streaming:** HTTP 200, `content-type: text/event-stream`, 10 SSE chunks for a
  short prompt. Streaming is usable for progressive replies.
- Capabilities actually verified: text completion, streaming, function/tool calling.
- **Not verified and therefore not advertised:** live web access, image
  understanding, audio input, speech synthesis, guaranteed multilingual output.

## Kie.ai imagery

- MCP server `@felores/kie-ai-mcp-server` v5.6.2 registered in `~/.zcode/cli/config.json`.
- Verified earlier in this session by a stdio MCP `initialize` handshake: 39 tools,
  including `list_models`, `prepare_media_generation`, `submit_media_generation`,
  `get_task_status`, `wait_for_task`.
- Model used by the project generators: `flux-3/klein-text-to-image`, 1.6 credits
  (≈ $0.008) per image — the cheapest 1K text-to-image option verified via
  `GET /api/v1/models`.
- Fallback used where MCP tools are not exposed to this agent's toolset: the
  project's own REST generators in `scripts/generate-*.mjs`, which is the
  documented authorized fallback.

## REA — available and functional

- `node .../rea-agents/scripts/rea.mjs --help` → exit 0, `rea@6.8.0`.
- Registered as `mcp.servers.rea` in the ZCode config.
- Used here for reference research and inspecting the approved mockups (a Playwright
  canvas sampler reads their real colours — see `scripts/aura-mockup-palette.cjs`).

### Correction to an earlier claim about REA browser capture

Earlier I wrote that REA "only handles binaries, bundles and firmware". That
over-generalised from this host's configuration. The verified facts:

- `rea --help` lists `capture-web-screenshot`, `capture-browser-scenario`,
  `analyze-web-bundle` and `compare`, so those capabilities exist in REA.
- `rea capabilities` on this host reports **37 available / 16 unavailable
  operations across 8 providers**: `rea-artifact-graph`, `rea-dotnet-static`,
  `sqlite`, `ghidra`, `hopper`, `ida`, `kuna`, `native-macos`.
- **No browser or web-capture provider is enabled in this installation**, so the
  web-capture commands are not usable here (the native ones additionally require
  macOS).

Conclusion, stated narrowly: REA is installed and functional for artifact and
code analysis on this machine, but browser screenshot capture is not available
through it *in this configuration*. Screen capture and pixel comparison are done
with Playwright + Pixelmatch, which is what this directive asks for regardless.

## ECC — not installed

- No ECC skill, binary or MCP entry on this host. Recorded as unavailable; the
  repository's own workflow (AGENTS.md "Repeatable execution method") was used and
  no ECC execution evidence is claimed.

## Soup — not installed

- No Soup skill or MCP entry on this host. Recorded as unavailable.

## Measured mockup palette

Sampled from the approved reference files rather than guessed:

| Element | Measured |
|---|---|
| Canvas | `#081410` |
| Sidebar | `#041814` |
| Composer surface | `#182C28` |
| Elevated card | `#0C201C` |
| Highlighted panel ("Make it yours") | `#104430` |
| Mint primary action | `#78F8CC` |

Reference files preserved with hashes in `design-references/approved/AuraAI/`:
`aura-desktop-dark.png` `e13f2830bdf594d8`, `aura-mobile-dark.png` `94b288ed89a1cd30`.

## DeepSeek harness — verified capability limits (2026-11-10)

The `deepseek` MCP server is registered in the ZCode config. Its tools are not
exposed to this agent session, so `scripts/deepseek-mcp.cjs` speaks the same
stdio JSON-RPC protocol directly. Findings are empirical, not from documentation.

**Works**

| Item | Result |
|---|---|
| Server | `deepseek-mcp-server` v1.0.1, stdio handshake OK |
| Balance | USD 12.71 available |
| Models | `deepseek-flash` (1,048,576 context, 393,216 max output), `deepseek-v4-pro` |
| Tools | `chat_completion`, `create_response`, `completion` (FIM), `list_models`, `get_user_balance`, `upload_file`/`list_files`/`retrieve_file`/`delete_file`, `reset_conversation`, `list_conversations` |
| Text generation | Reliable at 38, 168, 678, 1,200, 2,500 and 5,000 character prompts |

**Limits found by testing**

1. **`chat_completion` strips images.** A 64x64 solid-red PNG came back as
   "unsupported image" in the model's own reasoning.
2. **`create_response` does forward images**, but only small ones. Bracketed by
   test: a 64x64 PNG works, a 260px-wide JPEG (8.9 KB) works, a 300px-wide JPEG
   (11.5 KB) is dropped. Practical ceiling is roughly 12 KB of base64.
3. **The Files API does not solve it.** `upload_file` returns a valid `file_id`,
   but `create_response` with `input_image: { file_id }` is blind.
4. **`deepseek-v4-pro` times out** on multi-kilobyte payloads with reasoning
   enabled; `deepseek-flash` handles the same text.

**Consequence for this project**

Vision through the harness caps at a ~260px screenshot, which is too coarse to
judge typography, spacing or card geometry — exactly what the Aura work needs.
A text-only review was tried instead: `scripts/aura-deepseek-code-review.cjs`
sent the hero code plus the measured reference geometry and received seven
specific line-level CSS suggestions. **Applied and measured, they made the
result worse** (whole-screen difference 30.0% → 31.6%; composer 28% → 38.6%),
because the model was inferring from source without seeing the render. They were
reverted. The script is kept as a documented tool, not as an acceptance step.

Conclusion: the harness is sound for text work and available at low cost, but it
cannot substitute for Playwright + Pixelmatch on visual fidelity. Aura's own live
model already uses this same API through `lib/aura/provider.ts`.
