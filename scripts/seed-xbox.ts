import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "gaming" } });
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: "demo-inventory" } });
  const product = await prisma.product.upsert({
    where: { slug: "demo5-xbox-controller" },
    update: { name: "Xbox 360 Controller", status: "ACTIVE", categoryId: category.id },
    create: {
      vendorId: vendor.id, categoryId: category.id, name: "Xbox 360 Controller", slug: "demo5-xbox-controller",
      description: "Xbox 360 Controller — demo inventory for visual testing; price and stock are illustrative.",
      brand: "Demo inventory", priceKobo: 2800000n, weightGrams: 400, status: "ACTIVE", isSample: true,
      stock: { create: { quantity: 8, lowStockLevel: 3 } }
    }
  });
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productImage.create({ data: { productId: product.id, url: "/products/demo5/gaming-xbox.jpg", alt: "Xbox 360 Controller", sortOrder: 0 } });
  console.log("ok");
  await prisma.$disconnect();
})();
