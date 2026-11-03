import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const p = await prisma.product.findFirstOrThrow({ where: { slug: "demo5-smartphone" } });
  await prisma.product.update({ where: { id: p.id }, data: { name: "Apple iPhone 6 (Silver) 16GB", description: "Apple iPhone 6 in silver, 16GB — demo inventory for visual testing; price and stock are illustrative." } });
  await prisma.productImage.deleteMany({ where: { productId: p.id } });
  await prisma.productImage.create({ data: { productId: p.id, url: "/products/demo5/iphone6-silver.jpg", alt: "Apple iPhone 6 (Silver) 16GB", sortOrder: 0 } });
  console.log("ok");
  await prisma.$disconnect();
})();
