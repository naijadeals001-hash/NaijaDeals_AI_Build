import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const manifest: Array<{ slug: string; name: string; category: string; price: bigint; image: string }> = [
  { slug: "demo2-phone-5g", name: "5G Android Smartphone", category: "phones-tablets", price: 18900000n, image: "/products/demo2/phone-5g.jpg" },
  { slug: "demo2-phone-blue", name: "Dual-SIM Smartphone (Blue)", category: "phones-tablets", price: 11200000n, image: "/products/demo2/phone-blue.jpg" },
  { slug: "demo2-phone-white", name: "Android Smartphone (White)", category: "phones-tablets", price: 8800000n, image: "/products/demo2/phone-white.jpg" },
  { slug: "demo2-monitor", name: "27-inch LED Monitor", category: "computers", price: 16800000n, image: "/products/demo2/monitor-led.jpg" },
  { slug: "demo2-kettle", name: "Electric Kettle 1.7L", category: "home-kitchen", price: 950000n, image: "/products/demo2/kettle.jpg" },
  { slug: "demo2-toaster", name: "2-Slice Toaster", category: "home-kitchen", price: 1200000n, image: "/products/demo2/toaster.jpg" },
  { slug: "demo2-sunglasses", name: "Polarised Sunglasses", category: "fashion", price: 750000n, image: "/products/demo2/sunglasses.jpg" },
  { slug: "demo2-perfume", name: "Eau de Parfum 50ml", category: "beauty", price: 2200000n, image: "/products/demo2/perfume.jpg" },
  { slug: "demo2-perfume-set", name: "Perfume Gift Set", category: "beauty", price: 3500000n, image: "/products/demo2/perfume-set.jpg" },
  { slug: "demo2-shampoo", name: "Shampoo 400ml", category: "beauty", price: 650000n, image: "/products/demo2/shampoo.jpg" },
  { slug: "demo2-tomatoes", name: "Fresh Tomatoes 1kg", category: "groceries", price: 350000n, image: "/products/demo2/tomatoes.jpg" },
  { slug: "demo2-beans", name: "Green Beans 500g", category: "groceries", price: 420000n, image: "/products/demo2/beans.jpg" },
  { slug: "demo2-charger", name: "Universal Battery Charger", category: "power-solar", price: 850000n, image: "/products/demo2/charger.jpg" },
  { slug: "demo2-solar-lamp", name: "Solar Lamp", category: "power-solar", price: 1200000n, image: "/products/demo2/solar-lamp.jpg" },
  { slug: "demo2-keyboard", name: "Mechanical Keyboard", category: "gaming", price: 2800000n, image: "/products/demo2/keyboard.jpg" },
  { slug: "demo2-mouse", name: "Gaming Mouse", category: "gaming", price: 1500000n, image: "/products/demo2/mouse.jpg" }
];

(async () => {
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  let created = 0;
  for (const item of manifest) {
    const category = bySlug.get(item.category);
    if (!category) { console.log("missing category", item.category); continue; }
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, status: "ACTIVE", priceKobo: item.price, description: `${item.name} — demo inventory for visual testing; price and stock are illustrative.`, categoryId: category.id },
      create: {
        vendorId: vendor.id, categoryId: category.id, name: item.name, slug: item.slug,
        description: `${item.name} — demo inventory for visual testing; price and stock are illustrative.`,
        brand: "Demo inventory", priceKobo: item.price, weightGrams: 500, status: "ACTIVE", isSample: true,
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
