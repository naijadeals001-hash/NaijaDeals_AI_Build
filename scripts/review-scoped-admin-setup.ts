/** Idempotent REVIEW-only country-scoped administrator fixture (scope: GH). */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

const EMAIL = "review-admin-gh@review.invalid";
const CREDENTIAL_PATH = "qa-artifacts/review-basket/.gh-admin-credential";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) throw new Error("refusing: database is not classified REVIEW");
  const role = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });
  const password = `ReviewGhAdmin-${randomBytes(10).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(password), scopeCountryCode: "GH", actorType: "ADMIN" },
    create: {
      email: EMAIL,
      name: "REVIEW Ghana-scoped Admin",
      passwordHash: await hashPassword(password),
      actorType: "ADMIN",
      countryCode: "GH",
      scopeCountryCode: "GH"
    }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id }
  });
  writeFileSync(CREDENTIAL_PATH, `${EMAIL}\n${password}\n`);
  console.log(JSON.stringify({ created: true, email: EMAIL, scopeCountryCode: "GH", credentialPath: CREDENTIAL_PATH }));
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); })
  .finally(() => prisma.$disconnect());
