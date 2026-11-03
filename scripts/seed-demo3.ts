import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const items = [{"slug":"demo3-running-sneakers","name":"Blue Running Sneakers","image":"/products/demo3/fashion-1.jpg"},{"slug":"demo3-watch","name":"Automatic Wristwatch","image":"/products/demo3/fashion-4.jpg"},{"slug":"demo3-tomatoes","name":"Fresh Tomatoes 1kg","image":"/products/demo3/grocery-1.jpg"},{"slug":"demo3-green-beans","name":"Green Beans 500g","image":"/products/demo3/grocery-3.jpg"},{"slug":"demo3-red-pepper","name":"Red Bell Pepper 500g","image":"/products/demo3/grocery-4.jpg"},{"slug":"demo3-solar-array","name":"Rooftop Solar Panel Array","image":"/products/demo3/power-1.jpg"},{"slug":"demo3-power-bank","name":"Portable Power Bank","image":"/products/demo3/power-3.jpg"},{"slug":"demo3-gaming-mouse","name":"Wired Gaming Mouse","image":"/products/demo3/gaming-4.jpg"},{"slug":"demo3-monitor-setup","name":"Desktop Monitor Setup","image":"/products/demo3/computer-monitor.jpg"},{"slug":"demo3-cookware","name":"Stainless Steel Cookware Set","image":"/products/demo3/home-cookware.jpg"}];
const prices: Record<string, bigint> = {
  "demo3-running-sneakers": 1800000n, "demo3-watch": 3500000n, "demo3-tomatoes": 350000n,
  "demo3-green-beans": 420000n, "demo3-red-pepper": 300000n, "demo3-solar-array": 9500000n,
  "demo3-power-bank": 3850000n, "demo3-gaming-mouse": 1500000n, "demo3-monitor-setup": 14200000n,
  "demo3-cookware": 2400000n
};
const cats: Record<string,string> = {
  "demo3-running-sneakers":"fashion", "demo3-watch":"fashion", "demo3-tomatoes":"groceries",
  "demo3-green-beans":"groceries", "demo3-red-pepper":"groceries", "demo3-solar-array":"power-solar",
  "demo3-power-bank":"power-solar", "demo3-gaming-mouse":"gaming", "demo3-monitor-setup":"computers",
  "demo3-cookware":"home-kitchen"
};
(async () => {
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  for (const item of items) {
    const category = bySlug.get(cats[item.slug]);
    if (!category) { console.log("missing category", cats[item.slug]); continue; }
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, status: "ACTIVE", priceKobo: prices[item.slug], categoryId: category.id },
      create: {
        vendorId: vendor.id, categoryId: category.id, name: item.name, slug: item.slug,
        description: `${item.name} — demo inventory for visual testing; price and stock are illustrative.`,
        brand: "Demo inventory", priceKobo: prices[item.slug], weightGrams: 500, status: "ACTIVE", isSample: true,
        stock: { create: { quantity: 8, lowStockLevel: 3 } }
      }
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: item.image, alt: item.name, sortOrder: 0 } });
  }
  console.log(JSON.stringify({ created: items.length }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await prisma.$disconnect(); process.exit(1); });
