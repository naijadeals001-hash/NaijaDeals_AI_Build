import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const items = [{"slug":"demo4-phone-desk","name":"Smartphone on Desk","cat":"phones-tablets","image":"/products/demo4/phone-a1.jpg"},{"slug":"demo4-phone-hand","name":"Android Smartphone","cat":"phones-tablets","image":"/products/demo4/phone-a3.jpg"},{"slug":"demo4-blender","name":"Retro Kitchen Blender","cat":"home-kitchen","image":"/products/demo4/home-blender2.jpg"},{"slug":"demo4-handbags","name":"Assorted Leather Handbags","cat":"fashion","image":"/products/demo4/fashion-handbag2.jpg"},{"slug":"demo4-onions","name":"Diced Onions 500g","cat":"groceries","image":"/products/demo4/grocery-onions.jpg"},{"slug":"demo4-inverter","name":"Solar Power Inverter","cat":"power-solar","image":"/products/demo4/power-inverter.jpg"},{"slug":"demo4-battery-station","name":"Solar Battery Charging Station","cat":"power-solar","image":"/products/demo4/power-battery.jpg"},{"slug":"demo4-keyboard","name":"Mechanical Gaming Keyboard","cat":"gaming","image":"/products/demo4/gaming-keyboard2.jpg"}];
(async () => {
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  for (const item of items) {
    const category = bySlug.get(item.cat);
    if (!category) { console.log("missing", item.cat); continue; }
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, status: "ACTIVE", categoryId: category.id },
      create: {
        vendorId: vendor.id, categoryId: category.id, name: item.name, slug: item.slug,
        description: item.name + " — demo inventory for visual testing; price and stock are illustrative.",
        brand: "Demo inventory", priceKobo: 1500000n, weightGrams: 500, status: "ACTIVE", isSample: true,
        stock: { create: { quantity: 8, lowStockLevel: 3 } }
      }
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: item.image, alt: item.name, sortOrder: 0 } });
  }
  console.log(JSON.stringify({ created: items.length }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await prisma.$disconnect(); process.exit(1); });
