#!/usr/bin/env node
/**
 * REVIEW-only creation of the four reviewed requested leaves and mapping of the
 * five remaining ambiguous products. Dry-run by default; --apply is idempotent.
 *
 * Source definitions are in lib/data/taxonomy.ts so the coverage report's
 * source-parity check passes. Existing product identity fields are fingerprinted
 * before the category-only update.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { prisma } from "../lib/prisma";
import { TAXONOMY_NODES } from "../lib/data/taxonomy";

const KEYS = ["headphones-personal-audio", "fragrance-perfume", "cameras-photography", "smartwatches-wearables"] as const;
const PRODUCT_MAP: Record<string, string> = {
  cmwdynxdd0018v4q00rd1lw3x: "headphones-personal-audio",
  cmwdynxds002fv4q0puj39gxq: "fragrance-perfume",
  cmwdynxdy002yv4q0n19qj5vm: "fragrance-perfume",
  cmwf0qnsr007yv4aw6ym23yet: "cameras-photography",
  cmwf0qnto008cv4awngcofj2x: "smartwatches-wearables"
};
const RUN = `TAXLEAF-${Date.now().toString(36).toUpperCase()}`;

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reviewUrl = process.env.REVIEW_DATABASE_URL?.trim();
  if (!reviewUrl) fail("REVIEW_DATABASE_URL is required.");
  const client = new Client({ connectionString: reviewUrl });
  await client.connect();
  const identity = await client.query<{ database: string }>("select current_database() as database");
  const database = identity.rows[0]?.database ?? "";
  if (database !== "naijadeals_review") fail(`refusing database ${database}`);
  const cls = await client.query<{ classification: string }>('select classification from "DatabaseClassification" limit 1');
  if (!cls.rows.some((row) => row.classification === "REVIEW")) fail("not REVIEW");

  const definitions = KEYS.map((key) => {
    const definition = TAXONOMY_NODES.find((node) => node.key === key);
    if (!definition) fail(`missing source definition ${key}`);
    return definition;
  });

  console.log(`mode=${apply ? "apply" : "dry-run"} run=${RUN} database=${database}`);
  for (const definition of definitions) {
    const existing = await prisma.category.findUnique({ where: { key: definition.key! }, select: { id: true, name: true, slug: true } });
    console.log(`${existing ? "exists" : "create"} ${definition.key} → ${definition.name} (${definition.slug})`);
    if (apply && !existing) {
      const parent = definition.parentKey
        ? await prisma.category.findUnique({ where: { key: definition.parentKey }, select: { id: true } })
        : null;
      if (definition.parentKey && !parent) fail(`parent ${definition.parentKey} missing`);
      const id = randomUUID();
      await prisma.$transaction(async (tx) => {
        await tx.category.create({
          data: {
            id,
            key: definition.key,
            name: definition.name,
            slug: definition.slug,
            description: definition.description,
            parentId: parent?.id ?? null,
            level: definition.level,
            isSelectable: true,
            showOnHomepage: false,
            browsingVisible: true,
            isRegulated: false,
            sortOrder: definition.sortOrder,
            isActive: true,
            isDemo: false
          }
        });
        if (definition.aliases.length) {
          await tx.categoryAlias.createMany({
            data: definition.aliases.map((alias) => ({ categoryId: id, alias: alias.alias, locale: alias.locale ?? "en" })),
            skipDuplicates: true
          });
        }
        if (definition.attributes.length) {
          await tx.categoryAttribute.createMany({
            data: definition.attributes.map((attribute) => ({
              categoryId: id,
              key: attribute.key,
              label: attribute.label,
              type: attribute.type,
              required: attribute.required,
              options: attribute.options ?? undefined
            })),
            skipDuplicates: true
          });
        }
        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            action: "taxonomy.category.created",
            entity: "Category",
            entityId: id,
            metadata: { key: definition.key, parentKey: definition.parentKey ?? null, run: RUN }
          }
        });
      });
    }
  }

  if (!apply) {
    console.log("dry-run complete; no rows written");
    await client.end();
    await prisma.$disconnect();
    return;
  }

  const byKey = new Map(
    (await prisma.category.findMany({ where: { key: { in: [...KEYS] } }, select: { id: true, key: true, name: true, slug: true } }))
      .map((row) => [row.key!, row])
  );
  for (const key of KEYS) if (!byKey.get(key)) fail(`category ${key} is not available`);

  // Approve the four run-owned seller requests only when the matching leaf exists.
  for (const definition of definitions) {
    const leaf = byKey.get(definition.key!)!;
    const request = await prisma.categoryRequest.findFirst({
      where: { status: "PENDING", suggestedName: definition.name },
      orderBy: { createdAt: "asc" }
    });
    if (request) {
      console.log(`${apply ? "approve" : "would approve"} request ${request.id} → ${leaf.slug}`);
      if (apply) {
        await prisma.categoryRequest.update({
          where: { id: request.id },
          data: { status: "APPROVED", resolvedCategoryId: leaf.id, adminNote: `Reviewed leaf created (${RUN}).` }
        });
      }
    }
  }

  for (const [productId, key] of Object.entries(PRODUCT_MAP)) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { images: { orderBy: { sortOrder: "asc" } }, stock: true, category: true }
    });
    if (!product) fail(`product ${productId} missing`);
    const target = byKey.get(key)!;
    console.log(`${apply ? "move" : "would move"} ${product.slug}: ${product.category.key} → ${key}`);
    if (!apply || product.categoryId === target.id) continue;
    const before = {
      name: product.name,
      slug: product.slug,
      priceKobo: product.priceKobo.toString(),
      description: product.description,
      isDemo: product.isDemo,
      images: product.images.map((image) => ({ url: image.url, alt: image.alt, sortOrder: image.sortOrder })),
      stock: product.stock ? { quantity: product.stock.quantity, reserved: product.stock.reserved, lowStockLevel: product.stock.lowStockLevel } : null,
      categoryId: product.categoryId
    };
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { categoryId: target.id } });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          action: "taxonomy.product.reclassified",
          entity: "Product",
          entityId: productId,
          metadata: {
            run: RUN,
            before: { categoryId: before.categoryId, path: product.category.name },
            after: { categoryId: target.id, path: `${target.name}` },
            product: before
          }
        }
      });
      await tx.systemEvent.create({
        data: {
          id: randomUUID(),
          type: "taxonomy.product.reclassified",
          entity: "Product",
          entityId: productId,
          payload: { run: RUN, from: before.categoryId, to: target.id }
        }
      });
    });
    const after = await prisma.product.findUnique({ where: { id: productId }, include: { images: true, stock: true } });
    if (!after || after.name !== before.name || after.slug !== before.slug || after.priceKobo.toString() !== before.priceKobo || after.isDemo !== before.isDemo || after.images.length !== before.images.length || after.stock?.quantity !== before.stock?.quantity) {
      fail(`identity fields changed for ${productId}`);
    }
  }

  await client.end();
  await prisma.$disconnect();
  console.log("done");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
