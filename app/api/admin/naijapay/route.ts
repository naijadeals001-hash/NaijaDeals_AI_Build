import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdminPermission, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { transitionMilestone } from "@/lib/services/core/milestone.service";

export const dynamic = "force-dynamic";

/**
 * NaijaPay controls inside the existing Control Center.
 *
 * Read (finance:read): provider configuration STATUS only — never a secret —
 * plus pending and uncertain top-ups, disputed milestones and live journal
 * totals. Write (finance:escrow:settle): settle a disputed milestone.
 *
 * There is no separate NaijaPay admin. It uses the same permission engine,
 * audit trail and regional scoping as every other module.
 */
function providerStatus() {
  const paystackKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  const flutterwaveKey = process.env.FLUTTERWAVE_SECRET_KEY ?? "";
  const describe = (name: string, value: string, testPrefix: string) => {
    if (!value) return { id: name, configured: false, mode: null, note: `Not configured.` };
    const test = value.startsWith(testPrefix);
    return {
      id: name,
      configured: true,
      mode: test ? "test" : "live",
      // Never echo the key; only its shape decides whether it is sandbox or live.
      note: test ? "Sandbox key present." : "A live key is present — real money movement is gated by the database classification."
    };
  };
  return [
    describe("paystack", paystackKey, "sk_test_"),
    describe("flutterwave", flutterwaveKey, "FLWSECK_TEST"),
    {
      id: "local-test-provider",
      configured: process.env.ENABLE_TEST_PAYMENTS === "true",
      mode: "test",
      note: process.env.ENABLE_TEST_PAYMENTS === "true" ? "Enabled for a TEST-classified database only." : "Disabled."
    },
    {
      id: "p2p-transfers",
      configured: process.env.ENABLE_P2P_TRANSFERS === "true",
      mode: "development",
      note: process.env.ENABLE_P2P_TRANSFERS === "true" ? "Enabled in this environment." : "Disabled."
    }
  ];
}

export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    const [classification, pendingTopUps, disputed, journal, unbalanced] = await Promise.all([
      prisma.databaseClassification.findUnique({ where: { id: "default" } }),
      prisma.walletTopUp.findMany({
        where: { status: { in: ["PENDING", "AUTHORIZED"] } },
        select: { id: true, provider: true, providerReference: true, amountKobo: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 50
      }),
      prisma.escrowMilestone.findMany({
        where: { status: "disputed" },
        select: { id: true, reference: true, title: true, amountKobo: true, currency: true, payerUserId: true, payeeUserId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 50
      }),
      prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amountKobo: true }, _count: { _all: true } }),
      prisma.$queryRaw<Array<{ reference: string; net: string }>>`
        SELECT t.reference, SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END)::text AS net
        FROM "WalletTransaction" t JOIN "LedgerEntry" l ON l."transactionId" = t.id
        GROUP BY t.id, t.reference, t."createdAt"
        HAVING SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0
        ORDER BY t."createdAt" DESC`
    ]);

    const credit = journal.find((r) => r.direction === "CREDIT")?._sum.amountKobo ?? BigInt(0);
    const debit = journal.find((r) => r.direction === "DEBIT")?._sum.amountKobo ?? BigInt(0);

    return NextResponse.json(
      jsonSafe({
        database: { classification: classification?.classification ?? "UNKNOWN", updatedAt: classification?.updatedAt ?? null },
        providers: providerStatus(),
        journal: {
          creditKobo: credit.toString(),
          debitKobo: debit.toString(),
          differenceKobo: (credit - debit).toString(),
          entryCount: journal.reduce((sum, r) => sum + r._count._all, 0)
        },
        unbalancedTransactions: unbalanced,
        pendingTopUps,
        disputedMilestones: disputed
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const actor = await requireAdminPermission("finance:escrow:settle");
    const body = await request.json().catch(() => null);

    const reference = String(body?.reference ?? "");
    const decision = String(body?.decision ?? "");
    if (!reference) return NextResponse.json({ error: "A milestone reference is required.", code: "reference_required" }, { status: 400 });
    if (!["release", "refund"].includes(decision)) {
      return NextResponse.json({ error: "Decision must be release or refund.", code: "invalid_decision" }, { status: 400 });
    }
    const note = String(body?.note ?? "").trim();
    if (note.length < 5) {
      // A dispute decision moves real value between two people; the reason is part
      // of the audit trail, not optional commentary.
      return NextResponse.json({ error: "Record why this decision was made (at least 5 characters).", code: "reason_required" }, { status: 400 });
    }

    const milestone = await transitionMilestone(prisma, {
      reference,
      actorId: actor.id,
      action: decision as "release" | "refund",
      isAdmin: true,
      note: note.slice(0, 300)
    });

    await recordAudit({
      actorId: actor.id,
      action: "milestone.admin_settlement",
      entity: "EscrowMilestone",
      entityId: milestone.id,
      metadata: { reference, decision, note: note.slice(0, 300), status: milestone.status }
    });

    return NextResponse.json(jsonSafe({ milestone }));
  } catch (error) {
    return jsonError(error);
  }
}
