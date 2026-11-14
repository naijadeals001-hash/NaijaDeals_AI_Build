/**
 * Shop availability view tests.
 *
 * Component/projection-level proof for the saved-items, Control Center
 * catalogue and homepage rail surfaces. No database or network writes.
 *
 * Usage: npx tsx scripts/shop-availability-view-tests.tsx
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApiProduct } from "../lib/api-client";
import { availabilityProjection } from "../lib/services/core/availability";
import { homeRailProducts, type HomepageDeal } from "../lib/services/core/home-rail";

// Next's JSX runtime injects React; tsx's classic transform needs it globally
// before importing the page components.
(globalThis as unknown as { React: typeof React }).React = React;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function product(input: {
  id?: string;
  slug?: string;
  name?: string;
  stock?: { quantity: number; reserved: number; lowStockLevel: number } | null;
  variants?: Array<{ id: string; name: string; sku: string; priceKobo: string; stock: number; reserved: number; isActive: boolean }>;
}): ApiProduct {
  return {
    id: input.id ?? "product-1",
    slug: input.slug ?? "probe-product",
    name: input.name ?? "Probe product",
    description: "Probe description",
    priceKobo: "10000",
    status: "ACTIVE",
    category: { id: "category-1", name: "Category", slug: "category" },
    vendor: { id: "vendor-1", name: "Vendor" },
    images: [{ id: "image-1", url: "/generated/shop/category-home-kitchen.webp", alt: null, sortOrder: 0 }],
    stock: input.stock ?? null,
    variants: input.variants ?? []
  } as unknown as ApiProduct;
}

async function main() {
  const { SavedItemCard } = await import("../components/functional/account-page");
  const { catalogueStockSentence } = await import("../components/admin/catalogue/catalogue-workspace");

  // --- Shared projection -----------------------------------------------------
  const variantProjection = availabilityProjection({
    variants: [{ isActive: true, stock: 2, reserved: 1 }],
    stock: { quantity: 99, reserved: 0 }
  });
  check(
    "variant stock is authoritative and product-level stock is ignored",
    variantProjection.available === 1 &&
      variantProjection.onHand === 2 &&
      variantProjection.variantManaged &&
      variantProjection.requiresVariantSelection &&
      variantProjection.known,
    JSON.stringify(variantProjection)
  );
  const inactiveProjection = availabilityProjection({
    variants: [{ isActive: false, stock: 5, reserved: 0 }],
    stock: { quantity: 4, reserved: 1 }
  });
  check(
    "inactive variants fall back to the product stock row",
    inactiveProjection.available === 3 && inactiveProjection.onHand === 4 && !inactiveProjection.variantManaged,
    JSON.stringify(inactiveProjection)
  );
  const unknownProjection = availabilityProjection({ variants: [], stock: null });
  check(
    "missing stock is reported as unknown, not zero on hand",
    !unknownProjection.known && unknownProjection.available === 0,
    JSON.stringify(unknownProjection)
  );

  // --- Saved items -----------------------------------------------------------
  const variantCard = renderToStaticMarkup(
    <SavedItemCard
      item={{
        id: "saved-variant",
        product: product({
          slug: "saved-variant",
          name: "Saved variant product",
          stock: { quantity: 0, reserved: 0, lowStockLevel: 0 },
          variants: [
            { id: "variant-1", name: "Small", sku: "SMALL-1", priceKobo: "10000", stock: 2, reserved: 0, isActive: true }
          ]
        })
      }}
      busy={false}
      onAdd={() => undefined}
      onRemove={() => undefined}
    />
  );
  check(
    "variant-managed saved item offers Choose options and never auto-adds",
    variantCard.includes("Choose options") &&
      variantCard.includes('href="/product/saved-variant"') &&
      !variantCard.includes("Add to cart"),
    `len=${variantCard.length}`
  );
  check("variant-managed saved item keeps the remove action", variantCard.includes("Remove"));
  check("variant-managed saved item reports in stock honestly", variantCard.includes("In stock"));

  const emptyVariantCard = renderToStaticMarkup(
    <SavedItemCard
      item={{
        id: "saved-empty-variant",
        product: product({
          slug: "saved-empty-variant",
          stock: { quantity: 0, reserved: 0, lowStockLevel: 0 },
          variants: [
            { id: "variant-2", name: "Large", sku: "LARGE-1", priceKobo: "10000", stock: 0, reserved: 0, isActive: true }
          ]
        })
      }}
      busy={false}
      onAdd={() => undefined}
      onRemove={() => undefined}
    />
  );
  check(
    "unavailable variant saved item stays honest and still allows option browsing",
    emptyVariantCard.includes("Out of stock") &&
      emptyVariantCard.includes("Choose options") &&
      !emptyVariantCard.includes("Add to cart"),
    `len=${emptyVariantCard.length}`
  );

  const simpleCard = renderToStaticMarkup(
    <SavedItemCard
      item={{
        id: "saved-simple",
        product: product({ slug: "saved-simple", stock: { quantity: 3, reserved: 0, lowStockLevel: 1 } })
      }}
      busy={false}
      onAdd={() => undefined}
      onRemove={() => undefined}
    />
  );
  check(
    "non-variant saved item keeps a working Add to cart action",
    simpleCard.includes("Add to cart") &&
      !simpleCard.includes("Choose options") &&
      simpleCard.includes("In stock") &&
      !simpleCard.includes('disabled=""'),
    `len=${simpleCard.length}`
  );

  const unknownCard = renderToStaticMarkup(
    <SavedItemCard
      item={{ id: "saved-unknown", product: product({ slug: "saved-unknown", stock: null }) }}
      busy={false}
      onAdd={() => undefined}
      onRemove={() => undefined}
    />
  );
  check(
    "saved item without a stock record disables adding instead of claiming zero",
    unknownCard.includes("Availability unavailable") &&
      unknownCard.includes("Add to cart") &&
      unknownCard.includes('disabled=""'),
    `len=${unknownCard.length}`
  );

  // --- Control Center stock sentence ----------------------------------------
  const variantSentence = catalogueStockSentence({
    variants: [
      { isActive: true, stock: 2, reserved: 1 },
      { isActive: true, stock: 0, reserved: 0 }
    ],
    stock: { quantity: 0, reserved: 0 }
  });
  check(
    "catalogue sentence reports accurate variant totals without a zero on-hand contradiction",
    variantSentence === "1 available across 2 active variants · 2 on hand" &&
      !/available of 0 on hand/i.test(variantSentence),
    variantSentence
  );
  const zeroVariantSentence = catalogueStockSentence({
    variants: [{ isActive: true, stock: 0, reserved: 0 }],
    stock: { quantity: 7, reserved: 0 }
  });
  check(
    "catalogue sentence never pairs available units with a zero on-hand total",
    zeroVariantSentence === "0 available across 1 active variant · 0 on hand" &&
      !/available of 0 on hand/i.test(zeroVariantSentence),
    zeroVariantSentence
  );
  const unknownSentence = catalogueStockSentence({ variants: [], stock: null });
  check(
    "catalogue sentence renders an unavailable state when stock is unknown",
    unknownSentence === "Stock unavailable — no inventory record" && !unknownSentence.includes("0 available"),
    unknownSentence
  );
  const simpleSentence = catalogueStockSentence({ variants: [], stock: { quantity: 5, reserved: 2 } });
  check(
    "catalogue sentence reports product-level availability correctly",
    simpleSentence === "3 available · 5 on hand",
    simpleSentence
  );

  // --- Homepage rail ---------------------------------------------------------
  const deal = (input: Partial<HomepageDeal> & Pick<HomepageDeal, "id" | "name" | "slug">): HomepageDeal => ({
    priceKobo: 100000,
    isSample: false,
    images: [{ url: "/generated/shop/category-home-kitchen.webp" }],
    stock: null,
    variants: [],
    vendor: { name: "Review Seller", owner: { email: "seller@review.invalid" } },
    ...input
  });
  const rail = homeRailProducts([
    deal({
      id: "a",
      name: "Variant rail product",
      slug: "variant-rail-product",
      stock: { quantity: 0, reserved: 0 },
      variants: [{ isActive: true, stock: 5, reserved: 1 }]
    }),
    deal({
      id: "b",
      name: "Product stock rail product",
      slug: "product-stock-rail-product",
      stock: { quantity: 3, reserved: 0 }
    }),
    deal({
      id: "c",
      name: "Variant with product-level stock only",
      slug: "variant-product-stock-only",
      stock: { quantity: 9, reserved: 0 },
      variants: [{ isActive: true, stock: 0, reserved: 0 }]
    }),
    deal({
      id: "d",
      name: "Unknown stock rail product",
      slug: "unknown-stock-rail-product",
      stock: null
    }),
    deal({
      id: "e",
      name: "Demo vendor rail product",
      slug: "demo-vendor-rail-product",
      stock: { quantity: 3, reserved: 0 },
      vendor: { name: "DEMO — Review Seller", owner: { email: "demo@review.invalid" } }
    }),
    deal({
      id: "f",
      name: "Sample rail product",
      slug: "sample-rail-product",
      stock: { quantity: 3, reserved: 0 },
      isSample: true
    })
  ]);
  check(
    "homepage rail uses variant availability and ignores product-level stock on variant products",
    rail.some((entry) => entry.id === "a") &&
      rail.some((entry) => entry.id === "b") &&
      !rail.some((entry) => entry.id === "c") &&
      !rail.some((entry) => entry.id === "d") &&
      !rail.some((entry) => entry.id === "e") &&
      !rail.some((entry) => entry.id === "f"),
    rail.map((entry) => entry.id).join(",")
  );

  const failures = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
