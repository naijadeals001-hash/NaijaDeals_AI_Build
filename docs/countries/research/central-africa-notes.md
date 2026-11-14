# Central Africa research notes — Discover Africa

Scope: Cameroon (CM), Central African Republic (CF), Chad (TD), Republic of the Congo (CG),
Democratic Republic of the Congo (CD), Equatorial Guinea (GQ), Gabon (GA), São Tomé and Príncipe (ST).

File: `docs/countries/research/central-africa.json`
Schema: matches the sibling region files (region, feature, accessedAt, editorialStandard,
countries[]; each country has code, slug, name, region, localizedNames, introduction,
exactly six themes, editorialStatus).

## Result — final editorial pass, 2026-11-14

- Countries: 8/8.
- Themes: 48/48, each with at least one live source that was fetched and checked.
- `editorialStatus`: `reviewed` for all eight.
- Duplicate theme keys within a country: none.
- Theme replacements: 0. No theme key needed to be swapped out; every theme had at least one
  authoritative source once the corrections below were made.
- Source citations removed: 3 (see "Citations withdrawn").
- `accessedAt`: 2026-11-14 on every source.

## Editorial status

| Country | Status | Basis |
|---|---|---|
| Cameroon | reviewed | WTO WT/TPR/S/445 annex, Trade Profile 2023, ONCC, SODECOTON, CDC and OAPI each support their themes. |
| Central African Republic | reviewed | WT/TPR/S/445 annex and Trade Profile 2023 support timber, coffee, cotton, sesame, cassava and livestock; FAO GIEWS supports the conflict context. |
| Chad | reviewed | WT/TPR/S/445 annex supports gum arabic, cotton, sesame, livestock and handicrafts; FAO GIEWS and the FAO Acacia project support the cereal and gum-arabic themes. |
| Republic of the Congo | reviewed | WT/TPR/S/445 annex and Trade Profile 2023 support cocoa, timber, cassava, sugar, fisheries and milling residues. |
| Democratic Republic of the Congo | reviewed | WT/TPR/S/339, Trade Profile 2023 and FAO GIEWS support all six themes. |
| Equatorial Guinea | reviewed | FAO GIEWS and Guinea Ecuatorial Press support cocoa, cassava, plantains and coffee; the World Bank overview supports the forests and marine-resources themes at sector level. |
| Gabon | reviewed | WT/TPR/S/445 annex, FAO GIEWS and ITTO support all six themes. |
| São Tomé and Príncipe | reviewed | FAO GIAHS supports the cocoa and agroforestry themes; Trade Profile 2023 supports chocolate, palm oil, copra and pepper. |

## Corrections made in this pass

- Cameroon — introduction: "Agriculture employs most of the workforce" was not supported by any
  cited source and was replaced with a qualitative statement. Cotton: "from northern Cameroon"
  was removed because the TPR only establishes smallholder sourcing. Cassava: "main food crops by
  volume" was softened to "staple food crops" because the WTO table's first row is ambiguously
  labelled in text extraction. Coffee: "oversees export quality control" and "indicative prices"
  were replaced with the TPR's actual rules (ONCC price indicators; all exports declared to ONCC).
- Central African Republic — introduction: gold and diamonds were separated from the
  agricultural-export claim. Coffee: the ORCCPA does not set indicative prices or control
  packaging; it approves buyers, certifies exports, and prices are fixed by ministerial order.
  Cassava: the FAO GIEWS brief does not mention cassava or groundnuts, so the theme now cites
  WTO figures for both crops and uses GIEWS only for conflict impact.
- Chad — cotton: export destination corrected from "mainly Europe" to "Asia and Europe".
  Sesame: unsupported regional qualifier removed. Millet: "south and centre" replaced with the
  TPR's Sahelian/Sudanian cereal zones. Handicrafts: the claim that handicraft enterprises get a
  dedicated investment-charter scheme is not in the Charter; replaced with the TPR's 0.4 percent
  of GDP figure.
- Republic of the Congo — timber: the association now states only verified duty, export-permit
  and 85/15 rough-wood rules. The earlier "sawn wood … significant exports alongside crude oil"
  and the ITTO citation (which only reports a slight sector contraction) were removed.
- Democratic Republic of the Congo — cocoa: "agricultural products are formally exempt from
  export duties" contradicts WT/TPR/S/339 paragraph 16, which lists green coffee and other
  products as dutiable; replaced with the ONC levy rates. Timber: "taxed by species and
  processing stage" replaced with the verified logs/edged-timber duty rationale.
- Equatorial Guinea — coffee: Casa Mallo is a cocoa-processing company with 30+ years in the
  country, not a "domestic firm". Timber and fisheries: wording aligned to what the World Bank
  overview actually says (natural assets; Agenda 2035 blue/green pillars).
- São Tomé and Príncipe — cocoa: shade system described as the four documented layers rather
  than "mirrors natural forest structure". The World Bank overview was cited for cocoa but only
  mentions cocoa prices, so it was withdrawn.

## Citations withdrawn

1. World Bank Cameroon overview — does not mention plantains; the WTO table covers both crops.
2. ITTO GTI report (Congo timber) — the article discusses Gabon and a slight Congolese
   contraction, not the duty or permit rules the theme describes. It remains cited for Gabon.
3. World Bank São Tomé overview — no cocoa-production content beyond a price remark.

## Source-quality caveats

- WTO Trade Profile export values are historical: 2018 (Cameroon), 2020 (CAR), 2021 (Congo and
  DRC), 2022 (São Tomé). They are not current market prices.
- CAR agricultural exports are very small in absolute terms (cotton, the leading line, was
  US$0.3 million in 2020). "Leading agricultural export" is a relative statement.
- São Tomé's total agricultural exports were US$17 million in 2022; "leading" is likewise relative.
- Chad has not reported trade data to UN Comtrade since 1995; the TPR uses mirror statistics.
- The DRC chapter is WT/TPR/S/339, dated 11 May 2016; the commodity values on the themes are
  from the 2023 Trade Profile, which reports 2021 data.
- Equatorial Guinea timber and fisheries rest on a single World Bank sentence about natural
  assets and diversification pillars. They assert sector relevance, not output or trade values.
- Guinea Ecuatorial Press is the government press service; its articles report plans and
  meetings, not realised production. The cocoa and coffee themes are worded as proposals.
- Customs Union (CEMAC) TPR annexes use 2012–2021 series in places; dates are stated in the text.

## URLs checked in this pass

Downloaded and text-searched (HTTP 200, PDF):

- https://www.wto.org/english/tratop_e/tpr_e/s445-02_e.pdf (Cameroon)
- https://www.wto.org/english/tratop_e/tpr_e/s445-03_e.pdf (Congo)
- https://www.wto.org/english/tratop_e/tpr_e/s445-04_e.pdf (Gabon)
- https://www.wto.org/english/tratop_e/tpr_e/s445-05_e.pdf (CAR)
- https://www.wto.org/english/tratop_e/tpr_e/s445-06_e.pdf (Chad)
- https://www.wto.org/english/tratop_e/tpr_e/s339_e.pdf (DRC)
- https://www.wto.org/english/res_e/statis_e/daily_update_e/trade_profiles/CM_E.pdf
- https://www.wto.org/english/res_e/statis_e/daily_update_e/trade_profiles/CF_E.pdf
- https://www.wto.org/english/res_e/statis_e/daily_update_e/trade_profiles/CG_E.pdf
- https://www.wto.org/english/res_e/statis_e/daily_update_e/trade_profiles/CD_E.pdf
- https://www.wto.org/english/res_e/statis_e/daily_update_e/trade_profiles/ST_E.pdf

Fetched as HTML:

- https://www.oncc.cm
- https://sodecoton.cm/
- https://cdc-cameroon.net/new2014/about-cdc/
- https://oapi.int/2025/06/30/loapi-fiere-partenaire-du-1er-festival-international-du-poivre-de-penja/
- https://www.worldbank.org/en/country/cameroon/overview
- https://cb.apps.fao.org/country.jsp?code=CAF&lang=en
- https://cb.apps.fao.org/country.jsp?code=TCD&lang=en
- https://www.fao.org/dryland-forestry/projects/detail/acacia-operation-project--support-to-food-security--poverty-alleviation-and-soil-degradation-control-in-the-gums-and-resins-producer-countries/
- https://cb.apps.fao.org/country.jsp?code=COG&lang=en
- https://cb.apps.fao.org/country.jsp?code=COD&lang=en
- https://cb.apps.fao.org/country.jsp?code=GNQ&lang=en
- https://www.guineaecuatorialpress.com/noticias/el_comite_nacional_para_la_diversificacion_economica_recibe_a_los_productores_de_cacao_de_bioko
- https://www.guineaecuatorialpress.com/index.php/noticias/el_gobierno_cuenta_con_casa_mayo_para_la_produccion_del_cacao_y_el_cafe
- https://www.worldbank.org/en/country/equatorialguinea/overview
- https://cb.apps.fao.org/country.jsp?code=GAB&lang=en
- https://www.itto.int/news/2026/10/19/gti_report_brazilian_thai_timber_sectors_strong_amid_wider_production_improvement/
- https://www.fao.org/giahs/giahs-around-the-world/sao-tome-and-principe-cocoa-agroforestry-system/en
- https://www.worldbank.org/en/country/saotome/overview

## Tooling note

WebFetch cannot parse PDFs, so WTO PDFs were downloaded with curl and converted with pdftotext.
Column layout in the crop and trade tables is jumbled by text extraction; every figure used was
cross-checked against the labelled row and, where possible, against a second source. Figures that
could not be tied unambiguously to a labelled row were removed rather than guessed.

## Localized names

French names follow the standard official forms (Cameroun, République centrafricaine, Tchad,
République du Congo, République démocratique du Congo, Guinée équatoriale, Gabon). Equatorial
Guinea also carries its Spanish and Portuguese official forms; São Tomé and Príncipe carries the
Portuguese form. No sourced claim depends on these names.
