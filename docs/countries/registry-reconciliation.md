# Discover Africa — registry reconciliation

Date: 2026-11-14. Owner: NaijaDeals Product/Editorial.

## Two registries, deliberately separate

| Registry | Purpose | Current content | What it enables |
|---|---|---|---|
| Commerce registry — `lib/config/commerce.ts` | Checkout, delivery, currency, language and operating entity | `NG`, `GH`, `KE`, `ZA`, `GB`, `US` | Only these configured markets can transact. Four are African. |
| Discovery registry — `CountryProfile` + `CountryTheme` | Editorial country guides, themes, sources and recorded product origin | 54 African countries | Browse, search, share and link a country guide. It does **not** enable checkout, delivery, currency, language or a marketplace entity in that country. |

A country appearing in Discover Africa is not a claim that NaijaDeals operates, delivers or sells there. The storefront header still shows the visitor's selected delivery market, and a country guide never mutates that selection.

## Authoritative baseline

The 54-country discovery set reconciles to the **54 African member states of the United Nations** (UN member-state list, accessed 2026-11-14: https://www.un.org/en/about-us/member-states). The African Union has **55 members** because it also admits the Sahrawi Arab Democratic Republic (Western Sahara). That difference is recorded below rather than silently merged.

Regional count: North 6, West 16, Central 8, East 14, Southern 10 = **54**. Codes are ISO 3166-1 alpha-2; slugs are stable lowercase names. Names follow the project's approved display forms (for example Côte d'Ivoire, Cabo Verde, Eswatini, Democratic Republic of the Congo, Republic of the Congo, São Tomé and Príncipe).

## Territory and disputed-status treatment

| Territory | Treatment | Reason |
|---|---|---|
| Western Sahara (EH) | **Excluded from the 54 country pages.** Documented separately here. | It is a UN non-self-governing territory, not a UN member state, and its status is disputed. It is an African Union member under the Sahrawi Arab Democratic Republic. Adding it requires an owner decision; it is not silently merged into Morocco. |
| Somaliland | **Excluded.** | Not a UN member state and not an African Union member; no project registry entry. |
| Morocco | Included as MA. Its guide does not assert sovereignty over Western Sahara. | UN member state. |
| São Tomé and Príncipe | Included as ST. | UN member state and African Union member. |
| Cabo Verde | Included as CV, display name “Cabo Verde”. | UN member state and African Union member. |
| Côte d'Ivoire | Included as CI, with the accented display name; aliases resolve to the same slug. | UN member state. |
| Eswatini | Included as SZ, display name “Eswatini”; not “Swaziland”. | UN member state. |
| Congo | Two distinct pages: CG “Republic of the Congo” and CD “Democratic Republic of the Congo”. | Separate UN member states; never merged. |

## Coverage rule

Every row in `CountryProfile` with `publicationStatus = PUBLISHED` is reachable from:

1. the horizontally scrollable Shop country-card row;
2. the searchable `/naijashop/countries` directory; and
3. its own `/naijashop/countries/[slug]` landing page.

`homeFeatured` only changes order. It does not add or remove coverage. Unpublishing hides a guide from the public directory and landing route but deletes neither the country record, its themes/sources, nor any product, origin record or historical order.

## Verified counts at this baseline

- 54 country profiles, 54 published, 0 needs-review
- 324 themes (6 per country), 362 source records, 0 themes without a source
- 54 flag SVGs (flagcdn public-domain set)
- Country-guide editorial review status: 54/54 `REVIEWED`
- Commerce activation is unchanged; this registry adds no live vertical, price, stock or delivery claim
- Recorded product-origin inventory: 0 (the origin tests use a run-owned product that is removed)

## Permission separation (2026-11-13)

Discover Africa publication, editorial editing and origin verification are separate capabilities:

| Role | Read | Edit | Publish / unpublish | Origin review |
|---|---|---|---|---|
| `country_editor` (new) | yes | yes | **no** | **no** |
| `country_publisher` | yes | no | yes | no |
| `country_origin_reviewer` | yes | no | no | yes |
| `admin` | yes | yes | **no** | **no** |
| `super_admin` | yes | yes | yes | yes |

- `country_editor` is in `STAFF_ROLES` and the assignable-role allowlist; it follows the existing explicit Plus+ role pattern.
- Region scope applies to every route: a GH-scoped editor may edit GH but receives `403` for another market's country, theme, audit or origin record. The admin country list itself is scope-filtered.
- Role assignment cannot delegate `roles:write`; an editor cannot grant roles.

## Publication invariants (2026-11-13)

- Every country mutation takes the `CountryProfile` row lock first. Publication validates themes, sources, images, alt text, image kind/provenance and review status inside that lock, so a concurrent edit cannot invalidate a just-published country. A concurrent edit either commits before validation or waits and then sees `published_country_locked`.
- A published theme cannot lose its image, alt text, image provenance or last source. Removing any of them returns `409 published_country_locked`; a partially invalid update is rejected without changing the theme.
- Changing a published theme image requires matching alt text, an image kind (`GENERATED`, `APPROVED_EXISTING` or `ILLUSTRATION`) and recorded provenance in the same update. The service rejects the whole update otherwise.
- Source replacement validates the complete set (HTTP(S) URL, title, access date, no duplicates) before writing, then deletes and inserts inside one serialized transaction. Concurrent replacements leave exactly one complete set.
- The seed script uses the same lock order and replaces each country's profile, themes and sources in one transaction, removing themes not present in the reviewed registry. A mid-write failure rolls the country back; no delete-then-crash partial state.
- No migration was required: `CountryThemeSource` already has `@@unique([themeId, url])`; serialization comes from the profile row lock.
- Audit rows for theme and profile edits record before/after **content** (image path, alt, kind, provenance, review status and source titles/URLs/access dates), including unpublished drafts. Audit is written in the mutation transaction.

## REVIEW database guard (2026-11-13)

Every mutating Discover Africa script requires an explicit `REVIEW_DATABASE_URL`. `DATABASE_URL` and `.env` are never used as a fallback. The shared `scripts/lib/country-review-db.ts` guard verifies the URL target, live `current_database()`, a deny list, the required country tables and an explicit `DatabaseClassification` REVIEW row before any write. The acceptance script loads the same guard through `tsx/cjs`, creates a run-owned DRAFT country and product, and never unpublishes an accepted country.
