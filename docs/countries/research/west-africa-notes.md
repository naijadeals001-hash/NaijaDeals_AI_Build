# West Africa country research — notes

Date of access: 2026-11-14 (tool timestamps on the research host read 2026-11-14).
Scope: Benin (BJ), Burkina Faso (BF), Cabo Verde (CV), Côte d'Ivoire (CI), Gambia (GM),
Ghana (GH), Guinea (GN), Guinea-Bissau (GW), Liberia (LR), Mali (ML), Mauritania (MR),
Niger (NE), Nigeria (NG), Senegal (SN), Sierra Leone (SL), Togo (TG).

Output: `docs/countries/research/west-africa.json`.
No application code, schema, migration, database or shared registry was edited.

## Result

- 16 countries present, in the order requested.
- 6 themes per country (96 total), unique keys within each country.
- **96 of 96 themes have at least one fetched source (100%).**
- **0 themes with empty sources; 0 `reviewStatus: "needs-source"` tags.**
- **16 of 16 countries have `editorialStatus: "reviewed"`.**
- 9 themes carry two sources; no theme carries more than two.
- 53 unique source URLs.
- Introductions are 35–39 words each, two sentences.
- No producers, certifications, landmarks, prices, rankings or imagery were invented.
  Themes are editorial associations, not a claim that NaijaDeals stocks or sources the product.

Schema matches `north-africa.json` (root: region, feature, accessedAt, editorialStandard,
countries, sources; country: code, slug, name, region, localizedNames, introduction, themes,
editorialStatus; theme: key, label, association, sources).

## Resolution of the seven previously unsourced themes

Five themes were sourced in place; two were replaced because no authoritative source could be
fetched for the original commodity. Every new source was fetched and read during this pass.

| Country | Theme | Action | Source used |
|---|---|---|---|
| Benin | Cotton | Sourced in place | WTO Trade Policy Review WT/TPR/S/362 — states cotton and its by-products dominate Benin's goods exports. |
| Gambia | Groundnuts | Sourced in place | NFSPMC (nfsc.gm) — national food-security corporation; reports 100k+ tonnes purchased over the last five years. |
| Guinea-Bissau | Fisheries | Sourced in place | Ministério das Pescas (pescas.gw) — 245 licences, 234 vessels, January biological rest. |
| Guinea-Bissau | Palm oil | **Replaced** with "Bijagós ecotourism" | IBAP ecotourism site (ecoturismo.ibapgbissau.org) — Bolama-Bijagós Biosphere Reserve and protected-area visits. |
| Guinea-Bissau | Island crafts | **Replaced** with "Services" | World Bank Guinea-Bissau overview — names services alongside agriculture as a key growth driver. |
| Mali | Bogolan | Sourced in place | WIPO presentation on geographical indications and traditional knowledge for Bogolan (100% cotton, clay, plant tannins). |
| Togo | Cotton | Sourced in place | Présidence de la République Togolaise — 60,403 tonnes of seed cotton in 2024-2025, 797 kg/ha average yield. |

Guinea-Bissau now reads: cashew, rice, coarse grains, fisheries, Bijagós ecotourism, services.
The country intro still holds, and no craft or palm-oil claim is made without a source.

## Editorial status

All 16 countries are `reviewed`: every theme has at least one fetched source, and no country
retains a needs-source theme.

## Source-quality flags for coordinator

1. Côte d'Ivoire — all six themes cite the same World Bank country overview. The page names each
   commodity, but sector-level Ivorian sources (Conseil du Café-Cacao, cashew and palm-oil bodies)
   should be added before publication.
2. Senegal — all six themes cite the ASEPEX homepage/sector listing. It confirms the agency promotes
   mangoes, seafood, agri-food, handicrafts, cosmetics and textiles; it does not give volumes.
   Do not add tonnage or market-share claims without a new source.
3. Cabo Verde — four themes cite the same World Bank overview (tourism, blue economy, renewables,
   export services are separate sentences on that page). Export services also cites TradeInvest.
4. Shea themes for Benin, Burkina Faso, Ghana and Nigeria share the Global Shea Alliance "about"
   page. It supports the sector and rural-women framing, not country volumes.
5. Ghana cocoa — COCOBOD's site is marked "under construction"; the producer-price and
   exports-by-destination statements come from that page and should be re-checked before publication.
6. Benin pineapple — the 450,000-tonne figure and the Pain de Sucre PGI (2020) come from the
   PACOFIDE/MAEP page; treat as a project estimate, not an official final statistic.
7. Benin cotton — the WTO Trade Policy Review is WT/TPR/S/362 (2017 trade-policy cycle). It supports
   cotton's dominance of goods exports and its fiscal weight, not current production volumes.
   Date-stamp any future reuse and prefer a current MAEP/DSA series if one becomes reachable.
8. Gambia groundnuts — NFSPMC's "100k+MT" is a five-year purchase figure on its homepage, not an
   annual or export statistic. The association deliberately says "purchased in recent seasons".
9. Guinea-Bissau fisheries — the 245 licences / 234 vessels are Ministry of Fisheries website
   statistics without a stated reference year. Do not present them as current annual totals.
10. Guinea-Bissau ecotourism — IBAP is the protected-areas authority; the site describes reserves,
    guides and a code of conduct. It is not a booking or commercial-tourism source.
11. Mali bogolan — the WIPO document is a 2025 colloquium presentation by the BÔGÔ DANBÉ group.
    It documents the product and its GI process, not export volumes or a certification claim by
    NaijaDeals.
12. Togo cotton — the 60,403-tonne / 797 kg-per-hectare figures are the government's 2024-2025
    campaign report. They are historical and should be re-dated if reused next season.
13. Mauritania iron — the 27% export-volume contribution is SNIM's own 2025 figure; it is a company
    statement, not a national statistical series.
14. Gambia tourism — the 5.4% / 120,713 arrivals figure is the World Bank's H1 2026 number and is
    time-bound; re-check before publication.

## Access caveats (observed, not predicted)

- `intracen.org` (ITC) returned HTTP 403 to plain fetch and to a headless browser.
- `afdb.org` returned HTTP 403 behind a Cloudflare challenge.
- `ich.unesco.org` served an anti-bot challenge; no UNESCO citation was used.
- `gouvernement.ml` timed out repeatedly; the bogolan theme instead cites the WIPO document.
- `maliweb.net` returned HTTP 403.
- `instad.bj` cotton monograph PDF returned HTTP 503 (and an HTML error body).
- `bibliotheque-cci.bj` served an expired TLS certificate; not cited.
- `banque-france.fr` PDF returned HTTP 403.
- `aicbenin.org` failed DNS resolution; `apiex.bj` returned HTTP 522; `apimali.gov.ml` is in
  maintenance; `cepici.ci` and `conseilcafecacao.ci` were not fetchable; `agriculture.gouv.bj`,
  `agriculture.bf`, `mofafwr.gm` and `gov.gw` timed out or did not resolve.
- African Cashew Alliance country profiles are member-only; World Bank project-detail pages render
  a JavaScript shell; the World Bank projects API returned empty records for the Guinea-Bissau
  project IDs tested.
- WTO and WIPO PDFs were fetched with `curl` and read with `pdftotext` (WebFetch rejects
  `application/pdf`). HTTP 200 and the quoted passages were confirmed before citing.

## Verification performed

- JSON parses without error; 16 countries, 6 themes each, unique keys per country.
- Every theme has at least one source; every source carries `accessedAt: "2026-11-14"`.
- Every country is `editorialStatus: "reviewed"`; no `reviewStatus: "needs-source"` remains.
- Introductions are within 35–70 words.
- Every global source registry row has a publisher; registry count equals unique theme-source URLs.
- Each newly added URL was fetched at least once in this pass (HTML by WebFetch, PDFs by download
  plus text extraction). No URL or claim was invented.
