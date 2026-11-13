/** REVIEW-only seller fixture for taxonomy listing acceptance. */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

const EMAIL = "review-seller@review.invalid";
const PATH = "qa-artifacts/review-basket/.seller-credential";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) throw new Error("refusing: database is not classified REVIEW");
  const password = `ReviewSeller-${randomBytes(10).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(password), actorType: "VENDOR" },
    create: { email: EMAIL, name: "REVIEW Seller", actorType: "VENDOR", countryCode: "NG", passwordHash: await hashPassword(password) }
  });
  const vendor = await prisma.vendor.findFirst({ where: { slug: "demo-catalogue-review" } });
  if (!vendor) throw new Error("demo vendor missing");
  await prisma.vendor.update({ where: { id: vendor.id }, data: { ownerId: user.id, status: "VERIFIED" } });
  writeFileSync(PATH, `${EMAIL}\n${password}\n`);
  console.log(JSON.stringify({ created: true, email: EMAIL, vendorId: vendor.id, credentialPath: PATH }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); }).finally(() => prisma.$disconnect());
