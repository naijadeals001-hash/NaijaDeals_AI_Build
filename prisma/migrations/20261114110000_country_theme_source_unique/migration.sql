-- A theme's source URL is unique within that theme. A concurrent replace then
-- conflicts instead of silently duplicating a public citation.
CREATE UNIQUE INDEX "CountryThemeSource_themeId_url_key" ON "CountryThemeSource"("themeId", "url");
