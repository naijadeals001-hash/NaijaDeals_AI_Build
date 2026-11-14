# Southern Africa country research — notes

Date of access: 2026-11-14 (tool timestamps on the research host read 2026-11-14).
Scope: Angola (AO), Botswana (BW), Eswatini (SZ), Lesotho (LS), Malawi (MW),
Mozambique (MZ), Namibia (NA), South Africa (ZA), Zambia (ZM), Zimbabwe (ZW).

Output: `docs/countries/research/southern-africa.json`.
No application code, schema, migration, database or shared registry was edited.

## Result — final editorial pass, 2026-11-14

- 10 countries present.
- 6 themes per country (60 total), unique keys within each country.
- 60 of 60 themes have at least one source; no theme has `sources: []`.
- `editorialStatus`: `reviewed` for all ten.
- This pass reviewed the one country still marked `needs-review`: Zimbabwe. Result for the
  reviewed scope is **1/1**.
- Theme replacements: 0. All six Zimbabwe theme slots are supported; none needed swapping.
- `accessedAt`: 2026-11-14 on every source.

## Editorial status

| Country | Status | Reason |
|---|---|---|
| Angola | reviewed | FAO Angola, the 2004 FAO/WFP crop assessment and FAO's non-wood forest products review support five themes; diamonds cite World Bank WITS. |
| Botswana | reviewed | Beef from the parastatal BMC plus FAO; diamonds from Debswana; crafts from the tourism board; soda ash, wiring sets and copper from WITS. |
| Eswatini | reviewed | Sugar from the industry association; candles and timber from named companies; flavourings, coal and bananas from WITS and FAO. |
| Lesotho | reviewed | LNDC, World Bank and WITS together support all six; textiles is the largest private employer per the World Bank. |
| Malawi | reviewed | WITS supports tobacco, tea, sugar and groundnuts; MITC supports tea and macadamia; FAO supports honey. |
| Mozambique | reviewed | IAM and FAO MAFAP support cashew; IAOM supports cotton and sesame; FAO supports honey and palm crafts; WITS supports aluminium. |
| Namibia | reviewed | Meat Board, Namdeb, NFCPT, Agra, FAO and WITS each support one theme. |
| South Africa | reviewed | All six themes cite the relevant industry body (Rooibos Council, WOSA/Vinpro, CGA, Mohair SA, Grain SA, SASA). |
| Zambia | reviewed | ZDA/WITS, Zambia Sugar, Cotton Board, FAO Zambia and FAO's NWFP review cover all six. |
| Zimbabwe | reviewed (this pass) | Tobacco verified against World Bank WITS 2023; tea and macadamia against Tanganda's own estate description; crafts, leather and horticulture against live ZimTrade sector pages. |

## Corrections made in this pass

- Zimbabwe — introduction: macadamia is one of the six themes but was missing from the
  introduction, which named tea, horticulture, leather and stone sculpture. Macadamia was added.
- No Zimbabwe association text required factual correction: the WITS ranking, Tanganda's five
  Chipinge estates and Mutare blending plant, and ZimTrade's sector statements all matched the
  written claims.

## Source-quality caveats

1. Zimbabwe tobacco rests on WITS 2023 trade values (US$1.17 billion, second behind
   semi-manufactured gold at US$1.81 billion). The national regulator `timb.co.zw` failed TLS
   certificate verification during research; add it if it becomes reachable.
2. Zimbabwe tea and macadamia both cite Tanganda, a listed company describing its own estates.
   The claims are company statements, not independent production statistics.
3. Zimbabwe crafts, leather and horticulture are ZimTrade sector statements. They establish the
   sectors and the product range, not volumes or export values.
4. WITS country summaries list only the top five HS6 exports. Values are as reported.
5. Angola cassava and maize figures come from the 2004 FAO/WFP assessment and carry the 2003/04
   season in the text. They are historical, not current output.
6. Namibia Swakara — Agra's account is a company statement, and its pelt marketing role ended
   31 March 2022; the text keeps that date.
7. FAO's non-wood forest products review is an older regional survey. Only the figures and
   practices it states are used, with no claim that they are current.
8. Montigny ("largest privately owned integrated timber company") and Zambia Sugar ("largest
   single-mill cane sugar producer in Africa") are company self-descriptions; both are attributed.
9. Lesotho LNDC claims — "among the top four producers of textiles and garments in Africa" and a
   "growing position in automotive components" — are promotional and not independently verified.
   The World Bank does support textiles as the largest private employer.

## URLs checked in this pass (Zimbabwe)

- https://wits.worldbank.org/CountryProfile/en/Country/ZWE/Year/LTST/Summary
- https://tangandatea.com
- https://tradezimbabwe.com

## Access caveats retained from earlier passes (observed, not predicted)

Blocked, expired-certificate or unreachable during the earlier southern research pass:

- `intracen.org` (ITC) and `afdb.org` are behind access controls from this host; `ifad.org`
  returned 403. No ITC, AfDB or IFAD page is cited.
- `timb.co.zw` (Zimbabwe tobacco regulator) failed certificate verification; `cottco.co.zw`
  returned 403.
- `incaju.gov.mz` failed certificate validation; `mozal.com` certificate had expired;
  `mimaip.gov.mz` timed out; `ine.gov.mz` failed certificate validation; `mozagri.gov.mz`
  did not resolve.
- `botash.bw` / `botash.co.bw` did not resolve; `botswanacraft.bw` returns "Account Suspended".
- `www.mitc.mw` presented a certificate for other hostnames; `https://mitc.mw` works and is cited.
- `www.sawis.co.za` failed certificate verification.
- Angolan ministry domains tested (`minagrip.gov.ao`, `mintur.gov.ao`, `gov.ao`) failed DNS,
  returned 401, or presented a self-signed certificate. ANGOP reset the connection.
- `www.teasso.mw` did not resolve; `tccmw.com` refused the connection.
- FAO PDFs are not retrievable through WebFetch (unsupported content type), so no PDF is cited
  in this file. `openknowledge.fao.org` HTML records were usable.
- FAO fishery country profiles (`/fishery/facp/<iso>/en`) render a navigation shell with no
  country data, so no FAO fisheries profile is cited.

## Gaps still open for other countries

| Country | Theme | Missing evidence |
|---|---|---|
| Mozambique | Prawns and fisheries | No fetchable fisheries authority. A live MIMAIP or IIP page, or an FAO/World Bank fisheries report in HTML. Left out; sesame and aluminium hold the six slots. |
| Mozambique | Coconut, sugar, capulana textiles | No accessible sector source. An IAM/IAOM-adjacent or sugar-association page. |
| Angola | Fisheries | MINPESMAR and related domains unreachable. A live ministry page or FAO fisheries text page. |
| Angola | Handicrafts | `mincult.gov.ao` is live but does not discuss crafts. The ANICC agency or a provincial culture page would be needed. |
| Botswana | Sorghum and traditional grains | No accessible Department of Crop Production page; Botswanacraft is suspended. |
| Eswatini | Pineapple, citrus, beef | EIPA's domain did not resolve; FAO and the World Bank do not name these products. An EIPA or processor page would allow them. |
| Zimbabwe | Cotton | `cottco.co.zw` returned 403. Cottco or an ICAC country brief would close it. |
| South Africa | Wine volumes | SAWIS failed TLS; WOSA and Vinpro support institutional facts only, not hectares or litres. |
| Zambia | Emeralds | ZDA states 20% of world emeralds, but the six slots favour food and craft themes. Swap in if a mineral theme is preferred. |

## Localized names

Each country carries `en` plus one widely used official or local language where the written form
is standard: Portuguese for Angola and Mozambique, Setswana, siSwati, Sesotho, Chichewa and
Afrikaans. Zambia and Zimbabwe list English only because the common endonyms match the English
form. No sourced claim depends on these names.

## Verification performed

- `python` JSON parse succeeds for the file.
- Programmatic checks: 10 countries, 6 themes each, unique keys per country, every theme has a
  non-empty source with `accessedAt: "2026-11-14"`, and all 54 countries across the five regional
  files carry exactly six sourced themes.
