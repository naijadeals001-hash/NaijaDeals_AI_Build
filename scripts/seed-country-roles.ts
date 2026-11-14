/** REVIEW/test-only seed for the separated Discover Africa staff roles. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROLES = [
  ["country_publisher", "Publishes and unpublishes reviewed Discover Africa country guides."],
  ["country_origin_reviewer", "Records and reviews product country-of-origin evidence."]
] as const;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  let name = "";
  try { name = new URL(url).pathname.replace(/^\//, ""); } catch { /* handled */ }
  if (!name || !/(review|test)/i.test(name)) throw new Error(`Refusing to seed roles on ${name || "unknown"} — REVIEW/test only.`);
  const classification = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!classification.some((row) => row.classification === "REVIEW")) throw new Error("Refusing: database is not classified REVIEW.");
  for (const [roleName, description] of ROLES) {
    await prisma.role.upsert({ where: { name: roleName }, update: { description }, create: { name: roleName, description } });
  }
  console.log(JSON.stringify({ seeded: ROLES.map(([role]) => role), database: name }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
