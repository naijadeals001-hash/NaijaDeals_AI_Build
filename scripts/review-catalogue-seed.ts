/**
 * Idempotent REVIEW-only demonstration catalogue for the owner-review storefront.
 * Refuses every database not explicitly classified REVIEW. Creates no customer
 * identities, orders, wallets or financial history. Every record is labelled DEMO.
 */
import { prisma } from "../lib/prisma";

const OWNER_EMAIL = "demo-catalogue@review.invalid";

const DEPARTMENTS = [
  {
    name: "Phones & Tablets",
    slug: "phones-tablets",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-phones-tablets.webp",
    products: [
      {
        name: "DEMO — 10-inch Android tablet",
        slug: "demo-10-inch-android-tablet",
        description: "Demonstration listing. 10-inch tablet representative image; specifications and availability are illustrative only.",
        priceKobo: 18500000n,
        image: "/generated/shop/product-tablet-10-inch.webp",
        alt: "Demonstration product image of a 10-inch Android tablet"
      },
      {
        name: "DEMO — Android smartphone, 6-inch display",
        slug: "demo-android-smartphone-6-inch",
        description: "Demonstration listing. Representative smartphone image; no real seller, stock or warranty is implied.",
        priceKobo: 9400000n,
        image: "/generated/shop/product-blackview-a60-android-smartphone.webp",
        alt: "Demonstration product image of a black Android smartphone"
      }
    ]
  },
  {
    name: "Computers",
    slug: "computers",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-computers.webp",
    products: [
      {
        name: "DEMO — 14-inch business laptop",
        slug: "demo-14-inch-business-laptop",
        description: "Demonstration listing. Representative laptop image; specifications are illustrative and not a seller offer.",
        priceKobo: 48000000n,
        image: "/generated/shop/product-14-inch-business-laptop.webp",
        alt: "Demonstration product image of a 14-inch business laptop"
      },
      {
        name: "DEMO — Mechanical keyboard",
        slug: "demo-mechanical-keyboard",
        description: "Demonstration listing. Representative keyboard image; layout and switches are illustrative only.",
        priceKobo: 4500000n,
        image: "/generated/shop/product-mechanical-keyboard.webp",
        alt: "Demonstration product image of a mechanical keyboard"
      }
    ]
  },
  {
    name: "Home & Kitchen",
    slug: "home-kitchen",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-home-kitchen.webp",
    products: [
      {
        name: "DEMO — 5.5L air fryer",
        slug: "demo-5-5l-air-fryer",
        description: "Demonstration listing. Representative air-fryer image; capacity and features are illustrative only.",
        priceKobo: 7800000n,
        image: "/generated/shop/product-air-fryer-5-5l.webp",
        alt: "Demonstration product image of a 5.5 litre air fryer"
      },
      {
        name: "DEMO — Stainless steel cookware set",
        slug: "demo-stainless-steel-cookware-set",
        description: "Demonstration listing. Representative cookware image; contents and materials are illustrative only.",
        priceKobo: 12500000n,
        image: "/generated/shop/product-stainless-steel-cookware-set.webp",
        alt: "Demonstration product image of a stainless steel cookware set"
      }
    ]
  }
] as const;

const EXTRA_DEPARTMENTS = [
  {
    name: "Electronics & Appliances", slug: "electronics-appliances",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/banner-electronics.webp",
    products: [
      { name: "DEMO — Over-ear headphones", slug: "demo-over-ear-headphones", description: "Demonstration listing. Representative headphones; sound and accessories are illustrative.", priceKobo: 3200000n, image: "/generated/shop/product-over-ear-headphones.webp", alt: "Demonstration product image of over-ear headphones" },
      { name: "DEMO — 2-slice toaster", slug: "demo-2-slice-toaster", description: "Demonstration listing. Representative toaster; finish and settings are illustrative.", priceKobo: 2800000n, image: "/generated/shop/product-2-slice-toaster.webp", alt: "Demonstration product image of a two-slice toaster" },
      { name: "DEMO — Retro kitchen blender", slug: "demo-retro-kitchen-blender", description: "Demonstration listing. Representative blender; capacity is illustrative.", priceKobo: 4100000n, image: "/generated/shop/product-retro-kitchen-blender.webp", alt: "Demonstration product image of a retro kitchen blender" },
      { name: "DEMO — LED monitor", slug: "demo-led-monitor", description: "Demonstration listing. Representative monitor; size and panel specifications are illustrative.", priceKobo: 16500000n, image: "/generated/shop/product-led-monitor.webp", alt: "Demonstration product image of an LED monitor" }
    ]
  },
  {
    name: "Fashion & Accessories", slug: "fashion-accessories",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-fashion.webp",
    products: [
      { name: "DEMO — Running shoes", slug: "demo-running-shoes", description: "Demonstration listing. Representative running shoes; sizing and materials are illustrative.", priceKobo: 5600000n, image: "/generated/shop/product-asics-gel-cumulus-22-running-shoes.webp", alt: "Demonstration product image of running shoes" },
      { name: "DEMO — Leather handbag", slug: "demo-leather-handbag", description: "Demonstration listing. Representative handbag; leather and hardware details are illustrative.", priceKobo: 8900000n, image: "/generated/shop/product-prada-tooled-leather-handbag.webp", alt: "Demonstration product image of a leather handbag" },
      { name: "DEMO — Automatic wristwatch", slug: "demo-automatic-wristwatch", description: "Demonstration listing. Representative watch; movement and case details are illustrative.", priceKobo: 11200000n, image: "/generated/shop/product-automatic-wristwatch.webp", alt: "Demonstration product image of an automatic wristwatch" },
      { name: "DEMO — Eau de parfum, 50ml", slug: "demo-eau-de-parfum-50ml", description: "Demonstration listing. Representative fragrance; notes and longevity are illustrative.", priceKobo: 6500000n, image: "/generated/shop/product-eau-de-parfum-50ml.webp", alt: "Demonstration product image of a perfume bottle" }
    ]
  },
  {
    name: "Beauty & Personal Care", slug: "beauty-personal-care",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-beauty.webp",
    products: [
      { name: "DEMO — Shampoo bars", slug: "demo-shampoo-bars", description: "Demonstration listing. Representative shampoo bars; ingredients are illustrative.", priceKobo: 1800000n, image: "/generated/shop/product-handmade-shampoo-bars.webp", alt: "Demonstration product image of shampoo bars" },
      { name: "DEMO — Moisturiser, 100ml", slug: "demo-moisturiser-100ml", description: "Demonstration listing. Representative moisturiser; formulation is illustrative.", priceKobo: 2400000n, image: "/generated/shop/product-moisturiser-jar-100ml.webp", alt: "Demonstration product image of a moisturiser jar" },
      { name: "DEMO — Perfume gift set", slug: "demo-perfume-gift-set", description: "Demonstration listing. Representative gift set; contents are illustrative.", priceKobo: 7200000n, image: "/generated/shop/product-perfume-gift-set.webp", alt: "Demonstration product image of a perfume gift set" },
      { name: "DEMO — Daily sunscreen", slug: "demo-daily-sunscreen", description: "Demonstration listing. Representative skincare product; SPF and ingredients are illustrative.", priceKobo: 2100000n, image: "/generated/shop/product-eau-de-parfum-50ml.webp", alt: "Demonstration product image representing a skincare bottle" }
    ]
  }
] as const;

const EXTRA_PRODUCTS = [
  { categorySlug: "phones-tablets", products: [
    { name: "DEMO — Portable power bank", slug: "demo-portable-power-bank", description: "Demonstration listing. Representative power bank; capacity is illustrative.", priceKobo: 1900000n, image: "/generated/shop/product-portable-power-bank.webp", alt: "Demonstration product image of a portable power bank" },
    { name: "DEMO — Smartphone on desk", slug: "demo-smartphone-on-desk", description: "Demonstration listing. Representative smartphone; model and specifications are illustrative.", priceKobo: 7100000n, image: "/generated/shop/product-smartphone-on-desk.webp", alt: "Demonstration product image of a smartphone" }
  ] },
  { categorySlug: "computers", products: [
    { name: "DEMO — Wired gaming mouse", slug: "demo-wired-gaming-mouse", description: "Demonstration listing. Representative mouse; sensor and buttons are illustrative.", priceKobo: 1500000n, image: "/generated/shop/product-wired-gaming-mouse.webp", alt: "Demonstration product image of a wired gaming mouse" },
    { name: "DEMO — 15.6-inch laptop", slug: "demo-15-6-inch-laptop", description: "Demonstration listing. Representative laptop; specifications are illustrative.", priceKobo: 52000000n, image: "/generated/shop/product-15-6-inch-laptop.webp", alt: "Demonstration product image of a 15.6-inch laptop" }
  ] },
  { categorySlug: "home-kitchen", products: [
    { name: "DEMO — Coffee maker", slug: "demo-coffee-maker", description: "Demonstration listing. Representative coffee maker; capacity is illustrative.", priceKobo: 5900000n, image: "/generated/shop/product-coffee-maker.webp", alt: "Demonstration product image of a coffee maker" },
    { name: "DEMO — Fresh tomatoes, 1kg", slug: "demo-fresh-tomatoes", description: "Demonstration listing. Representative produce; grade and pack are illustrative.", priceKobo: 120000n, image: "/generated/shop/product-fresh-tomatoes-1kg.webp", alt: "Demonstration product image of fresh tomatoes" }
  ] }
] as const;

async function main() {
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  const name = db[0]?.current_database ?? "";
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) {
    throw new Error(`refusing: ${name} is not classified REVIEW`);
  }

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { name: "Demo Catalogue (review only)" },
    create: {
      email: OWNER_EMAIL,
      name: "Demo Catalogue (review only)",
      actorType: "VENDOR",
      countryCode: "NG"
    }
  });

  const vendor = await prisma.vendor.upsert({
    where: { slug: "demo-catalogue-review" },
    update: { name: "DEMO — Review Catalogue Seller", status: "VERIFIED" },
    create: {
      ownerId: owner.id,
      name: "DEMO — Review Catalogue Seller",
      slug: "demo-catalogue-review",
      market: "Abuja",
      description: "Demonstration seller for owner review. Not a verified real seller and not live supply.",
      pickupAddress: "Demonstration only — no physical pickup",
      pickupPhone: "+2340000000000",
      countryCode: "NG",
      status: "VERIFIED"
    }
  });

  let created = 0;
  for (const [departmentIndex, department] of DEPARTMENTS.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: department.slug },
      update: { name: department.name, description: department.description, imageUrl: department.imageUrl, isActive: true, sortOrder: departmentIndex },
      create: {
        name: department.name,
        slug: department.slug,
        description: department.description,
        imageUrl: department.imageUrl,
        isActive: true,
        sortOrder: departmentIndex
      }
    });

    for (const [productIndex, product] of department.products.entries()) {
      const saved = await prisma.product.upsert({
        where: { slug: product.slug },
        update: {
          name: product.name,
          description: product.description,
          priceKobo: product.priceKobo,
          status: "ACTIVE",
          categoryId: category.id,
          moderationNote: "DEMO — demonstration inventory, not live supply"
        },
        create: {
          vendorId: vendor.id,
          categoryId: category.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          priceKobo: product.priceKobo,
          countryCode: "NG",
          saleMode: "escrow",
          status: "ACTIVE",
          moderationNote: "DEMO — demonstration inventory, not live supply"
        }
      });
      created += 1;
      await prisma.productImage.deleteMany({ where: { productId: saved.id } });
      await prisma.productImage.create({ data: { productId: saved.id, url: product.image, alt: product.alt, sortOrder: 0 } });
      await prisma.inventoryStock.upsert({
        where: { productId: saved.id },
        update: { quantity: 25 },
        create: { productId: saved.id, quantity: 25 }
      });
    }
  }

  for (const [departmentIndex, department] of EXTRA_DEPARTMENTS.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: department.slug },
      update: { name: department.name, description: department.description, imageUrl: department.imageUrl, isActive: true, sortOrder: 10 + departmentIndex },
      create: { name: department.name, slug: department.slug, description: department.description, imageUrl: department.imageUrl, isActive: true, sortOrder: 10 + departmentIndex }
    });
    for (const product of department.products) {
      const saved = await prisma.product.upsert({
        where: { slug: product.slug },
        update: { name: product.name, description: product.description, priceKobo: product.priceKobo, status: "ACTIVE", categoryId: category.id, moderationNote: "DEMO — demonstration inventory, not live supply" },
        create: { vendorId: vendor.id, categoryId: category.id, name: product.name, slug: product.slug, description: product.description, priceKobo: product.priceKobo, countryCode: "NG", saleMode: "escrow", status: "ACTIVE", moderationNote: "DEMO — demonstration inventory, not live supply" }
      });
      created += 1;
      await prisma.productImage.deleteMany({ where: { productId: saved.id } });
      await prisma.productImage.create({ data: { productId: saved.id, url: product.image, alt: product.alt, sortOrder: 0 } });
      await prisma.inventoryStock.upsert({ where: { productId: saved.id }, update: { quantity: 25 }, create: { productId: saved.id, quantity: 25 } });
    }
  }

  for (const group of EXTRA_PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: group.categorySlug } });
    if (!category) throw new Error(`missing category during seed: ${group.categorySlug}`);
    for (const product of group.products) {
      const saved = await prisma.product.upsert({
        where: { slug: product.slug },
        update: { name: product.name, description: product.description, priceKobo: product.priceKobo, status: "ACTIVE", categoryId: category.id, moderationNote: "DEMO — demonstration inventory, not live supply" },
        create: { vendorId: vendor.id, categoryId: category.id, name: product.name, slug: product.slug, description: product.description, priceKobo: product.priceKobo, countryCode: "NG", saleMode: "escrow", status: "ACTIVE", moderationNote: "DEMO — demonstration inventory, not live supply" }
      });
      created += 1;
      await prisma.productImage.deleteMany({ where: { productId: saved.id } });
      await prisma.productImage.create({ data: { productId: saved.id, url: product.image, alt: product.alt, sortOrder: 0 } });
      await prisma.inventoryStock.upsert({ where: { productId: saved.id }, update: { quantity: 25 }, create: { productId: saved.id, quantity: 25 } });
    }
  }

  const counts = {
    database: name,
    classification: rows.map((row) => row.classification),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    demoVendors: await prisma.vendor.count({ where: { slug: "demo-catalogue-review" } }),
    crfCategories: await prisma.category.count({ where: { name: { startsWith: "CRF" } } }),
    upserts: created
  };
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
