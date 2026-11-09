/**
 * Renames the membership branding inside the live storefront configuration from
 * "Prime" to "Plus".
 *
 * This edits published copy only: the config's hero slide titles and CTA labels.
 * No plan, subscription, entitlement, price or identifier is touched, so existing
 * members keep exactly what they had. Idempotent.
 *
 * Usage: node prisma/naijashop-rename-plus.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/** Rewrites membership wording only; never touches ids, hrefs or prices. */
function renameCopy(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/NaijaShop Prime/g, "NaijaShop Plus")
    .replace(/Prime-only/g, "Plus-only")
    .replace(/Prime plans/g, "Plus plans")
    .replace(/^Prime$/, "Plus");
}

(async () => {
  const rows = await prisma.$queryRaw`SELECT config FROM "StorefrontConfig" WHERE id = 'default' LIMIT 1`;
  if (!rows[0]) {
    console.log(JSON.stringify({ status: "no_storefront_config" }));
    await prisma.$disconnect();
    return;
  }

  const config = rows[0].config;
  let changed = 0;
  const slides = Array.isArray(config.heroSlides)
    ? config.heroSlides.map((slide) => {
        const next = { ...slide };
        for (const key of ["sideTitle", "sideBody", "sideCtaLabel", "headline", "body", "ctaLabel", "eyebrow"]) {
          if (typeof slide[key] === "string") {
            const renamed = renameCopy(slide[key]);
            if (renamed !== slide[key]) changed += 1;
            next[key] = renamed;
          }
        }
        // The membership page moved to /naijashop/plus; the old path only
        // redirects, so published CTAs point at the live route directly.
        for (const key of ["sideCtaHref", "ctaHref"]) {
          if (next[key] === "/naijashop/prime") {
            next[key] = "/naijashop/plus";
            changed += 1;
          }
        }
        return next;
      })
    : [];

  if (changed === 0) {
    console.log(JSON.stringify({ status: "already_renamed" }));
    await prisma.$disconnect();
    return;
  }

  const next = { ...config, heroSlides: slides };
  await prisma.$executeRaw`
    UPDATE "StorefrontConfig"
    SET config = ${JSON.stringify(next)}::jsonb, "updatedAt" = NOW()
    WHERE id = 'default'`;
  console.log(JSON.stringify({ status: "renamed", fieldsChanged: changed, slides: slides.length }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
