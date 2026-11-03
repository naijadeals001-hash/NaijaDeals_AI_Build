import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = [
  { slug:"mama-cass-kitchen", name:"Mama Cass Kitchen", cuisine:"Nigerian home cooking", market:"Surulere, Lagos", address:"12 Bode Thomas Road, Surulere, Lagos", phone:"08022220001", items:[["Jollof rice with grilled chicken","Smoky jollof, grilled chicken, fried plantain",450000n],["Egusi soup with pounded yam","Melon-seed soup, assorted meat, pounded yam",520000n],["Peppered goat meat","Slow-braised goat in pepper sauce",380000n]] },
  { slug:"yaba-grill-house", name:"Yaba Grill House", cuisine:"Grills and suya", market:"Yaba, Lagos", address:"8 Herbert Macaulay Way, Yaba, Lagos", phone:"08022220002", items:[["Beef suya wrap","Spiced beef, onions, tomato and yaji",260000n],["Grilled tilapia with plantain","Whole tilapia, fried plantain, pepper dip",610000n],["Asun rice bowl","Peppered goat, jollof rice, coleslaw",430000n]] }
];
(async () => {
  const owner = await prisma.user.findFirstOrThrow({ where: { email: "seller2@naijadeals.local" } });
  for (const row of rows) {
    const existing = await prisma.restaurant.findUnique({ where: { slug: row.slug }, include: { menuItems: true } });
    const created = existing ?? await prisma.restaurant.create({ data: { ownerId: owner.id, slug: row.slug, name: row.name, cuisine: row.cuisine, market: row.market, address: row.address, phone: row.phone, status: "VERIFIED", isSample: true }, include: { menuItems: true } });
    if (created.menuItems.length === 0) {
      for (const [name, description, price] of row.items) {
        await prisma.menuItem.create({ data: { restaurantId: created.id, name: String(name), description: String(description), priceKobo: price as bigint, isSample: true } });
      }
    }
  }
  console.log(JSON.stringify({ restaurants: await prisma.restaurant.count() }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await prisma.$disconnect(); process.exit(1); });
