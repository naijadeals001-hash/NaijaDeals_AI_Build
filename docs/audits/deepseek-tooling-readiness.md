# Tooling readiness (REA, ECC, Soup, MCP, browser, Android)

States are distinct: **installed** (files present) · **connected** (client can call it) ·
**executed** (a real call returned) · **verified** (result checked against a real target).

| Capability | Version / identity | Evidence | State | Limitation |
| --- | --- | --- | --- | --- |
| REA CLI + MCP | `rea-agents` 6.8.0 | `rea doctor --client dsh` → aligned; 229 `mcp__rea__*` tools; `binary_session` responded | Connected · Executed | Tool count ≠ capability; providers separate |
| REA skill | `reverse-engineer-anything` v49 | 8/8 files SHA-256 identical to package | Verified | Instructions only |
| Browser CDP | Chrome 156.0.8078.74, dedicated profile, `127.0.0.1:9222` | Uber KE, Uber price estimate, Bolt KE, NaijaDeals preview inspected; 4 screenshots | Executed · Verified | Passive only; headless rendering |
| Playwright | `playwright-core` with installed Chrome 156.0.8078.74 | `chromium.launch` + DOM assertion executed today (`playwright-smoke`) | Executed | No trace/video configured |
| Ghidra provider | 12.1.4 + JDK 21.0.12 | `open_binary` + `binary_overview` on a PE (27 s, provider ghidra 12.1.4) | Executed | Deferred by instruction |
| JADX provider | `jadx-headless-mcp` 0.7.1 (`6e5eacf5…`) | `inspect_android_package` on the local APK (7 s) | Executed | Static only |
| apktool | 3.0.3 (`dbf930b0…`) | `decode_android_resources` → 1207 files | Executed | Resource decode only |
| adb | platform-tools 37.0.1 | `inspect_adb_client`; `list_adb_devices` → `[]` | Installed · Executed | **No device or emulator** |
| ECC | plugin 2.2.3 (120 skills, 68 agents, 94 commands) | manifest + inventory + `claude 2.1.156`; skill bodies loaded through Soup | Installed · partially exercised | No ECC agent run in this repo yet |
| Soup | local MCP router (BM25 over `~/.claude/skills`) | CLI `route()` + MCP `recommend_ecc_skills` returned 4 skills with bodies | Executed · Integrated | Route table curated; unrelated queries return none |
| OpenCode skills | 4 project skills | read in full: admin-demo, user-demo, reference-research, project-workflow | Installed | Two are trivial existence checks |

## Blockers

1. **Android runtime:** no device/emulator attached, so no dynamic Android or adb capture.
2. **Reference APK:** the only APK is Aptoide `cm.aptoide.pt` 10.0.0 — no genuine Uber/Bolt app
   to compare against.
3. **Image generation:** `DEEPSEEK_API_KEY` exists in `.env`, but no server route or script calls
   an image endpoint, and no KIE key is present. The playbook's image pipeline is therefore
   **BLOCKED** until an endpoint is verified or an open-source generator is chosen.
4. **Email/SMS:** no provider configured; Phase 03 reset-email evidence cannot be produced.
5. **Push to GitHub:** `403` for the configured credential (documented in the handoff).

## Housekeeping

- Remove or wire the 10 TODO stub services before they mislead future work.
- The four project OpenCode skills are thin; the playbook's "project-specific skills" list
  (10 skills) is not implemented.
