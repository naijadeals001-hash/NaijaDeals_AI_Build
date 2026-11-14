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
