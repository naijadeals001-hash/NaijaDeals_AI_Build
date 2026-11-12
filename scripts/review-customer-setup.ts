/**
 * Idempotent REVIEW-only designated customer for basket acceptance.
 * Refuses any database not classified REVIEW. The password is written to a
 * git-ignored file for the test runner and never printed.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

const EMAIL = "review-customer@review.invalid";
const CREDENTIAL_PATH = "qa-artifacts/review-basket/.credential";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  if (!rows.some((row) => row.classification === "REVIEW")) {
    throw new Error(`refusing: ${db[0]?.current_database ?? "unknown"} is not classified REVIEW`);
  }
  const password = `ReviewBasket-${randomBytes(10).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { name: "REVIEW Basket Customer", actorType: "CUSTOMER", passwordHash: await hashPassword(password) },
    create: {
      email: EMAIL,
      name: "REVIEW Basket Customer",
      actorType: "CUSTOMER",
      countryCode: "NG",
      passwordHash: await hashPassword(password)
    }
  });
  const cart = (await prisma.cart.findFirst({ where: { userId: user.id } })) ??
    (await prisma.cart.create({ data: { userId: user.id } }));
  writeFileSync(CREDENTIAL_PATH, `${EMAIL}\n${password}\n`);
  console.log(JSON.stringify({ created: true, email: EMAIL, cartId: cart.id, database: db[0]?.current_database, credentialPath: CREDENTIAL_PATH }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
