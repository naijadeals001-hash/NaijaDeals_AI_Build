import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "beauty" } });
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  const product = await prisma.product.upsert({
    where: { slug: "demo5-moisturizer" },
    update: { name: "Moisturiser Jar 100ml", status: "ACTIVE", categoryId: category.id },
    create: {
      vendorId: vendor.id, categoryId: category.id, name: "Moisturiser Jar 100ml", slug: "demo5-moisturizer",
      description: "Moisturiser Jar 100ml — demo inventory for visual testing; price and stock are illustrative.",
      brand: "Demo inventory", priceKobo: 950000n, weightGrams: 300, status: "ACTIVE", isSample: true,
      stock: { create: { quantity: 8, lowStockLevel: 3 } }
    }
  });
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productImage.create({ data: { productId: product.id, url: "/products/demo5/beauty-moisturizer.jpg", alt: "Moisturiser Jar 100ml", sortOrder: 0 } });
  console.log("ok");
  await prisma.$disconnect();
})();
