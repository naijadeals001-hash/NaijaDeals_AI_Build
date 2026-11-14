/**
 * REVIEW-only seed for the separated Discover Africa staff roles.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/seed-country-roles.ts
 *
 * The shared guard verifies REVIEW_DATABASE_URL, the live current_database(),
 * the REVIEW classification and the required tables before any write. The
 * database name is not printed with the result.
 *
 * These are role definitions, not accounts: assigning them is a separate
 * super-administrator action in the Control Center (or the run-owned fixture
 * setup script).
 */
import { PrismaClient } from "@prisma/client";
import { requireCountryReviewDatabase } from "./lib/country-review-db";

const ROLES = [
  ["country_editor", "Drafts and edits Discover Africa country guides; cannot publish or verify origin."],
  ["country_publisher", "Publishes and unpublishes reviewed Discover Africa country guides."],
  ["country_origin_reviewer", "Records and reviews product country-of-origin evidence."]
] as const;

async function main() {
  await requireCountryReviewDatabase();
  const prisma = new PrismaClient();
  try {
    for (const [roleName, description] of ROLES) {
      await prisma.role.upsert({
        where: { name: roleName },
        update: { description },
        create: { name: roleName, description }
      });
    }
    console.log(JSON.stringify({ seeded: ROLES.map(([role]) => role), accountsCreated: 0 }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
