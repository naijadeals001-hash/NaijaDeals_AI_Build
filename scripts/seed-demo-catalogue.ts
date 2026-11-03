import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const manifest: Array<{ slug: string; name: string; category: string; price: bigint; image: string; description: string }> = [
  { slug: "demo-smartphone-66", name: "6.6-inch Android Smartphone", category: "phones-tablets", price: 14500000n, image: "/products/catalog/phones-better.jpg", description: "Dual-SIM Android smartphone with a 6.6-inch display and 128GB storage." },
  { slug: "demo-smartphone-dual", name: "Dual-SIM Smartphone 128GB", category: "phones-tablets", price: 9600000n, image: "/products/catalog/phones-2.jpg", description: "Everyday dual-SIM smartphone with 128GB storage and a 5,000mAh battery." },
  { slug: "demo-laptop-14", name: "14-inch Business Laptop", category: "computers", price: 28000000n, image: "/products/catalog/computers-1.jpg", description: "Lightweight 14-inch laptop for documents, browsing and calls." },
  { slug: "demo-laptop-15", name: "15.6-inch Laptop", category: "computers", price: 36000000n, image: "/products/catalog/computers-2.jpg", description: "15.6-inch laptop with a full-size keyboard and 512GB storage." },
  { slug: "demo-monitor-24", name: "24-inch IPS Monitor", category: "computers", price: 14200000n, image: "/products/demo/monitor.jpg", description: "24-inch IPS monitor with HDMI input for home and office desks." },
  { slug: "demo-blender", name: "Countertop Blender 1.5L", category: "home-kitchen", price: 1800000n, image: "/products/catalog/home-better.jpg", description: "1.5-litre countertop blender with a glass jar and two speeds." },
  { slug: "demo-cookware", name: "Copper Cookware Set", category: "home-kitchen", price: 2400000n, image: "/products/demo/cookware.jpg", description: "Copper cookware set for everyday stovetop cooking." },
  { slug: "demo-trainers", name: "Running Trainers", category: "fashion", price: 1800000n, image: "/products/demo/running-shoes.jpg", description: "Cushioned running trainers with a breathable upper." },
  { slug: "demo-handbag", name: "Leather Handbag", category: "fashion", price: 2600000n, image: "/products/demo/handbag.jpg", description: "Structured leather handbag with a shoulder strap." },
  { slug: "demo-clogs", name: "Clog Sandals", category: "fashion", price: 1500000n, image: "/products/catalog/fashion.jpg", description: "Lightweight clog sandals for everyday wear." },
  { slug: "demo-face-cream", name: "Moisturising Face Cream 100ml", category: "beauty", price: 850000n, image: "/products/catalog/beauty-better.jpg", description: "Daily moisturising face cream in a 100ml jar." },
  { slug: "demo-rice", name: "Long-grain Rice 5kg", category: "groceries", price: 4500000n, image: "/products/demo/rice.jpg", description: "5kg bag of long-grain rice." },
  { slug: "demo-pepper", name: "Ground Pepper Spice 250g", category: "groceries", price: 450000n, image: "/products/catalog/groceries.jpg", description: "Ground pepper spice packed in a 250g pouch." },
  { slug: "demo-solar-panel", name: "Solar Panel Array", category: "power-solar", price: 9500000n, image: "/products/catalog/solar.jpg", description: "Roof-mounted solar panel array for home power." },
  { slug: "demo-powerbank", name: "20,000mAh Power Bank", category: "power-solar", price: 3850000n, image: "/products/demo/powerbank.jpg", description: "20,000mAh power bank with USB-C output." },
  { slug: "demo-controller", name: "Wireless Game Controller", category: "gaming", price: 4500000n, image: "/products/catalog/gaming.jpg", description: "Wireless game controller with dual analogue sticks." },
  { slug: "demo-headset", name: "Gaming Headset", category: "gaming", price: 3200000n, image: "/products/demo/headset.jpg", description: "Over-ear gaming headset with a boom microphone." }
];

(async () => {
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const owner = await prisma.user.findFirstOrThrow({ where: { email: "seller2@naijadeals.local" } });
  const vendor = await prisma.vendor.upsert({
    where: { slug: "demo-inventory" },
    update: { name: "Demo Inventory (preview only)", status: "VERIFIED" },
    create: {
      ownerId: owner.id,
      name: "Demo Inventory (preview only)",
      slug: "demo-inventory",
      market: "Lagos, Nigeria",
      countryCode: "NG",
      pickupAddress: "Preview catalogue, not a real seller",
      pickupPhone: "08000000000",
      status: "VERIFIED",
      trustScore: 0
    }
  });

  // Hide every older sample listing from the showcase without deleting records.
  await prisma.product.updateMany({ where: { isSample: true }, data: { status: "DRAFT" } });

  let created = 0;
  for (const item of manifest) {
    const category = bySlug.get(item.category);
    if (!category) { console.log("missing category", item.category); continue; }
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, status: "ACTIVE", priceKobo: item.price, description: item.description, categoryId: category.id },
      create: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        brand: "Demo inventory",
        priceKobo: item.price,
        weightGrams: 500,
        status: "ACTIVE",
        isSample: true,
        stock: { create: { quantity: 8, lowStockLevel: 3 } }
      }
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: item.image, alt: item.name, sortOrder: 0 } });
    created += 1;
  }
  console.log(JSON.stringify({ created }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await prisma.$disconnect(); process.exit(1); });
