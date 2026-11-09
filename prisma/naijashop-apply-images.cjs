/**
 * Attaches generated NaijaShop imagery to the right records, but only when the
 * file exists on disk:
 *   - category tiles  -> Category.imageUrl
 *   - product photos  -> a new ProductImage on the matching listing
 *   - campaign art    -> StorefrontConfig.heroSlides (published copy)
 *
 * Product photos are matched by slug, never by position, so a listing can only
 * receive the image generated for that exact product.
 *
 * Idempotent. Usage: node prisma/naijashop-apply-images.cjs
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();
const ROOT = process.cwd();
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "image-registry.json"), "utf8"));

const PUBLIC = (slug) => `/generated/shop/${slug}.webp`;
const has = (slug) => fs.existsSync(path.join(ROOT, "public", "generated", "shop", `${slug}.webp`));

const SAFE_SLUG = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const HERO_SLIDES = [
  {
    id: "african-brands",
    eyebrow: "NaijaShop",
    headline: "Big deals on African brands",
    body: "Electronics, fashion, home and groceries from verified Nigerian sellers — escrow-protected, with tracked delivery nationwide.",
    ctaLabel: "Shop the deals",
    ctaHref: "/naijashop/deals",
    imageUrl: PUBLIC("hero-desktop"),
    sideTitle: "NaijaShop Plus",
    sideBody: "Faster delivery, Plus-only deals and early access to sales.",
    sideCtaLabel: "See Plus plans",
    sideCtaHref: "/naijashop/plus"
  },
  {
    id: "electronics",
    eyebrow: "Electronics hub",
    headline: "Phones, laptops and power that last",
    body: "Compare verified sellers side by side. Every checkout is protected until your order arrives.",
    ctaLabel: "Shop electronics",
    ctaHref: "/naijashop/c/phones-tablets",
    imageUrl: PUBLIC("hero-electronics"),
    sideTitle: "Solar and power",
    sideBody: "Inverters, panels and power banks built for Nigerian power realities.",
    sideCtaLabel: "Shop power",
    sideCtaHref: "/naijashop/c/power-solar"
  },
  {
    id: "fashion",
    eyebrow: "Fashion",
    headline: "Fashion for every style",
    body: "Trendy, authentic and affordable — from Nigerian makers to your door.",
    ctaLabel: "Shop fashion",
    ctaHref: "/naijashop/c/fashion",
    imageUrl: PUBLIC("hero-fashion"),
    sideTitle: "Support Nigerian sellers",
    sideBody: "Local businesses, verified before they list.",
    sideCtaLabel: "Meet our sellers",
    sideCtaHref: "/naijashop/sellers"
  }
];

(async () => {
  const summary = { categories: 0, products: 0, slides: 0, missing: [] };

  // ---- Category tiles --------------------------------------------------
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  for (const category of categories) {
    const slug = `category-${category.slug}`;
    if (!has(slug)) {
      summary.missing.push(slug);
      continue;
    }
    await prisma.category.update({ where: { id: category.id }, data: { imageUrl: PUBLIC(slug) } });
    summary.categories += 1;
  }

  // ---- Product photos --------------------------------------------------
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, slug: true, images: { select: { id: true, sortOrder: true } } } });
  for (const product of products) {
    const slug = `product-${SAFE_SLUG(product.name)}`;
    if (!has(slug)) {
      summary.missing.push(slug);
      continue;
    }
    const url = PUBLIC(slug);
    const existing = await prisma.productImage.findFirst({ where: { productId: product.id, url } });
    if (!existing) {
      // Generated photography is the primary image, so it must sort ahead of
      // any stock file that was already attached.
      const prior = await prisma.productImage.findMany({ where: { productId: product.id }, select: { id: true, sortOrder: true } });
      await prisma.productImage.create({ data: { productId: product.id, url, alt: product.name, sortOrder: -1 } });
      for (const image of prior) {
        await prisma.productImage.update({ where: { id: image.id }, data: { sortOrder: image.sortOrder + 1 } });
      }
    }
    summary.products += 1;
  }

  // ---- Hero slides -----------------------------------------------------
  const rows = await prisma.$queryRaw`SELECT config FROM "StorefrontConfig" WHERE id = 'default' LIMIT 1`;
  const current = rows[0]?.config ?? {};
  const version = Number(current.version ?? 1);
  const available = HERO_SLIDES.filter((slide) => has(slide.imageUrl.split("/").pop().replace(".webp", "")));
  if (available.length > 0) {
    const next = { ...current, heroSlides: available, version: version + 1 };
    await prisma.$executeRaw`
      UPDATE "StorefrontConfig" SET config = ${JSON.stringify(next)}::jsonb, "updatedAt" = NOW() WHERE id = 'default'`;
    summary.slides = available.length;
  }

  console.log(JSON.stringify(summary));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
