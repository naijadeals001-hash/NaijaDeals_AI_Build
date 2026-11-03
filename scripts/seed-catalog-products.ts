import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const catalog: Record<string, Array<{ name: string; price: bigint; image: string }>> = {
  "phones-tablets": [
    { name: "Sample Smartphone 128GB", price: 9500000n, image: "/products/catalog/phones-1.jpg" },
    { name: "Sample Smartphone Pro 256GB", price: 15500000n, image: "/products/catalog/phones-2.jpg" }
  ],
  computers: [
    { name: "Sample 14-inch Laptop", price: 28000000n, image: "/products/catalog/computers-1.jpg" },
    { name: "Sample Ultrabook 512GB", price: 36000000n, image: "/products/catalog/computers-2.jpg" }
  ],
  "home-kitchen": [
    { name: "Sample 1.5L Blender", price: 1800000n, image: "/products/catalog/home.jpg" },
    { name: "Sample Non-stick Cookware Set", price: 2400000n, image: "/products/catalog/home.jpg" }
  ],
  fashion: [
    { name: "Sample Canvas Sneakers", price: 1800000n, image: "/products/catalog/fashion.jpg" },
    { name: "Sample Leather Sneakers", price: 2600000n, image: "/products/catalog/fashion.jpg" },
    { name: "Sample Everyday Trainers", price: 2100000n, image: "/products/catalog/fashion.jpg" }
  ],
  beauty: [
    { name: "Sample Face Cream 100ml", price: 850000n, image: "/products/catalog/beauty-1.jpg" },
    { name: "Sample Body Lotion 400ml", price: 1200000n, image: "/products/catalog/beauty-1.jpg" },
    { name: "Sample Cleansing Gel 150ml", price: 950000n, image: "/products/catalog/beauty-1.jpg" }
  ],
  groceries: [
    { name: "Sample Pepper Spice 250g", price: 450000n, image: "/products/catalog/groceries.jpg" },
    { name: "Sample Spice Mix 500g", price: 700000n, image: "/products/catalog/groceries.jpg" },
    { name: "Sample Ground Spice 100g", price: 300000n, image: "/products/catalog/groceries.jpg" }
  ],
  "power-solar": [
    { name: "Sample Solar Panel 200W", price: 9500000n, image: "/products/catalog/solar.jpg" },
    { name: "Sample Solar Inverter 1kVA", price: 22000000n, image: "/products/catalog/solar.jpg" }
  ],
  gaming: [
    { name: "Sample Wireless Controller", price: 4500000n, image: "/products/catalog/gaming.jpg" },
    { name: "Sample Gaming Headset", price: 3200000n, image: "/products/catalog/gaming.jpg" },
    { name: "Sample Console Charging Dock", price: 1800000n, image: "/products/catalog/gaming.jpg" }
  ]
};

(async () => {
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  let created = 0;
  for (const [slug, entries] of Object.entries(catalog)) {
    const category = bySlug.get(slug);
    if (!category) { console.log("missing category", slug); continue; }
    const existing = await prisma.product.findMany({ where: { categoryId: category.id, isSample: true }, orderBy: { createdAt: "asc" } });
    if (existing.length === 0) { console.log("no vendor fixture for", slug); continue; }
    const vendorId = existing[0].vendorId;
    for (const [index, entry] of entries.entries()) {
      const productSlug = `sample-${slug}-${index + 2}`;
      const exists = await prisma.product.findUnique({ where: { slug: productSlug } });
      if (exists) continue;
      await prisma.product.create({
        data: {
          vendorId,
          categoryId: category.id,
          name: entry.name,
          slug: productSlug,
          description: "Sample catalogue listing used to preview the NaijaShop storefront. Not a live seller offer.",
          brand: "NaijaDeals Sample",
          priceKobo: entry.price,
          compareAtKobo: entry.price + entry.price / 10n,
          weightGrams: 500,
          status: "ACTIVE",
          isSample: true,
          images: { create: [{ url: entry.image, alt: entry.name, sortOrder: 0 }] },
          stock: { create: { quantity: 8, lowStockLevel: 3 } }
        }
      });
      created += 1;
    }
  }
  console.log(JSON.stringify({ created }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await prisma.$disconnect(); process.exit(1); });
