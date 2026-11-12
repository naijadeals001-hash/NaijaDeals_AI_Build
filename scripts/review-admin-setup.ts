/** REVIEW-only super-admin fixture for catalogue moderation acceptance. */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

const EMAIL = "review-admin@review.invalid";
const CREDENTIAL_PATH = "qa-artifacts/review-basket/.admin-credential";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  if (!rows.some((row) => row.classification === "REVIEW")) {
    throw new Error(`refusing: ${db[0]?.current_database ?? "unknown"} is not classified REVIEW`);
  }
  const role = await prisma.role.upsert({ where: { name: "super_admin" }, update: {}, create: { name: "super_admin" } });
  const password = `ReviewAdmin-${randomBytes(10).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: await hashPassword(password), actorType: "ADMIN" },
    create: {
      email: EMAIL,
      name: "REVIEW Catalogue Admin",
      passwordHash: await hashPassword(password),
      actorType: "ADMIN",
      countryCode: "NG"
    }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id }
  });
  writeFileSync(CREDENTIAL_PATH, `${EMAIL}\n${password}\n`);
  console.log(JSON.stringify({ created: true, email: EMAIL, database: db[0]?.current_database, credentialPath: CREDENTIAL_PATH }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
