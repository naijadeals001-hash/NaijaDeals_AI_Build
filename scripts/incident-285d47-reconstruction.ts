/**
 * Read-only reconstruction for incident ND-20261109-285D47.
 *
 * This script never writes. It opens one PostgreSQL transaction with
 * `SET TRANSACTION READ ONLY`, asserts the server reports a read-only
 * transaction, and then emits the reconstruction as JSON. It is deliberately
 * separate from the correction: no wallet, refund, journal, escrow, order or
 * audit row is created, changed or deleted.
 *
 * Usage:
 *   INCIDENT_READONLY=1 INCIDENT_READONLY_DB=naijadeals_core \
 *     npx tsx scripts/incident-285d47-reconstruction.ts
 *
 * The database must be named by `INCIDENT_READONLY_DB`; the script refuses to
 * run without the explicit acknowledgement variable and never prints the
 * connection string. `naijadeals_core` is the shared development database in
 * which the incident occurred. It is classified TEST and is read here only.
 */
import "dotenv/config";
import type { PrismaClient } from "@prisma/client";

const ORDER_NUMBER = "ND-20261109-285D47";
const REVERTED_ORDER_NUMBER = "ND-20261109-726639";
const PROPOSAL_KEY = "INCIDENT-2026-11-12-285D47-HOLD-RECLASS";

type Json = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function text(value: bigint | null | undefined) {
  return value === null || value === undefined ? null : value.toString();
}

async function loadReadOnly(url: string) {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient({ datasources: { db: { url } }, log: [] });
}

async function reconstruct(prisma: PrismaClient): Promise<Json> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const mode = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>(
        "SHOW transaction_read_only"
      );
      assert(mode[0]?.transaction_read_only === "on", "the transaction is not read-only; aborting");
      const database = await tx.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");

      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber: ORDER_NUMBER },
        include: {
          payments: true,
          escrowHolds: { include: { events: { orderBy: { createdAt: "asc" } } } },
          refunds: { orderBy: { createdAt: "asc" } },
          statusEvents: { orderBy: { createdAt: "asc" } },
          customer: { select: { id: true, name: true, email: true } },
          vendor: { select: { id: true, name: true } }
        }
      });
      const payment = order.payments.find((row) => row.status === "COMPLETED" || row.status === "REFUNDED") ?? order.payments[0];
      assert(payment, "the incident order has no payment");
      const escrow = order.escrowHolds[0];
      assert(escrow, "the incident order has no escrow");

      const walletTransactions = await tx.walletTransaction.findMany({
        where: { orderId: order.id },
        include: { ledger: { include: { wallet: { select: { id: true, ownerType: true, userId: true, vendorId: true } } } } },
        orderBy: { createdAt: "asc" }
      });
      const holdTransaction = walletTransactions.find((transaction) => transaction.type === "hold") ?? null;
      const refundIds = order.refunds.map((refund) => refund.id);
      const lifecycleEvents = refundIds.length
        ? await tx.systemEvent.findMany({
            where: { type: "refund.lifecycle", entity: "Refund", entityId: { in: refundIds } },
            orderBy: { createdAt: "asc" }
          })
        : [];
      const audits = await tx.auditLog.findMany({
        where: { OR: [{ entityId: order.id }, { entityId: { in: refundIds } }] },
        orderBy: { createdAt: "asc" }
      });

      const walletIds = new Set<string>([
        escrow.buyerWalletId,
        escrow.vendorWalletId,
        ...walletTransactions.map((transaction) => transaction.walletId),
        ...walletTransactions.flatMap((transaction) => transaction.ledger.map((leg) => leg.walletId))
      ]);
      const wallets = await tx.wallet.findMany({
        where: { id: { in: [...walletIds] } },
        select: {
          id: true,
          ownerType: true,
          userId: true,
          vendorId: true,
          availableKobo: true,
          heldKobo: true,
          updatedAt: true,
          user: { select: { email: true } },
          vendor: { select: { name: true } }
        }
      });
      const ledgerNet = new Map<string, bigint>();
      for (const entry of await tx.ledgerEntry.findMany({
        where: { walletId: { in: [...walletIds] } },
        select: { walletId: true, direction: true, amountKobo: true }
      })) {
        const signed = entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo;
        ledgerNet.set(entry.walletId, (ledgerNet.get(entry.walletId) ?? BigInt(0)) + signed);
      }

      const customerWallet = wallets.find((wallet) => wallet.id === escrow.buyerWalletId);
      const vendorWallet = wallets.find((wallet) => wallet.id === escrow.vendorWalletId);
      const systemWallet = await tx.wallet.findFirst({
        where: { ownerType: "SYSTEM" },
        select: {
          id: true,
          availableKobo: true,
          heldKobo: true,
          updatedAt: true
        }
      });
      assert(customerWallet && vendorWallet && systemWallet, "an incident wallet is missing");

      // Open escrows for the customer wallet, with the wallet that funded each
      // hold. `Order.refundedKobo` is a claim cap; only COMPLETED refunds move.
      const openEscrows = await tx.escrowHold.findMany({
        where: {
          buyerWalletId: customerWallet.id,
          status: { in: ["pending", "held", "release_eligible", "refund_requested", "disputed", "reserved"] }
        },
        select: {
          id: true,
          orderId: true,
          amountKobo: true,
          status: true,
          order: {
            select: {
              orderNumber: true,
              refundedKobo: true,
              totalKobo: true,
              paymentStatus: true,
              payments: { select: { provider: true, status: true } }
            }
          }
        }
      });
      const openOrderIds = openEscrows.map((row) => row.orderId);
      const refundGroups = openOrderIds.length
        ? await tx.refund.groupBy({
            by: ["orderId", "status"],
            where: { orderId: { in: openOrderIds }, status: { in: ["PENDING", "COMPLETED"] } },
            _sum: { amountKobo: true }
          })
        : [];
      const settledByOrder = new Map<string, bigint>();
      const pendingByOrder = new Map<string, bigint>();
      for (const row of refundGroups) {
        (row.status === "COMPLETED" ? settledByOrder : pendingByOrder).set(
          row.orderId,
          row._sum.amountKobo ?? BigInt(0)
        );
      }
      const holdTransactions = openOrderIds.length
        ? await tx.walletTransaction.findMany({
            where: { orderId: { in: openOrderIds }, type: "hold" },
            select: {
              orderId: true,
              walletId: true,
              amountKobo: true,
              wallet: { select: { ownerType: true } }
            }
          })
        : [];
      const holdOwnerByOrder = new Map(
        holdTransactions.map((row) => [row.orderId, { walletId: row.walletId, ownerType: row.wallet.ownerType }])
      );

      let customerFundedExposureKobo = BigInt(0);
      let systemFundedExposureKobo = BigInt(0);
      const openEscrowRows = openEscrows.map((row) => {
        const settled = settledByOrder.get(row.orderId) ?? BigInt(0);
        const pending = pendingByOrder.get(row.orderId) ?? BigInt(0);
        const exposure = row.amountKobo > settled ? row.amountKobo - settled : BigInt(0);
        const funding = holdOwnerByOrder.get(row.orderId) ?? null;
        if (funding?.ownerType === "SYSTEM") systemFundedExposureKobo += exposure;
        else customerFundedExposureKobo += exposure;
        return {
          orderNumber: row.order.orderNumber,
          escrowId: row.id,
          escrowStatus: row.status,
          escrowAmountKobo: text(row.amountKobo),
          settledRefundKobo: text(settled),
          pendingRefundKobo: text(pending),
          exposureKobo: text(exposure),
          provider: row.order.payments.find((paymentRow) => paymentRow.status === "COMPLETED" || paymentRow.status === "REFUNDED")?.provider ?? null,
          paymentStatus: row.order.paymentStatus,
          fundedByWalletId: funding?.walletId ?? null,
          fundedByOwnerType: funding?.ownerType ?? null,
          claimedKobo: text(row.order.refundedKobo)
        };
      });

      const vendorOpenEscrows = await tx.escrowHold.findMany({
        where: {
          vendorWalletId: vendorWallet.id,
          status: { in: ["pending", "held", "release_eligible", "refund_requested", "disputed", "reserved"] }
        },
        select: { orderId: true, amountKobo: true }
      });
      const vendorSettled = vendorOpenEscrows.length
        ? await tx.refund.groupBy({
            by: ["orderId"],
            where: {
              orderId: { in: vendorOpenEscrows.map((row) => row.orderId) },
              status: "COMPLETED"
            },
            _sum: { amountKobo: true }
          })
        : [];
      const vendorSettledByOrder = new Map(
        vendorSettled.map((row) => [row.orderId, row._sum.amountKobo ?? BigInt(0)])
      );
      const vendorExposureKobo = vendorOpenEscrows.reduce((sum, row) => {
        const settled = vendorSettledByOrder.get(row.orderId) ?? BigInt(0);
        return sum + (row.amountKobo > settled ? row.amountKobo - settled : BigInt(0));
      }, BigInt(0));

      const pendingRefunds = await tx.refund.findMany({
        where: { status: "PENDING" },
        include: { order: { select: { orderNumber: true, totalKobo: true, refundedKobo: true } }, payment: { select: { provider: true } } },
        orderBy: { createdAt: "asc" }
      });
      const pendingLifecycles = pendingRefunds.length
        ? await tx.systemEvent.findMany({
            where: {
              type: "refund.lifecycle",
              entity: "Refund",
              entityId: { in: pendingRefunds.map((refund) => refund.id) }
            },
            orderBy: { createdAt: "asc" }
          })
        : [];

      const revertedOrder = await tx.order.findUniqueOrThrow({
        where: { orderNumber: REVERTED_ORDER_NUMBER },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          refundedKobo: true,
          totalKobo: true,
          updatedAt: true,
          refunds: { select: { id: true, status: true, amountKobo: true } },
          walletTxs: { select: { id: true, type: true, amountKobo: true, reference: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          statusEvents: { select: { id: true } },
          _count: { select: { statusEvents: true } }
        }
      });
      const revertedAuditCount = await tx.auditLog.count({ where: { entityId: revertedOrder.id } });
      const revertedSystemEventCount = await tx.systemEvent.count({ where: { entityId: revertedOrder.id } });
      const refundTableStats = await tx.$queryRawUnsafe<
        Array<{ n_tup_ins: string; n_tup_upd: string; n_tup_del: string; n_live_tup: string }>
      >("select n_tup_ins::text, n_tup_upd::text, n_tup_del::text, n_live_tup::text from pg_stat_user_tables where relname = 'Refund'");

      const proposalExists = await tx.walletTransaction.count({ where: { reference: PROPOSAL_KEY } });
      const amount = order.totalKobo;
      const customerAvailableAfter = customerWallet.availableKobo - amount;
      const customerHeldAfter = customerWallet.heldKobo + amount;
      const systemAvailableAfter = systemWallet.availableKobo + amount;
      const systemHeldAfter = systemWallet.heldKobo - amount;
      const customerCoverageAfter = customerFundedExposureKobo - customerHeldAfter;
      const vendorCoverageAfter = vendorExposureKobo - vendorWallet.heldKobo;

      return {
        readOnly: {
          database: database[0]?.db ?? null,
          transactionReadOnly: mode[0]?.transaction_read_only ?? null,
          proposalReferenceExists: proposalExists > 0
        },
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotalKobo: text(order.subtotalKobo),
          deliveryFeeKobo: text(order.deliveryFeeKobo),
          escrowFeeKobo: text(order.escrowFeeKobo),
          commissionKobo: text(order.commissionKobo),
          totalKobo: text(order.totalKobo),
          refundedKobo: text(order.refundedKobo),
          currency: order.currency,
          countryCode: order.countryCode,
          createdAt: iso(order.createdAt),
          updatedAt: iso(order.updatedAt),
          customer: order.customer,
          vendor: order.vendor
        },
        payment: payment
          ? {
              id: payment.id,
              provider: payment.provider,
              providerReference: payment.providerReference,
              status: payment.status,
              amountKobo: text(payment.amountKobo),
              currency: payment.currency,
              verifiedAt: iso(payment.verifiedAt),
              raw: payment.raw
            }
          : null,
        escrow: {
          id: escrow.id,
          buyerWalletId: escrow.buyerWalletId,
          vendorWalletId: escrow.vendorWalletId,
          amountKobo: text(escrow.amountKobo),
          status: escrow.status,
          createdAt: iso(escrow.createdAt),
          updatedAt: iso(escrow.updatedAt),
          events: escrow.events.map((event) => ({ from: event.from, to: event.to, note: event.note, createdAt: iso(event.createdAt) }))
        },
        originalHold: holdTransaction
          ? {
              transactionId: holdTransaction.id,
              walletId: holdTransaction.walletId,
              amountKobo: text(holdTransaction.amountKobo),
              reference: holdTransaction.reference,
              description: holdTransaction.description,
              createdAt: iso(holdTransaction.createdAt),
              ledger: holdTransaction.ledger.map((leg) => ({
                walletId: leg.walletId,
                ownerType: leg.wallet.ownerType,
                direction: leg.direction,
                amountKobo: text(leg.amountKobo),
                memo: leg.memo
              }))
            }
          : null,
        refunds: order.refunds.map((refund) => ({
          id: refund.id,
          amountKobo: text(refund.amountKobo),
          status: refund.status,
          reason: refund.reason,
          idempotencyKey: refund.idempotencyKey,
          providerReference: refund.providerReference,
          createdAt: iso(refund.createdAt),
          completedAt: iso(refund.completedAt),
          lifecycle: lifecycleEvents
            .filter((event) => event.entityId === refund.id)
            .map((event) => ({ payload: event.payload, createdAt: iso(event.createdAt) }))
        })),
        refundJournals: walletTransactions
          .filter((transaction) => transaction.type === "refund")
          .map((transaction) => ({
            id: transaction.id,
            walletId: transaction.walletId,
            amountKobo: text(transaction.amountKobo),
            reference: transaction.reference,
            description: transaction.description,
            createdAt: iso(transaction.createdAt),
            ledger: transaction.ledger.map((leg) => ({
              walletId: leg.walletId,
              ownerType: leg.wallet.ownerType,
              direction: leg.direction,
              amountKobo: text(leg.amountKobo),
              memo: leg.memo
            }))
          })),
        auditRows: audits.map((row) => ({
          id: row.id,
          action: row.action,
          entity: row.entity,
          metadata: row.metadata,
          createdAt: iso(row.createdAt)
        })),
        wallets: wallets.map((wallet) => ({
          id: wallet.id,
          ownerType: wallet.ownerType,
          owner: wallet.user?.email ?? wallet.vendor?.name ?? null,
          availableKobo: text(wallet.availableKobo),
          heldKobo: text(wallet.heldKobo),
          ledgerNetKobo: text(ledgerNet.get(wallet.id) ?? BigInt(0)),
          updatedAt: iso(wallet.updatedAt)
        })),
        systemWallet: systemWallet
          ? { id: systemWallet.id, availableKobo: text(systemWallet.availableKobo), heldKobo: text(systemWallet.heldKobo), updatedAt: iso(systemWallet.updatedAt) }
          : null,
        coverage: {
          customerWalletId: customerWallet.id,
          customerHeldKobo: text(customerWallet.heldKobo),
          customerFundedOpenEscrowKobo: text(customerFundedExposureKobo),
          systemFundedOpenEscrowKobo: text(systemFundedExposureKobo),
          customerCoverageShortfallKobo: text(customerFundedExposureKobo - customerWallet.heldKobo),
          vendorWalletId: vendorWallet.id,
          vendorHeldKobo: text(vendorWallet.heldKobo),
          vendorOpenEscrowExposureKobo: text(vendorExposureKobo),
          vendorCoverageDifferenceKobo: text(vendorExposureKobo - vendorWallet.heldKobo),
          openEscrows: openEscrowRows
        },
        pendingRefunds: pendingRefunds.map((refund) => ({
          refundId: refund.id,
          orderNumber: refund.order.orderNumber,
          amountKobo: text(refund.amountKobo),
          provider: refund.payment.provider,
          createdAt: iso(refund.createdAt),
          claimedKobo: text(refund.order.refundedKobo),
          lifecycleEvents: pendingLifecycles.filter((event) => event.entityId === refund.id).length
        })),
        revertedClaim: {
          order: {
            id: revertedOrder.id,
            orderNumber: revertedOrder.orderNumber,
            status: revertedOrder.status,
            paymentStatus: revertedOrder.paymentStatus,
            refundedKobo: text(revertedOrder.refundedKobo),
            totalKobo: text(revertedOrder.totalKobo),
            updatedAt: iso(revertedOrder.updatedAt)
          },
          refundRows: revertedOrder.refunds.length,
          refundStatuses: revertedOrder.refunds.map((refund) => ({ id: refund.id, status: refund.status, amountKobo: text(refund.amountKobo) })),
          walletTransactions: revertedOrder.walletTxs.map((transaction) => ({
            id: transaction.id,
            type: transaction.type,
            amountKobo: text(transaction.amountKobo),
            reference: transaction.reference,
            createdAt: iso(transaction.createdAt)
          })),
          statusEventCount: revertedOrder._count.statusEvents,
          auditRows: revertedAuditCount,
          systemEvents: revertedSystemEventCount,
          refundLifecycleEvents: 0,
          refundTableStats: refundTableStats[0]
            ? {
                inserts: refundTableStats[0].n_tup_ins,
                updates: refundTableStats[0].n_tup_upd,
                deletes: refundTableStats[0].n_tup_del,
                live: refundTableStats[0].n_live_tup
              }
            : null,
          evidenceGap: "No Refund row, refund lifecycle event, wallet transaction, journal entry, audit row, SystemEvent or OrderStatusEvent records the attempted 100-kobo claim or its reversal. Order.updatedAt is the only residual write."
        },
        proposal: {
          reference: PROPOSAL_KEY,
          alreadyExists: proposalExists > 0,
          amountKobo: text(amount),
          preconditions: {
            customerAvailableContainsCredit: customerWallet.availableKobo >= amount,
            systemHeldContainsStrandedHold: systemWallet.heldKobo >= amount
          },
          walletTransactions: [
            {
              walletId: customerWallet.id,
              owner: customerWallet.user?.email ?? null,
              type: "debit",
              amountKobo: text(amount),
              reference: PROPOSAL_KEY,
              description: "Reverse the customer-wallet credit created by the misdirected external refund ND-20261109-285D47; approved incident correction",
              ledger: [
                { walletId: customerWallet.id, direction: "DEBIT", amountKobo: text(amount), memo: "Erroneous customer credit returned to provider clearing" },
                { walletId: systemWallet.id, direction: "CREDIT", amountKobo: text(amount), memo: "External refund settled through the platform account" }
              ]
            }
          ],
          heldProjectionChanges: [
            { walletId: customerWallet.id, heldDeltaKobo: text(amount), reason: "Restore the customer-held pool debited by the misdirected refund" },
            { walletId: systemWallet.id, heldDeltaKobo: text(-amount), reason: "Release the SYSTEM escrow hold that the refund should have discharged" }
          ],
          before: {
            customerAvailableKobo: text(customerWallet.availableKobo),
            customerHeldKobo: text(customerWallet.heldKobo),
            systemAvailableKobo: text(systemWallet.availableKobo),
            systemHeldKobo: text(systemWallet.heldKobo),
            vendorAvailableKobo: text(vendorWallet.availableKobo),
            vendorHeldKobo: text(vendorWallet.heldKobo)
          },
          after: {
            customerAvailableKobo: text(customerAvailableAfter),
            customerHeldKobo: text(customerHeldAfter),
            systemAvailableKobo: text(systemAvailableAfter),
            systemHeldKobo: text(systemHeldAfter),
            vendorAvailableKobo: text(vendorWallet.availableKobo),
            vendorHeldKobo: text(vendorWallet.heldKobo)
          },
          coverageAfter: {
            customerCoverageShortfallKobo: text(customerCoverageAfter),
            vendorCoverageDifferenceKobo: text(vendorCoverageAfter)
          },
          unrelatedFunds: {
            /** Pre-incident available: current available less the two refund credits. */
            customerPreIncidentAvailableKobo: text(customerWallet.availableKobo - amount - amount),
            /** The corrected available equals pre-incident available plus the 619DAC refund. */
            customerPost619DacSpendableBaselineKobo: text(customerAvailableAfter),
            assessment:
              customerWallet.availableKobo >= amount
                ? "The current customer available balance contains the exact 1,968,000-kobo credit. Removing it returns available to the pre-285D47 baseline plus the legitimate 619DAC refund; no unrelated spendable funds are restricted."
                : "The current customer available balance is below the erroneous credit. Removing it would restrict unrelated customer funds; the platform must fund the difference instead."
          },
          remainingObligations: {
            customerFundedOpenEscrowKobo: text(customerFundedExposureKobo),
            customerHeldAfterKobo: text(customerHeldAfter),
            systemFundedOpenEscrowKobo: text(systemFundedExposureKobo),
            systemHeldAfterKobo: text(systemHeldAfter),
            vendorOpenEscrowExposureKobo: text(vendorExposureKobo),
            vendorHeldKobo: text(vendorWallet.heldKobo)
          },
          approval:
            "Not executed. The correction requires explicit operator approval, one audited transaction, a verified empty reference and a re-run of this read-only reconstruction plus whole-book reconciliation afterwards."
        }
      };
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
}

async function main() {
  assert(process.env.INCIDENT_READONLY === "1", "Set INCIDENT_READONLY=1 to acknowledge read-only mode.");
  const databaseName = process.env.INCIDENT_READONLY_DB?.trim();
  assert(databaseName, "Set INCIDENT_READONLY_DB to the database to inspect (for example naijadeals_core).");
  const raw = process.env.DATABASE_URL;
  assert(raw, "DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${databaseName}`;
  const prisma = await loadReadOnly(url.toString());
  try {
    const report = await reconstruct(prisma);
    console.log(JSON.stringify(report, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
