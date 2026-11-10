# Aura AI — documentation read record (2026-11-05)

Recorded so coverage is explicit rather than assumed.

## Read in full

| File | Lines | Notes |
|---|---|---|
| `AGENTS.md` | 351 | Project rules 1-23, the repeatable execution method, and the mandatory Kie.ai media directive (MCP first, API fallback, model table, cost control, provenance) |
| `docs/architecture.md` | 90 | **Stale** — dated 2026-11-03 at HEAD `7590af5`, still lists NaijaEats/Fresh/Gigs/Stay/Stream/Aura as NOT STARTED. Used only for the auth/authorization model and request flow, which remain accurate |
| `docs/decisions.md` | 113 | One `User` model across all verticals; `actorType` + roles; `getSessionUser()` → `toPublicSessionUser()` |
| `docs/naijapay-status.md` | — | Readiness categories and the NaijaPay tool surface |
| `docs/naijapay-ledger-forensics.md` | — | Two-book ledger; a balanced posting cannot remove an existing difference |
| `docs/naijapay-tooling-evidence.md` | — | REA/Kie verified; ECC and Soup not installed |
| `lib/services/stream/aura.ts` | 118 | The existing grounded-retrieval pattern: retrieve from real records, pass facts to the model only to phrase, never invent items |
| `lib/services/config.ts`, `lib/auth/permissions.ts`, `lib/auth/guard.ts` | — | Existing provider config, permission catalogue, `requireUser` / `requireAdminPermission` / `assertSameOrigin` |
| `design-references/approved/AuraAI/aura-desktop-dark.png`, `aura-mobile-dark.png` | — | Approved visual references, hashed in `docs/aura-tooling-evidence.md` |

## Read in part (explicitly partial)

- `docs/handoff.md` (2,371 lines): read the NaijaPay section and the latest entries.
  Earlier vertical sections were **not** re-read line by line — the vertical code and
  their test suites were inspected directly instead.
- `docs/phase-tracker.md` (457 lines): searched for Aura/AI entries (none exist) and
  read the surrounding increment format. Not read end to end.
- `prisma/schema.prisma` (~2,600 lines): read the models Aura needs to query
  (StayProperty, StayUnit, Restaurant, MenuItem, Dish, FoodOrder, ProfessionalProfile,
  ServiceBooking, Product, LogisticsShipment, Ride, StreamTrack, Wallet, WalletTopUp,
  EscrowMilestone) plus the auth models. Not read end to end.

## Repository facts that shaped the design

- `/aura-ai` is referenced by navigation and `lib/data/ecosystem.ts` but **no route
  exists**. `/naijastream/aura` is a Stream artist page, not the assistant.
- `lib/services/config.ts` already reads `AI_PROVIDER` (default `openai`); no Aura
  provider abstraction exists yet.
- Catalogue is real but thin: 6 stays (1 in Abuja), 9 restaurants (all `VERIFIED`),
  4 published gig professionals (all Lagos), 168 products, 22 stream tracks,
  1 logistics provider. The product must therefore handle empty results per vertical
  honestly rather than implying breadth that does not exist.
- Database: `naijadeals_core` on localhost, classified TEST.
- Preview: task `NaijaDealsPreview3015`, serves `.next-pay`, port 3015. Rebuilding
  with `next build` alone leaves it stale.
