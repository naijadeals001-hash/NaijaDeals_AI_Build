/**
 * Read-only staging identity and fixture inventory.
 *
 * Loads the protected staging environment, asserts the expected database name
 * and TEST classification, and prints only aggregate state. No credentials or
 * .env values are printed.
 */
import fs from "node:fs";

const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const EXPECTED_DATABASE = "naijadeals_staging";

function loadStagingEnvironment() {
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  if (!values.DATABASE_URL) throw new Error("staging DATABASE_URL is not configured");
  process.env.DATABASE_URL = values.DATABASE_URL;
  return values;
}

async function main() {
  loadStagingEnvironment();
  const { prisma } = await import("../../lib/prisma");
  const database = await prisma.$queryRaw<Array<{ name: string }>>`select current_database() as name`;
  const name = database[0]?.name ?? "unknown";
  const classifications = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (name !== EXPECTED_DATABASE) throw new Error(`refusing: connected to ${name}, expected ${EXPECTED_DATABASE}`);
  if (!classifications.some((row) => row.classification === "TEST")) {
    throw new Error(`refusing: ${name} is not classified TEST`);
  }

  const [categories, products, activeProducts, demoProducts, sampleProducts, users, wallets] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { isDemo: true } }),
    prisma.product.count({ where: { isSample: true } }),
    prisma.user.findMany({ select: { roles: { select: { role: { select: { name: true } } } } } }),
    prisma.wallet.groupBy({ by: ["ownerType"], _count: { _all: true } })
  ]);
  const roleCounts: Record<string, number> = {};
  for (const user of users) {
    for (const role of user.roles) roleCounts[role.role.name] = (roleCounts[role.role.name] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        database: name,
        classification: classifications.map((row) => row.classification),
        categories,
        products,
        activeProducts,
        demoProducts,
        sampleProducts,
        users: users.length,
        roleCounts,
        wallets
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
