import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const items = [{"slug":"demo5-iphone","name":"Apple iPhone 5s (Refurbished)","cat":"phones-tablets","image":"/products/demo5/phone-b1.jpg"},{"slug":"demo5-smartphone","name":"Smartphone (White)","cat":"phones-tablets","image":"/products/demo5/phone-b2.jpg"},{"slug":"demo5-coffee-maker","name":"Filter Coffee Maker","cat":"home-kitchen","image":"/products/demo5/home-coffee.jpg"},{"slug":"demo5-baby-shoes","name":"Red Patent Leather Baby Shoes","cat":"fashion","image":"/products/demo5/fashion-shoes.jpg"},{"slug":"demo5-shampoo-bars","name":"Handmade Shampoo Bars","cat":"beauty","image":"/products/demo5/beauty-shampoo3.jpg"},{"slug":"demo5-controller-case","name":"Xbox Controller Case","cat":"gaming","image":"/products/demo5/gaming-controller3.jpg"}];
(async () => {
  const cats = await prisma.category.findMany();
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  for (const item of items) {
    const category = bySlug.get(item.cat);
    if (!category) continue;
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
})();
