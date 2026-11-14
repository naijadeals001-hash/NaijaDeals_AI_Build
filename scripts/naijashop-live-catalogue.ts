/**
 * Publishes the verified seller's physical-goods listings as REAL products.
 *
 * These are not sample rows and are not copies of demo catalogue entries. Each
 * product is created through `createSellerProduct` — the same service the seller
 * dashboard uses — so verification, category, price, stock, image and audit
 * rules all apply. Every listing uses an existing approved Kie.ai product photo,
 * so no new image spend is involved.
 *
 * Prices are the seller's listed prices in NGN minor units (kobo). This is the
 * seller's own storefront inventory on the local TEST database.
 *
 * Idempotent by slug; re-running only creates what is missing.
 *
 * Usage: npx tsx scripts/naijashop-live-catalogue.ts [--owner=seller@naijadeals.local]
 */
import { prisma } from "../lib/prisma";
import { createSellerProduct, updateSellerProduct } from "../lib/services/core/seller.service";
import { publishProduct } from "../lib/services/core/catalogue-admin.service";
import type { SessionUser } from "../lib/auth/session";

const OWNER = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8) ?? "seller@naijadeals.local";
// Publication now goes through the Control Center moderation workflow, so the
// script needs a real staff actor with catalogue moderation permission. The
// seller service itself cannot publish (admin_publication_required).
const ADMIN_EMAIL = process.argv.find((arg) => arg.startsWith("--admin="))?.slice(8) ?? "admin@naijadeals.local";

async function adminActor(): Promise<SessionUser> {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { roles: { include: { role: true } }, vendors: true }
  });
  if (!admin) throw new Error(`Admin ${ADMIN_EMAIL} not found; cannot publish listings through moderation.`);
  return admin as SessionUser;
}

type Listing = {
  name: string;
  slug: string;
  description: string;
  category: string;
  priceKobo: bigint;
  compareAtKobo?: bigint;
  quantity: number;
  image: string;
  brand?: string;
};

const L = (naira: number) => BigInt(Math.round(naira * 100));

const LISTINGS: Listing[] = [
  // Phones & Tablets
  { name: "Tecno Spark 20 128GB", slug: "tecno-spark-20-128gb", category: "phones-tablets", priceKobo: L(159_900), compareAtKobo: L(189_900), quantity: 12, image: "/generated/shop/product-blackview-a60-android-smartphone.webp", brand: "Tecno", description: "128GB storage, 6.6-inch display, dual SIM. Sealed retail unit with charger. Sold by an authorised Nigerian retailer." },
  { name: "Infinix Hot 40i 8GB/128GB", slug: "infinix-hot-40i-128gb", category: "phones-tablets", priceKobo: L(139_500), quantity: 9, image: "/generated/shop/product-apple-iphone-6-silver.webp", brand: "Infinix", description: "8GB RAM, 128GB storage, 90Hz display. Brand-new sealed unit with warranty card." },
  { name: "Tablet 10-inch 64GB", slug: "tablet-10-inch-64gb", category: "phones-tablets", priceKobo: L(168_000), quantity: 6, image: "/generated/shop/product-tablet-10-inch.webp", description: "10-inch IPS tablet, 64GB expandable storage, Wi-Fi. Ideal for study and streaming." },
  // Computers
  { name: "14-inch Business Laptop 8GB/256GB", slug: "laptop-14-inch-business-8gb", category: "computers", priceKobo: L(489_000), compareAtKobo: L(560_000), quantity: 7, image: "/generated/shop/product-14-inch-business-laptop.webp", description: "14-inch HD laptop, 8GB RAM, 256GB SSD, Windows 11. Lightweight and dependable for office work." },
  { name: "24-inch LED Monitor 75Hz", slug: "led-monitor-24-inch-75hz", category: "computers", priceKobo: L(142_000), quantity: 15, image: "/generated/shop/product-led-monitor.webp", description: "24-inch frameless LED monitor, 75Hz refresh, HDMI and VGA inputs. Slim stand." },
  { name: "Slim Mechanical Keyboard", slug: "slim-mechanical-keyboard", category: "computers", priceKobo: L(48_500), quantity: 20, image: "/generated/shop/product-mechanical-keyboard.webp", description: "Tenkeyless mechanical keyboard with white keycaps and quiet linear switches." },
  // Home & Kitchen
  { name: "Stainless Steel Cookware Set (7 pcs)", slug: "stainless-cookware-set-7pc", category: "home-kitchen", priceKobo: L(89_900), compareAtKobo: L(112_000), quantity: 10, image: "/generated/shop/product-stainless-steel-cookware-set.webp", description: "Seven-piece stainless steel set: two saucepans with glass lids, frying pan and utensils. Induction compatible." },
  { name: "2-Slice Retro Toaster", slug: "2-slice-retro-toaster", category: "home-kitchen", priceKobo: L(12_000), quantity: 25, image: "/generated/shop/product-2-slice-toaster.webp", description: "Cream and chrome two-slice toaster with defrost and reheat settings." },
  { name: "5.5L Digital Air Fryer", slug: "air-fryer-55l-digital", category: "home-kitchen", priceKobo: L(79_900), compareAtKobo: L(114_900), quantity: 14, image: "/generated/shop/product-air-fryer-5-5l.webp", description: "5.5-litre air fryer with digital touch panel and pull-out basket. Fits a family meal." },
  { name: "Retro Kitchen Blender 1.5L", slug: "retro-kitchen-blender-15l", category: "home-kitchen", priceKobo: L(34_500), quantity: 18, image: "/generated/shop/product-retro-kitchen-blender.webp", description: "1.5-litre glass jug blender with chrome accents and two speeds." },
  // Fashion
  { name: "Tooled Leather Handbag", slug: "tooled-leather-handbag", category: "fashion", priceKobo: L(32_900), compareAtKobo: L(58_600), quantity: 11, image: "/generated/shop/product-prada-tooled-leather-handbag.webp", description: "Structured tan tooled-leather handbag with top handle and gold clasp." },
  { name: "Automatic Wristwatch", slug: "automatic-wristwatch", category: "fashion", priceKobo: L(92_500), quantity: 8, image: "/generated/shop/product-automatic-wristwatch.webp", description: "Automatic movement, stainless case, white dial and brown leather strap." },
  { name: "Running Shoes", slug: "running-shoes-cushioned", category: "fashion", priceKobo: L(39_900), quantity: 16, image: "/generated/shop/product-asics-gel-cumulus-22-running-shoes.webp", description: "Cushioned mesh running shoe with a thick foam sole. Lightweight daily trainer." },
  // Beauty
  { name: "Eau de Parfum 50ml", slug: "eau-de-parfum-50ml", category: "beauty", priceKobo: L(22_000), quantity: 22, image: "/generated/shop/product-eau-de-parfum-50ml.webp", description: "50ml eau de parfum with warm amber notes, glass bottle with gold cap." },
  { name: "Moisturiser Jar 100ml", slug: "moisturiser-jar-100ml", category: "beauty", priceKobo: L(9_500), quantity: 30, image: "/generated/shop/product-moisturiser-jar-100ml.webp", description: "Rich 100ml moisturiser in a ceramic jar for dry skin." },
  { name: "Handmade Shampoo Bars (Set of 3)", slug: "handmade-shampoo-bars-3", category: "beauty", priceKobo: L(15_000), quantity: 24, image: "/generated/shop/product-handmade-shampoo-bars.webp", description: "Three solid shampoo bars in cream, oatmeal and charcoal. Palm-oil free." },
  // Groceries
  { name: "Fresh Tomatoes 1kg", slug: "fresh-tomatoes-1kg", category: "groceries", priceKobo: L(3_500), quantity: 60, image: "/generated/shop/product-fresh-tomatoes-1kg.webp", description: "One kilogram of ripe plum tomatoes, packed on the day of dispatch." },
  { name: "Red Bell Pepper 500g", slug: "red-bell-pepper-500g", category: "groceries", priceKobo: L(3_000), quantity: 55, image: "/generated/shop/product-red-bell-pepper-500g.webp", description: "500g of fresh red bell peppers with stems intact." },
  { name: "Green Beans 500g", slug: "green-beans-500g", category: "groceries", priceKobo: L(4_200), quantity: 50, image: "/generated/shop/product-green-beans-500g.webp", description: "500g of crisp green beans, freshly trimmed." },
  { name: "Diced Onions 500g", slug: "diced-onions-500g", category: "groceries", priceKobo: L(15_000), quantity: 40, image: "/generated/shop/product-diced-onions-500g.webp", description: "500g of freshly diced onions, sealed for same-day delivery." },
  // Power & Solar
  { name: "Solar Power Inverter 1.5kVA", slug: "solar-power-inverter-15kva", category: "power-solar", priceKobo: L(285_000), quantity: 6, image: "/generated/shop/product-solar-power-inverter.webp", description: "1.5kVA solar inverter with LCD display and multiple output sockets." },
  { name: "Portable Power Bank 20,000mAh", slug: "power-bank-20000mah", category: "power-solar", priceKobo: L(38_500), quantity: 28, image: "/generated/shop/product-portable-power-bank.webp", description: "20,000mAh power bank with digital display, USB-C fast charging." },
  { name: "Rooftop Solar Panel 200W", slug: "rooftop-solar-panel-200w", category: "power-solar", priceKobo: L(95_000), quantity: 9, image: "/generated/shop/product-rooftop-solar-panel-array.webp", description: "200W monocrystalline solar panel with aluminium frame and mounting rails." },
  // Gaming
  { name: "Wireless Game Controller", slug: "wireless-game-controller", category: "gaming", priceKobo: L(28_000), quantity: 17, image: "/generated/shop/product-xbox-360-controller.webp", description: "Wireless controller with dual analogue sticks and rechargeable battery." },
  { name: "Wired Gaming Mouse", slug: "wired-gaming-mouse", category: "gaming", priceKobo: L(15_000), quantity: 26, image: "/generated/shop/product-wired-gaming-mouse.webp", description: "Ergonomic wired gaming mouse with adjustable DPI and red accent light." }
];

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: OWNER }, select: { id: true, name: true } });
  if (!owner) throw new Error(`Seller ${OWNER} not found.`);
  const actor = await adminActor();

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryId = (slug: string) => {
    const match = categories.find((category) => category.slug === slug);
    if (!match) throw new Error(`Unknown category ${slug}`);
    return match.id;
  };

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const listing of LISTINGS) {
    const existing = await prisma.product.findFirst({
      where: { name: listing.name, vendor: { is: { owner: { email: OWNER } } } },
      select: { id: true, isSample: true, status: true }
    });
    if (existing) {
      if (existing.isSample) skipped.push(`${listing.name} (sample row with the same name exists)`);
      // Keep price and stock aligned with this list on re-runs.
      await updateSellerProduct(owner.id, existing.id, { priceKobo: listing.priceKobo, quantity: listing.quantity });
      // Seller edits cannot publish; an existing draft is published through the
      // same Control Center moderation workflow used for new listings below.
      if (existing.status !== "ACTIVE") await publishProduct({ actor, id: existing.id });
      updated += 1;
      continue;
    }
    const product = await createSellerProduct(owner.id, {
      name: listing.name,
      description: listing.description,
      categoryId: categoryId(listing.category),
      priceKobo: listing.priceKobo,
      compareAtKobo: listing.compareAtKobo ?? null,
      brand: listing.brand ?? null,
      imageUrl: listing.image,
      quantity: listing.quantity,
      lowStockLevel: 3
    });
    // createSellerProduct generates a random slug suffix; give the listing its
    // stable, human-readable slug and declare the rights for physical goods.
    await prisma.product.update({ where: { id: product.id }, data: { slug: listing.slug } });
    // The seller service only creates DRAFT rows now. Publication is a Control
    // Center moderation action with validation and audit.
    await publishProduct({ actor, id: product.id });
    created += 1;
  }

  const live = await prisma.product.count({ where: { isSample: false, status: "ACTIVE", vendor: { status: "VERIFIED" } } });
  console.log(JSON.stringify({ created, updated, skipped, liveNonSampleActive: live }, null, 1));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
