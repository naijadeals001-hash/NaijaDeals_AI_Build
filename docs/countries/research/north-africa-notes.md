# North Africa country research — notes

Date of access: 2026-11-14 (local host time, EST).
Scope: Algeria (DZ), Egypt (EG), Libya (LY), Morocco (MA), Sudan (SD), Tunisia (TN).
Excluded: Western Sahara (EH), per coordinator instruction (disputed territory handled separately).

## Result — final editorial pass, 2026-11-14

- 6 countries present.
- 6 themes per country (36 total); no duplicate theme keys within a country.
- 36 of 36 themes have at least one live, fetched source.
- `editorialStatus`: `reviewed` for all six.
- This pass reviewed the two countries still marked `needs-review`: Libya and Morocco.
  Both now pass, so the result for the two reviewed this pass is **2/2**.
- Theme replacements: 0. Both countries' six theme slots are supported; none needed swapping.
- `accessedAt`: 2026-11-14 on every source.

## Editorial status

| Country | Status | Reason |
|---|---|---|
| Algeria | reviewed | All six themes supported by FAO, an official Algerian consulate page, or the Algerian Ministry of Tourism and Handicrafts (see retained caveats). |
| Egypt | reviewed | All six themes supported by FAO, the Egyptian Cotton Association, or Egyptian export councils. |
| Libya | reviewed (this pass) | All six themes verified live: FAO AGRIS (Al Jufrah dates), a peer-reviewed 2026 olive-oil study, FAO's marine-sector profile, FAO GIEWS, a USAID-funded beekeeping programme page and a craft-documentation entry. |
| Morocco | reviewed (this pass) | Carob and olive oil from FAO; argan and oasis dates from ANDZOA; leather and textiles from the Maison de l'Artisan category listing. |
| Sudan | reviewed | All six themes supported by FAO OCOP, FAO legacy reports and FAO AGRIS. |
| Tunisia | reviewed | All six themes supported by FAO, World Bank, UNESCO (verified via archive) and ONAT. |

## Corrections made in this pass

- Libya — olive oil: the top-level source publisher was wrong ("Chartered Journal of Sciences and
  Humanities"); the article is in *Comprehensive Journal of Science* (University of Tripoli),
  Vol. 10 No. 39, 2026.
- Libya — Gharyan pottery: the claim that vessels are decorated "with geometric and floral motifs"
  was not confirmed on the cited page and was removed. The verified claims are the Gharyan and
  Bughilan workshops, the Nafusa Mountains, hand-building/wheel-throwing, and the water-jar,
  amphora and tableware forms.
- Morocco — introduction: pottery was named but is not one of the six themes, while olive oil was
  a theme but not in the introduction. The introduction now previews carob, argan, oasis dates,
  olive groves, leatherwork and woven textiles.
- Morocco — leatherwork and woven textiles: the claim that MDA is "a public establishment for
  handicraft" was not verifiable from the fetched page; the text now cites the category names the
  site actually publishes ("Leather arts", "Textile arts").

## Source-quality caveats

1. Libya — no Libyan ministry or statistical-agency page was reachable or cited. The themes rest
   on FAO, FAO AGRIS, a peer-reviewed journal, an NGO programme page and a specialist craft site.
2. Libya — honey: Moomken is a Libyan NGO implementing a USAID-funded programme. The page supports
   the programme's existence and scope, not national production statistics.
3. Libya — Gharyan pottery: World Craft Depository is a specialist documentation project, not a
   state authority. UNESCO's World Heritage Centre returned HTTP 403 from this host and is not cited.
4. Libya — olive oil: figures are from a single 2026 journal article covering 1980–2024; they are
   research estimates, not a live market series.
5. Morocco — leather and textiles are category-level claims only. `mda.gov.ma/en/` renders and
   lists the categories, but the "Leather arts" subpage is a navigation shell with no body text.
   Do not add city attributions (Fez, Safi, Beni Ourain) without a new source.
6. Morocco — ANDZOA is an official agency site and supports the argan and date-palm programmes,
   but it is a programme portal, not an output dataset.
7. Retained from earlier passes and still relevant to DZ/EG/SD/TN: `mta.gov.dz` timed out during
   research and Algerian craft content was verified through a Wayback capture; `ich.unesco.org`
   and `unesco.org` returned anti-bot challenges, so harissa and couscous were verified through
   archives and an official consulate page; ONAT pages are category-level only; the Tunisia
   olive-oil figures come from the World Bank `.txt` full report because the Documents page is a
   loading shell.

## URLs checked in this pass

Libya:

- https://agris.fao.org/search/en/providers/122436/records/67597e05c7a957febdf8e778
- https://cjos.histr.edu.ly/index.php/journal/en/article/view/1466
- https://www.fao.org/4/ag421e/AG421E03.htm
- https://www.fao.org/giews/countrybrief/country.jsp?code=LBY
- https://moomken.org/en/programs/beekeeping
- https://www.craftheritage.world/technique/gharyan-red-clay-pottery-libya

Morocco:

- https://www.fao.org/one-country-one-priority-product/near-east-and-north-africa/morocco/en
- https://andzoa.ma/
- https://www.fao.org/investment-centre/latest/news/detail/more-per-drop--building-resilience-and-adding-value-in-morocco-s-olive-oil-sector/en
- https://mda.gov.ma/en/
- https://mda.gov.ma/en/leather-arts/ (shell; no body text)

Attempted and unavailable:

- https://whc.unesco.org/en/list/170/ — HTTP 403 from this host.

## Localized names

Arabic and French names are the standard ISO/common forms for each country. Morocco carries
`ar` and `fr`; Libya carries `ar` and `fr`. No sourced claim depends on them.
