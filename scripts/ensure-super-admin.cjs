/**
 * Idempotently ensures the local development super-administrator exists.
 *
 * Non-destructive: it never deletes data. It creates the `super_admin` role if
 * missing and upserts one user. Re-running it restores the fixture password.
 *
 * Usage:
 *   node scripts/ensure-super-admin.cjs
 *
 * The development password is read from SUPER_ADMIN_PASSWORD when provided,
 * otherwise the documented local fixture password is used. Nothing is printed
 * except the resulting email and role names.
 */

const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient();

const EMAIL = process.env.SUPER_ADMIN_EMAIL || "superadmin@naijadeals.local";
const NAME = process.env.SUPER_ADMIN_NAME || "Super Admin";
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "SuperAdminPass123!";

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt.toString("hex")}$${hash}`;
}

async function main() {
  const role = await prisma.role.upsert({
    where: { name: "super_admin" },
    update: { description: "Platform super-administrator" },
    create: { name: "super_admin", description: "Platform super-administrator" }
  });

  const passwordHash = hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: NAME,
      actorType: "ADMIN",
      passwordHash
    },
    create: {
      email: EMAIL,
      name: NAME,
      actorType: "ADMIN",
      passwordHash
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id }
  });

  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { name: true } } }
  });

  console.log(`Super administrator ready: ${user.email}`);
  console.log(`Roles: ${roles.map((entry) => entry.role.name).join(", ")}`);
}

main()
  .catch((error) => {
    console.error("Failed to ensure super administrator:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
