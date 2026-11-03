import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const mapping = [{"slug":"demo3-running-sneakers","name":"Asics Gel-Cumulus 22 Running Shoes","image":"/products/replacements/replace-sneakers.jpg"},{"slug":"demo4-handbags","name":"Vintage Prada Leather Handbag","image":"/products/replacements/replace-handbag.jpg"},{"slug":"demo4-phone-hand","name":"Blackview A60 Android Smartphone","image":"/products/replacements/replace-phone.jpg"},{"slug":"demo3-monitor-setup","name":"EIZO Foris FG2421 Monitor","image":"/products/replacements/replace-monitor.jpg"},{"slug":"demo4-keyboard","name":"Mechanical Keyboard","image":"/products/replacements/replace-keyboard.jpg"},{"slug":"demo5-controller-case","name":"PS4 and Xbox One Controllers","image":"/products/replacements/replace-controller.jpg"}];
(async () => {
  for (const item of mapping) {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: item.slug } });
    await prisma.product.update({ where: { id: product.id }, data: { name: item.name, description: item.name + " — demo inventory for visual testing; price and stock are illustrative." } });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: item.image, alt: item.name, sortOrder: 0 } });
  }
  await prisma.product.updateMany({ where: { slug: { in: ["demo5-iphone", "demo5-smartphone"] } }, data: { name: "Apple iPhone 6 (Silver)" } });
  await prisma.product.updateMany({ where: { slug: "demo5-iphone" }, data: { name: "Apple iPhone 5s" } });
  console.log("replacements applied");
  await prisma.$disconnect();
})();
