/**
 * Development fixtures for NaijaDeals marketplace.
 *
 * These are clearly labelled local fixtures, not real customers, sales, reviews
 * or revenue. No orders, payments, reviews or tracking events are fabricated.
 * The customer wallet balance exists only to exercise the NaijaPay wallet path
 * in local tests and is reset on every seed.
 */
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const products = [
  {
    slug: "tecno-spark-20",
    name: "TECNO Spark 20 128GB",
    brand: "TECNO",
    category: "phones-tablets",
    vendor: "ikeja-mobile-hub",
    price: 14500000n,
    compareAt: 15900000n,
    description:
      "Dual-SIM Android smartphone with a 6.6-inch display, 50MP main camera and 5,000mAh battery. Sealed unit with a 12-month seller warranty.",
    image: "/products/tecno-spark-20.svg",
    stock: 14,
    variants: [
      { name: "128GB / Magic Skin Green", sku: "TECNO-SP20-128-GRN", price: 14500000n, stock: 8 },
      { name: "256GB / Cyber White", sku: "TECNO-SP20-256-WHT", price: 17200000n, stock: 6 }
    ]
  },
  {
    slug: "infinix-hot-40i",
    name: "Infinix Hot 40i 256GB",
    brand: "Infinix",
    category: "phones-tablets",
    vendor: "ikeja-mobile-hub",
    price: 16850000n,
    compareAt: null,
    description:
      "256GB storage, 8GB RAM and a 90Hz display. Includes charger and a one-year manufacturer warranty.",
    image: "/products/infinix-hot-40i.svg",
    stock: 9,
    variants: []
  },
  {
    slug: "hp-elitebook-840-g6",
    name: "HP EliteBook 840 G6 (Refurbished)",
    brand: "HP",
    category: "computers",
    vendor: "ikeja-mobile-hub",
    price: 31000000n,
    compareAt: 35500000n,
    description:
      "Grade-A refurbished business laptop. Intel Core i5, 14-inch FHD display, backlit keyboard and a 6-month seller warranty. Battery health checked before dispatch.",
    image: "/products/hp-elitebook-840-g6.svg",
    stock: 5,
    variants: [
      { name: "8GB RAM / 256GB SSD", sku: "HP840-8-256", price: 31000000n, stock: 3 },
      { name: "16GB RAM / 512GB SSD", sku: "HP840-16-512", price: 38500000n, stock: 2 }
    ]
  },
  {
    slug: "anker-power-bank-20000",
    name: "Anker PowerCore 20,000mAh",
    brand: "Anker",
    category: "power-solar",
    vendor: "ikeja-mobile-hub",
    price: 3850000n,
    compareAt: 4200000n,
    description:
      "20,000mAh power bank with 20W USB-C Power Delivery. Charges a phone up to four times. Original Anker unit with serial verification.",
    image: "/products/anker-power-bank-20000.svg",
    stock: 20,
    variants: []
  },
  {
    slug: "binatone-blender-15l",
    name: "Binatone 1.5L Blender",
    brand: "Binatone",
    category: "home-kitchen",
    vendor: "yaba-home-living",
    price: 2700000n,
    compareAt: null,
    description:
      "1.5-litre blender with a stainless-steel blade and two speed settings. Suitable for smoothies, pepper and everyday kitchen prep.",
    image: "/products/binatone-blender-15l.svg",
    stock: 11,
    variants: []
  },
  {
    slug: "nivea-radiance-face-wash",
    name: "Nivea Radiance Face Wash 150ml",
    brand: "Nivea",
    category: "beauty",
    vendor: "yaba-home-living",
    price: 850000n,
    compareAt: 1000000n,
    description:
      "Gentle daily face wash with vitamin C. Sealed 150ml tube. Check the batch code on delivery.",
    image: "/products/nivea-radiance-face-wash.svg",
    stock: 24,
    variants: []
  },
  {
    slug: "adire-throw-pillows",
    name: "Adire Cotton Throw Pillows (Set of 2)",
    brand: "Naija Loom",
    category: "home-kitchen",
    vendor: "yaba-home-living",
    price: 1800000n,
    compareAt: null,
    description:
      "Two hand-dyed adire cotton cushion covers made in Abeokuta. 45cm x 45cm, hidden zip, inserts not included.",
    image: "/products/adire-throw-pillows.svg",
    stock: 7,
    variants: []
  },
  {
    slug: "solar-king-200w-kit",
    name: "Solar King 200W Panel Kit",
    brand: "Solar King",
    category: "power-solar",
    vendor: "yaba-home-living",
    price: 18500000n,
    compareAt: 20500000n,
    description:
      "200W monocrystalline panel, 30A charge controller and mounting brackets. Installation is quoted separately after a site check.",
    image: "/products/solar-king-200w-kit.svg",
    stock: 4,
    variants: []
  },
  {
    slug: "xbox-wireless-controller",
    name: "Xbox Wireless Controller",
    brand: "Microsoft",
    category: "gaming",
    vendor: "ikeja-mobile-hub",
    price: 5200000n,
    compareAt: null,
    description:
      "Official wireless controller with Bluetooth and USB-C. Compatible with Xbox Series X|S, Xbox One and Windows PCs.",
    image: "/products/xbox-wireless-controller.svg",
    stock: 6,
    variants: []
  },
  {
    slug: "smoked-pepper-250g",
    name: "Smoked Pepper Blend 250g",
    brand: "Mama's Kitchen",
    category: "groceries",
    vendor: "yaba-home-living",
    price: 450000n,
    compareAt: null,
    description:
      "Smoked chilli and spice blend prepared in small batches. 250g resealable pouch. Contains no preservatives.",
    image: "/products/smoked-pepper-250g.svg",
    stock: 30,
    variants: []
  },
  {
    slug: "ankara-sneakers",
    name: "Unisex Ankara Print Sneakers",
    brand: "Naija Loom",
    category: "fashion",
    vendor: "yaba-home-living",
    price: 3200000n,
    compareAt: 3800000n,
    description:
      "Lightweight sneakers finished with an Ankara print panel. Choose your size at checkout. Made to order in Lagos.",
    image: "/products/ankara-sneakers.svg",
    stock: 12,
    variants: [
      { name: "Size 40", sku: "ANK-SNK-40", price: 3200000n, stock: 2 },
      { name: "Size 41", sku: "ANK-SNK-41", price: 3200000n, stock: 2 },
      { name: "Size 42", sku: "ANK-SNK-42", price: 3200000n, stock: 3 },
      { name: "Size 43", sku: "ANK-SNK-43", price: 3200000n, stock: 2 },
      { name: "Size 44", sku: "ANK-SNK-44", price: 3200000n, stock: 2 },
      { name: "Size 45", sku: "ANK-SNK-45", price: 3200000n, stock: 1 }
    ]
  },
  {
    slug: "dell-24-monitor",
    name: 'Dell 24" IPS Monitor',
    brand: "Dell",
    category: "computers",
    vendor: "ikeja-mobile-hub",
    price: 14200000n,
    compareAt: null,
    description:
      "24-inch Full HD IPS monitor with HDMI and DisplayPort. Single unit available from the seller's current stock.",
    image: "/products/dell-24-monitor.svg",
    stock: 1,
    variants: []
  }
];

async function main() {
  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany(),
    prisma.walletTransaction.deleteMany(),
    prisma.trackingEvent.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.escrowEvent.deleteMany(),
    prisma.dispute.deleteMany(),
    prisma.escrowHold.deleteMany(),
    prisma.orderStatusEvent.deleteMany(),
    prisma.returnRequest.deleteMany(),
    prisma.review.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.savedItem.deleteMany(),
    prisma.address.deleteMany(),
    prisma.session.deleteMany(),
    prisma.sellerApplication.deleteMany(),
    prisma.inventoryStock.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.adminAction.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.systemEvent.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.rideEvent.deleteMany(),
    prisma.ride.deleteMany(),
    prisma.driverProfile.deleteMany(),
    prisma.courier.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.role.deleteMany(),
    prisma.user.deleteMany()
  ]);

  const roleData = [
    { name: "admin", description: "Control Center administrator" },
    { name: "customer", description: "Buyer account" },
    { name: "vendor", description: "Seller operator" },
    { name: "courier", description: "Courier operator" },
    { name: "driver", description: "NaijaDrive driver" }
  ];
  const roles = {};
  for (const role of roleData) {
    roles[role.name] = await prisma.role.create({ data: role });
  }

  const passwordHashes = {
    admin: hashPassword("AdminPass123!"),
    seller: hashPassword("SellerPass123!"),
    courier: hashPassword("CourierPass123!"),
    customer: hashPassword("CustomerPass123!"),
    driver: hashPassword("DriverPass123!")
  };

  const admin = await prisma.user.create({
    data: {
      email: "admin@naijadeals.local",
      name: "Control Center Admin",
      phone: "08000000001",
      actorType: "ADMIN",
      passwordHash: passwordHashes.admin,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.admin.id } }
    }
  });

  const customer = await prisma.user.create({
    data: {
      email: "customer@naijadeals.local",
      name: "Test Customer",
      phone: "08035551234",
      actorType: "CUSTOMER",
      passwordHash: passwordHashes.customer,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.customer.id } }
    }
  });

  const sellerOwner = await prisma.user.create({
    data: {
      email: "seller@naijadeals.local",
      name: "Ikeja Mobile Hub Owner",
      phone: "08020000002",
      actorType: "VENDOR",
      passwordHash: passwordHashes.seller,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.vendor.id } }
    }
  });

  const sellerOwner2 = await prisma.user.create({
    data: {
      email: "seller2@naijadeals.local",
      name: "Yaba Home & Living Owner",
      phone: "08020000004",
      actorType: "VENDOR",
      passwordHash: passwordHashes.seller,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.vendor.id } }
    }
  });

  const courierUser = await prisma.user.create({
    data: {
      email: "courier@naijadeals.local",
      name: "Test Courier",
      phone: "08020000003",
      actorType: "COURIER",
      passwordHash: passwordHashes.courier,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.courier.id } }
    }
  });

  const driverUser = await prisma.user.create({
    data: {
      email: "driver@naijadeals.local",
      name: "Test Driver",
      phone: "08020000005",
      actorType: "DRIVER",
      passwordHash: passwordHashes.driver,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.driver.id } }
    }
  });

  const driverUser2 = await prisma.user.create({
    data: {
      email: "driver2@naijadeals.local",
      name: "Second Test Driver",
      phone: "08020000006",
      actorType: "DRIVER",
      passwordHash: passwordHashes.driver,
      verifiedAt: new Date(),
      roles: { create: { roleId: roles.driver.id } }
    }
  });

  const vendor1 = await prisma.vendor.create({
    data: {
      ownerId: sellerOwner.id,
      name: "Ikeja Mobile Hub",
      slug: "ikeja-mobile-hub",
      market: "Computer Village, Ikeja",
      description: "Phones, laptops and accessories. Physical shop in Computer Village.",
      pickupAddress: "Shop 24, Adeniyi Jones Road, Computer Village, Ikeja, Lagos",
      pickupPhone: "08020000002",
      countryCode: "NG",
      status: "VERIFIED",
      trustScore: 82,
      commissionBps: 800
    }
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      ownerId: sellerOwner2.id,
      name: "Yaba Home & Living",
      slug: "yaba-home-living",
      market: "Yaba, Lagos",
      description: "Home, kitchen, beauty and made-in-Nigeria lifestyle goods.",
      pickupAddress: "12 Herbert Macaulay Way, Yaba, Lagos",
      pickupPhone: "08020000004",
      countryCode: "NG",
      status: "VERIFIED",
      trustScore: 76,
      commissionBps: 1000
    }
  });

  const categoryData = [
    { name: "Phones & Tablets", slug: "phones-tablets", sortOrder: 1 },
    { name: "Computers", slug: "computers", sortOrder: 2 },
    { name: "Home & Kitchen", slug: "home-kitchen", sortOrder: 3 },
    { name: "Fashion", slug: "fashion", sortOrder: 4 },
    { name: "Beauty", slug: "beauty", sortOrder: 5 },
    { name: "Groceries", slug: "groceries", sortOrder: 6 },
    { name: "Power & Solar", slug: "power-solar", sortOrder: 7 },
    { name: "Gaming", slug: "gaming", sortOrder: 8 }
  ];
  const categories = {};
  for (const category of categoryData) {
    categories[category.slug] = await prisma.category.create({ data: category });
  }

  const vendors = { "ikeja-mobile-hub": vendor1, "yaba-home-living": vendor2 };

  for (const product of products) {
    await prisma.product.create({
      data: {
        vendorId: vendors[product.vendor].id,
        categoryId: categories[product.category].id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        priceKobo: product.price,
        compareAtKobo: product.compareAt,
        weightGrams: 500,
        status: "ACTIVE",
        images: { create: [{ url: product.image, alt: product.name, sortOrder: 0 }] },
        stock: { create: { quantity: product.stock, lowStockLevel: 3 } },
        variants: product.variants.length
          ? {
              create: product.variants.map((variant) => ({
                name: variant.name,
                sku: variant.sku,
                priceKobo: variant.price,
                stock: variant.stock
              }))
            }
          : undefined
      }
    });
  }

  // The customer fixture balance is posted as a balanced ledger transaction so the
  // wallet screen never shows funds that have no ledger backing.
  const walletFixtureKobo = 2500000n;
  const customerWallet = await prisma.wallet.create({
    data: { ownerType: "CUSTOMER", userId: customer.id, availableKobo: walletFixtureKobo, heldKobo: 0n }
  });
  const systemWallet = await prisma.wallet.create({ data: { ownerType: "SYSTEM", availableKobo: 0n, heldKobo: 0n } });
  await prisma.walletTransaction.create({
    data: {
      walletId: customerWallet.id,
      type: "credit",
      amountKobo: walletFixtureKobo,
      reference: "SEED-WALLET-FIXTURE",
      description: "Local test fixture funding (not a real payment)",
      ledger: {
        create: [
          {
            walletId: systemWallet.id,
            direction: "DEBIT",
            amountKobo: walletFixtureKobo,
            memo: "Fixture funding source"
          },
          {
            walletId: customerWallet.id,
            direction: "CREDIT",
            amountKobo: walletFixtureKobo,
            memo: "Fixture balance credited to test customer"
          }
        ]
      }
    }
  });
  await prisma.wallet.create({ data: { ownerType: "VENDOR", vendorId: vendor1.id, availableKobo: 0n, heldKobo: 0n } });
  await prisma.wallet.create({ data: { ownerType: "VENDOR", vendorId: vendor2.id, availableKobo: 0n, heldKobo: 0n } });
  await prisma.wallet.create({ data: { ownerType: "COURIER", userId: courierUser.id, availableKobo: 0n, heldKobo: 0n } });
  await prisma.wallet.create({ data: { ownerType: "DRIVER", userId: driverUser.id, availableKobo: 0n, heldKobo: 0n } });
  await prisma.wallet.create({ data: { ownerType: "DRIVER", userId: driverUser2.id, availableKobo: 0n, heldKobo: 0n } });

  const courier = await prisma.courier.create({
    data: {
      userId: courierUser.id,
      name: "Test Courier",
      phone: "08020000003",
      active: true
    }
  });

  const driver = await prisma.driverProfile.create({
    data: {
      userId: driverUser.id,
      licenseNumber: "LAG-DRV-0001",
      status: "approved",
      vehicleClass: "comfort",
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      vehiclePlate: "LSD-482-XA",
      active: true
    }
  });

  const driver2 = await prisma.driverProfile.create({
    data: {
      userId: driverUser2.id,
      licenseNumber: "LAG-DRV-0002",
      status: "approved",
      vehicleClass: "economy",
      vehicleMake: "Honda",
      vehicleModel: "Accord",
      vehiclePlate: "KJA-771-YB",
      active: true
    }
  });

  await prisma.systemEvent.create({
    data: {
      type: "seed.completed",
      actorId: admin.id,
      entity: "Seed",
      payload: {
        note: "Development fixtures. No orders, payments, reviews or revenue were created.",
        products: products.length,
        vendors: 2,
        courier: courier.id,
        drivers: [driver.id, driver2.id],
        walletFixtureKobo: "2500000"
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        note: "Development fixtures only. No orders, payments, reviews or revenue were created.",
        accounts: {
          admin: "admin@naijadeals.local / AdminPass123!",
          seller: "seller@naijadeals.local / SellerPass123!",
          seller2: "seller2@naijadeals.local / SellerPass123!",
          courier: "courier@naijadeals.local / CourierPass123!",
          customer: "customer@naijadeals.local / CustomerPass123!",
          driver: "driver@naijadeals.local / DriverPass123!",
          driver2: "driver2@naijadeals.local / DriverPass123!"
        },
        products: products.length,
        vendors: [vendor1.slug, vendor2.slug],
        walletFixture: "₦25,000 local test balance for the customer account"
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
