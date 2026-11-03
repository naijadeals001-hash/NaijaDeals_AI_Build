import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const plan: Array<[string, string, string]> = [
    ["demo2-phone-5g", "5G Android Smartphone", "/products/demo2/phone-a.jpg"],
    ["demo2-phone-blue", "Dual-SIM Smartphone", "/products/demo2/phone-b.jpg"],
    ["demo2-phone-white", "Android Smartphone 128GB", "/products/demo2/phone-c.jpg"],
    ["demo2-sunglasses", "Polarised Sunglasses", "/products/demo2/sunglasses-a.jpg"]
  ];
  for (const [slug, name, url] of plan) {
    const p = await prisma.product.update({ where: { slug }, data: { name } , include: { images: true } });
    if (p.images[0]) await prisma.productImage.update({ where: { id: p.images[0].id }, data: { url, alt: name } });
    else await prisma.productImage.create({ data: { productId: p.id, url, alt: name, sortOrder: 0 } });
  }
  console.log("ok");
  await prisma.$disconnect();
})();
