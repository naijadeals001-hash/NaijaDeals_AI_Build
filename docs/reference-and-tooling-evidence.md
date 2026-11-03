# Reference folder and tooling evidence

Verified 2026-11-03 on the NaijaDeals workstation. Every row below was executed; nothing is
inferred from a tool being present. Machine-specific paths use `~` for the user home.

## 1. Capability matrix

States are separate: **installed** (files present), **connected** (client can call it),
**executed** (a real command or tool call returned), **verified** (its result was checked
against a real target).

| Capability | Dependency | Verified command / tool | Result | Limitation |
| --- | --- | --- | --- | --- |
| REA CLI + MCP server | `rea-agents` 6.8.0 | `rea --version`; `rea doctor --client dsh`; MCP `binary_session` | Installed, connected, executed. Doctor state `aligned`; 229 tools advertised | Registration is not capability; each provider below is separate |
| REA agent skill | `reverse-engineer-anything` (skill version 49) | SHA-256 of all 8 files vs the published package | Verified: `SKILL.md` and 7 reference guides identical to `rea-agents` 6.8.0 | Instructions only; installing it does not add tools |
| REA browser / CDP | Chrome 156.0.8078.74, dedicated profile, loopback CDP on 127.0.0.1:9222 | `list_browser_targets`, `inspect_web_page`, `capture_web_screenshot` | Executed and verified on Uber Kenya, Uber price estimate, Bolt Kenya and the local NaijaDeals preview | Passive capture only; one origin per capture; headless rendering; no clicks or navigation performed |
| REA native (Ghidra) | Ghidra 12.1.4 (REA's verified build) + JDK 21.0.12 | `open_binary` + `binary_overview` on `elevate.exe` | Executed: provider `ghidra` 12.1.4, overview returned in 27 s | Installed for future need and deliberately not used further; no native-analysis requirement yet |
| REA Android (JADX) | `jadx-headless-mcp` 0.7.1 JAR, SHA-256 `6e5eacf5…ff75` + JDK 21 | `inspect_android_package` on the reference APK | Executed in 7 s: package `cm.aptoide.pt` 10.0.0 (13001) | Static only; APK never executed; see the APK finding below |
| apktool | 3.0.3 JAR, SHA-256 `dbf930b0…9423` | `decode_android_resources` | Executed: 1207 files decoded, manifest parsed | Resource decoding only; smali skipped by design |
| Android platform-tools | 37.0.1, SHA-1 `e03e78b1…1110` (Google manifest) | `inspect_adb_client`, `list_adb_devices` | Executed: adb 37.0.1-15733141, zero devices attached | No Android device or emulator is connected |
| JADX CLI | 1.5.6, SHA-256 `545ea2be…8974` | `jadx --version` | Installed and executed | Separate from REA's MCP bridge JAR; not used by REA |
| ECC | `ecc` plugin 2.2.3 in `~/.claude` | Manifest parse, asset inventory, `claude --version`, ECC skill bodies returned through Soup | Installed: 120 skills, 68 agents, 94 commands, rules tree; installed 2026-10-30 with 517 file operations | No ECC agent or hook has been run in this repository yet |
| Soup | Local MCP server in `~/Documents/NaijaDeals-Lab` (Python venv, BM25 over ECC skills) | `route()` via its venv, then the registered MCP tool `recommend_ecc_skills` | Executed and integrated: returns selected ECC skills plus full instructions | Route table is curated; unrelated queries legitimately return no skills |

## 2. REA implementation evidence

- CLI: `rea-agents` 6.8.0, binary at `~/AppData/Roaming/npm/rea.ps1`, Node 26.13.0.
- Registration: the DSH home Cordis patch `~/.dsh/cordis.patch.yml` adds the
  `@deepseek-ai/dsh-mcp-client` entry `rea`; `rea doctor --client dsh` reports
  `state: aligned` both from this repository and from the user home directory.
- Connection proof: the model surfaced 229 `mcp__rea__*` tools, and
  `mcp__rea__binary_session` returned the live capability inventory.
- Provider environment is passed through the same MCP entry (`GHIDRA_INSTALL_DIR`,
  `JAVA_HOME`, `REA_JADX_MCP_JAR`, `REA_APKTOOL_COMMAND`, `REA_ADB_PATH`); the exact
  machine paths stay in the local client configuration, not in this repository.
- Every external download was checked against an upstream published digest before use:
  JADX MCP JAR against REA's pinned SHA-256, apktool and JADX against their GitHub release
  digests, platform-tools against Google's `repository2-3.xml` SHA-1.

## 3. Browser evidence (dedicated profile, loopback only)

Chrome was launched with `--remote-debugging-address=127.0.0.1` and a dedicated
`--user-data-dir` outside the repository. Debugging was never exposed beyond loopback.

| Target | REA operation | Evidence ID | Screenshot SHA-256 |
| --- | --- | --- | --- |
| Uber Kenya homepage | `inspect_web_page` | `ev_f8319b3d…61a7e089` | `266dcd32…f4826a` |
| Uber public price estimate | `inspect_web_page` | `ev_041ece60…990cba` | `d8aae732…ed465f` |
| Bolt Kenya homepage | `inspect_web_page` | `ev_ef067a26…32bf4` | `1803f9ca…67e9ff4` |
| NaijaDeals preview `http://localhost:3000` | `inspect_web_page` | `ev_f88136ee…e1bd81d` | `c360d6d2…f85bb36f` |

Observed structure (DOM node counts: Uber 3075 / Bolt 1861 / NaijaDeals 600):

- **Uber Kenya** – dark hero "Go anywhere", two-field pickup/dropoff with "See prices",
  top navigation Ride / Earn / Travel / Business / Uber Eats / About, app-download block,
  cookie consent. The public price-estimate page exposes the same estimator without login.
- **Bolt Kenya** – light hero "Riding is the new driving", one primary "Get Bolt" action,
  service cards, minimal navigation (Support, Register), cookie preferences.
- **NaijaDeals** – multi-vertical left rail (NaijaEats, Fresh, Drive, Send, Gigs, Stay,
  Stream, Pay, Aura AI), dark hero "One app for the way Africa moves, shops and pays",
  Lagos/Nigeria/Naira chip, search field, three quick actions and an ecosystem grid.

Comparison for this phase: Uber and Bolt both collapse the journey to a single
location-first action; NaijaDeals leads with an ecosystem rail and a search field. The
gap worth testing next is a single primary ride action above the fold on the ride entry
point, not a change to the ecosystem navigation. No competitor page was copied, and no
booking, payment or external transaction was attempted.

## 4. Android toolchain evidence

Installed under the user Tools directory, outside the repository:

- JDK 21.0.12 (Eclipse Adoptium) – required by both Ghidra and the JADX bridge; `javac`
  and `java --list-modules` both respond.
- Android platform-tools 37.0.1 – `adb version` 1.0.41 / 37.0.1-15733141.
- apktool 3.0.3 – `--version` 3.0.3; REA resolved it through `REA_APKTOOL_COMMAND`.
- JADX 1.5.6 CLI – `--version` 1.5.6 (general CLI, not REA's bridge).
- `jadx-headless-mcp` 0.7.1 all-in-one JAR – REA's required bridge; digest matched the
  pinned constant in `JadxRelease.js`.

### APK finding (corrects the earlier record)

The only APK on this workstation is `taxify-driver.apk` (13,074,189 bytes, identical
SHA-256 `cd3a042b…7fc47` in both `~/Downloads` and `~/Documents/Uber and Bolt`).
Static inspection shows it is **not** a Bolt/Taxify client:

- package `cm.aptoide.pt`, version 10.0.0 (code 13001), minSdk 26, targetSdk 35
- an app-store client (Aptoide), not a ride-hailing app

Consequence: no genuine Uber or Bolt APK is available, so no competitor Android
behavioural analysis has been performed. The toolchain is proven on a real APK; the
reference target is missing. Any claim about Bolt app behaviour would be fabricated.

## 5. ECC and Soup

- **ECC** is installed as a Claude Code plugin (`ecc` 2.2.3, MIT, `ecc.tools`): 120
  skills, 68 agents, 94 commands, and a language rules tree under `~/.claude`.
  `install-state.json` records 517 file operations. The CLI responds
  (`claude 2.1.156`). Its skill bodies are readable and are the source Soup selects from.
- **Soup** is a local skill router, not a vendor product: a Python MCP server in
  `~/Documents/NaijaDeals-Lab` that BM25-selects ECC skills from `~/.claude/skills`.
  It ran from its venv and through the MCP client, returning e.g. `backend-patterns`,
  `api-design`, `frontend-patterns`, `coding-standards` with their instructions.

Integration: the `naijadeals-soup` MCP entry was added next to `rea` in the DSH home
patch, so the workflow can call `recommend_ecc_skills` before implementation. ECC remains
the primary workflow; REA supplies reference research; Soup selects the skill set.

## 6. Reference folder inventory

`~/Documents/Uber and Bolt` – 365 files, 542.9 MB: 193 PNG, 168 JPG, one MP4 demo
(83.5 MB), one APK (see above), one unrelated installer, one text prompt, and the
`2026-08` / `2026-09` screenshot sets. This is research material, not application code;
nothing in it is imported into the site.

## 7. Remaining blockers

- No genuine Uber/Bolt APK exists locally; Android behavioural comparison is blocked
  pending a user-supplied APK.
- No Android device or emulator is attached, so no runtime Android observation is possible.
- Phase 01 is still BLOCKED on its other exit criteria (skills selection documented,
  disposable failing CI check, coverage baseline, regression suite); tooling verification
  alone does not pass the phase.
