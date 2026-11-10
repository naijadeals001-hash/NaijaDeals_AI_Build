/**
 * Creates the clearly-identified Aura mockup fixture used only for visual
 * comparison against the approved references.
 *
 * Per the project directive: ordinary accounts keep their real name and real
 * conversations. This fixture exists so a screenshot can be compared with the
 * mockup like-for-like. It is gated to non-production environments and refuses
 * to run against a LIVE-classified database.
 *
 * Usage: npx tsx scripts/aura-mockup-fixture.ts           (create/refresh)
 *        npx tsx scripts/aura-mockup-fixture.ts --remove  (delete everything)
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();
const EMAIL = "aura-mockup-fixture@naijadeals.test";
// Supplied by the environment so no credential is committed. The fixture refuses
// to run without it rather than falling back to a hard-coded password.
const PASSWORD = process.env.AURA_FIXTURE_PASSWORD ?? "";

const CONVERSATIONS = ["Abuja weekend", "Find a solar installer", "Dinner for the family"];

(async () => {
  if (!PASSWORD) {
    console.error("Set AURA_FIXTURE_PASSWORD before running the mockup fixture.");
    process.exit(2);
  }
  const classification = await prisma.databaseClassification.findUnique({ where: { id: "default" } });
  if (process.env.NODE_ENV === "production" || classification?.classification === "LIVE") {
    console.error("Refusing to create the mockup fixture in production or on a LIVE database.");
    process.exit(2);
  }

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (process.argv.includes("--remove")) {
    if (existing) {
      await prisma.auraConversation.deleteMany({ where: { userId: existing.id } });
      await prisma.auraPlan.deleteMany({ where: { userId: existing.id } });
      await prisma.auraPreference.deleteMany({ where: { userId: existing.id } });
      await prisma.wallet.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    console.log(JSON.stringify({ status: "removed", email: EMAIL }));
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { name: "Patrick", passwordHash } })
    : await prisma.user.create({
        data: { email: EMAIL, name: "Patrick", passwordHash, actorType: "CUSTOMER", countryCode: "NG" }
      });

  if (!(await prisma.wallet.findFirst({ where: { userId: user.id } }))) {
    await prisma.wallet.create({ data: { ownerType: "CUSTOMER", userId: user.id } });
  }

  // Rebuild history so repeat runs stay deterministic.
  await prisma.auraConversation.deleteMany({ where: { userId: user.id } });
  for (const title of CONVERSATIONS) {
    await prisma.auraConversation.create({ data: { userId: user.id, title } });
  }

  await prisma.auraPreference.upsert({
    where: { userId: user.id },
    update: { personalised: true, useSavedPreferences: true },
    create: { userId: user.id, personalised: true, useSavedPreferences: true }
  });

  console.log(JSON.stringify({ status: "ready", email: EMAIL, conversations: CONVERSATIONS.length }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
