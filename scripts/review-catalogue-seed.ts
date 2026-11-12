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
