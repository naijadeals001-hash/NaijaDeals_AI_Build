import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

/**
 * Aura affiliate assistance through the real conversation/tool-dispatch path.
 *
 *   npx tsx scripts/aura-affiliate-dispatch-verify.ts
 *
 * Uses the deterministic test provider (AURA_TEST_PROVIDER=1), which is selected
 * inside streamCompletion before any provider key is read. The dummy key below
 * only satisfies runTurn's earlier configured-check; it is never used for a
 * network call. No paid model call occurs.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  process.env.AURA_TEST_PROVIDER = "1";
  process.env.AURA_TEST_ALLOW_PRODUCTION_BUILD = "1";
  process.env.AURA_TEST_TOOL = "get_affiliate_summary";
  process.env.AURA_TEST_CHUNK_DELAY_MS = "0";
  if (!process.env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = "deterministic-test-provider-not-used";

  const { runTurn } = await import("../lib/aura/chat");

  const passwordHash = await hashPassword(`AuraDispatch-${randomUUID()}`);
  const user = await prisma.user.create({ data: { email: `aura-dispatch-${runId}@example.test`, name: "Aura dispatch", actorType: "CUSTOMER", passwordHash } });
  const profile = await prisma.affiliateProfile.create({
    data: { userId: user.id, termsVersion: "dispatch", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `aura-dispatch-${runId}`, name: "Dispatch campaign", vertical: "shop", status: "ACTIVE", commissionBps: 500, budgetKobo: 1_000_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  const link = await prisma.affiliateLink.create({
    data: { affiliateId: profile.id, campaignId: campaign.id, code: runId.toUpperCase().slice(0, 10), destination: "/" }
  });
  await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:aura-dispatch-${runId}`, affiliateId: profile.id, campaignId: campaign.id, linkId: link.id,
      entityType: "Order", entityId: `aura-dispatch-order-${runId}`, ruleVersion: 1, basisType: "SUBTOTAL",
      commissionBps: 500, basisKobo: 100_000n, amountKobo: 5_000n, state: "TRACKED"
    }
  });
  const conversation = await prisma.auraConversation.create({
    data: { userId: user.id, title: "Affiliate earnings" }
  });
  await prisma.auraMessage.create({
    data: { conversationId: conversation.id, role: "user", content: "How are my affiliate earnings doing?" }
  });

  const events: Array<{ type: string; [key: string]: unknown }> = [];
  for await (const event of runTurn({ userId: user.id, conversationId: conversation.id })) {
    events.push(event as { type: string; [key: string]: unknown });
  }

  try {
    const error = events.find((event) => event.type === "error");
    if (error) throw new Error(`runTurn emitted an error: ${JSON.stringify(error)}`);

    const status = events.find((event) => event.type === "status");
    if (!status || status.text !== "Checking your affiliate position") {
      throw new Error(`tool status was not dispatched: ${JSON.stringify(status)}`);
    }

    const cards = events.find((event) => event.type === "cards") as { cards?: Array<{ title: string; priceNaira?: number }> } | undefined;
    if (!cards || !cards.cards?.some((card) => card.title === "Affiliate commission")) {
      throw new Error(`affiliate card was not produced: ${JSON.stringify(cards)}`);
    }

    const done = events.find((event) => event.type === "done") as { messageId?: string; conversationId?: string } | undefined;
    if (!done?.messageId) throw new Error("the turn did not persist a message");

    const stored = await prisma.auraMessage.findUnique({ where: { id: done.messageId } });
    if (!stored || !stored.toolNames.includes("get_affiliate_summary")) {
      throw new Error(`persisted message missing the tool trail: ${JSON.stringify(stored?.toolNames)}`);
    }

    console.log(JSON.stringify({
      database: actual,
      provider: "deterministic-test",
      events: events.map((event) => event.type),
      toolStatus: status.text,
      card: cards.cards.find((card) => card.title === "Affiliate commission"),
      persistedToolNames: stored.toolNames,
      status: "PASS"
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      database: actual,
      events: events.map((event) => event.type),
      status: "FAIL",
      error: String(inspect(error, { depth: 2 })).slice(0, 900)
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
