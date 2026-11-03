# Reconciled Phase Mapping

This document reconciles the conflicting phase definitions found in the NaijaDeals Phased Build Playbook (table at line 37 vs. Part M at line 1188).

| Canonical Phase | Title (Table) | Title (Part M) | Intended Scope / Dependencies |
| :--- | :--- | :--- | :--- |
| **00** | Verified baseline and recovery | Verified baseline and recovery | Baseline; None. |
| **01** | Development skills, tests, gates | REA, ECC, Soup, MCP, skills | Tooling; Requires 00. |
| **02** | Design system, app shells | Unified Control Center integration | Design; Requires 01. |
| **03** | Identity, login, security | Responsive website/PWA/mobile | Auth; Requires 02. |
| **04** | Customer dashboard, account | Pan-African Discovery Engine | Dashboard; Requires 03. |
| **05** | Admin Control Center, permissions | NaijaShop/Stay/Property integration | Admin; Requires 03, 04. |
| **06** | Partner dashboards, onboarding | NaijaDrive/Send/Eats/Fresh | Partner; Requires 05. |
| **07** | Wallet, payments, settlement | NaijaPay, trust, automation | Finance; Requires 05, 06. |
| **08** | NaijaShop commerce | NaijaGigs, Stream, Aura AI | Shop; Requires 07. |
| **09** | NaijaDrive core rides | Android/iOS, driver app, expansion | Drive; Requires 07. |
| **10** | NaijaSend | Security, perf, DR, production | Send; Requires 08, 09. |
| **11** | Notifications, support | (Part of 10) | Ops; Requires 08–10. |
| **12-20** | (See Table Line 37) | (Not mapped in Part M) | (Preserve table structure) |

### Resolution Rules:
1.  **Canonical Identity:** The Table (Line 37) is the authoritative source for phase numbering and outcome titles.
2.  **Part M Conflict:** Part M serves as an *implementation suggestion* (Part M: "These are proposed workstreams... preserve their numbering... create cross-reference").
3.  **Preservation:** Requirements in the core playbook (Phase prompts 00-20) MUST be preserved over Part M implementation suggestions if they conflict.
4.  **Tracker Update:** The `docs/phase-tracker.md` MUST reflect the Canonical table (Phase 00-20).
