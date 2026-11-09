/**
 * Creates the clearly-labelled NaijaPay verification accounts.
 *
 * These exist so financial checks never touch a customer-named account. Every
 * address uses the `naijapay-test-` prefix and a `.test` domain, matching the
 * convention the other verticals use for fixtures. Idempotent.
 *
 * Usage: npx tsx scripts/naijapay-fixtures.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();
const PASSWORD = "NaijaPayTest123!";

export const FIXTURES = {
  sender: "naijapay-test-sender@naijadeals.test",
  recipient: "naijapay-test-recipient@naijadeals.test"
} as const;

(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  for (const [role, email] of Object.entries(FIXTURES)) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `NaijaPay Test ${role.charAt(0).toUpperCase()}${role.slice(1)}`,
        passwordHash,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    const wallet = await prisma.wallet.findFirst({ where: { userId: user.id } });
    if (!wallet) {
      await prisma.wallet.create({ data: { ownerType: "CUSTOMER", userId: user.id } });
    }
    console.log(JSON.stringify({ role, email, userId: user.id, walletCreated: !wallet }));
  }
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
