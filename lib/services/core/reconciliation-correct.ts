import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { loadRefundLifecycles, type RefundLifecycleState } from "@/lib/payments/refund-lifecycle";

/**
 * Reconciliation for the NaijaPay books.
 *
 * ## One interpretation, two balances
 *
 * A wallet stores two balances that reconcile against different slices of the
 * same journal. This module owns the interpretation; `scripts/wallet-reconcile.ts`
 * imports the same helpers so the Control Center and the acceptance checker can
 * never drift apart.
 *
 *  - `availableKobo` is the spendable position: the wallet's full journal net,
 *    less any open hold credit the wallet received as an escrow counterparty.
 *  - `heldKobo` is the open escrow reservation: buyer-side holds plus escrow the
 *    wallet holds on behalf of a counterparty.
 *
 *        availableKobo == ledgerNet - open counterparty hold credits
 *        heldKobo       == open buyer holds + open counterparty hold credits
 *
 * Open holds are read from the records that own them, never guessed from
 * transaction names:
 *
 *  - `Ride` rows with `paymentMethod = wallet` and `paymentStatus = held`:
 *    the rider wallet is the buyer, the SYSTEM wallet is the counterparty.
 *  - `EscrowHold` rows in a status that still holds funds: the buyer wallet is
 *    the buyer, the vendor wallet is the counterparty. Only a *completed* refund
 *    has returned money to the buyer, so the exposure is
 *    `amountKobo - settled refunds`, clamped at zero. An external claim that is
 *    only reserved or submitted has not moved money; subtracting it here would
 *    report a phantom wallet difference and hide the real obligation. Pending
 *    claims are reported separately by `loadRefundReconciliation`. A full refund
 *    moves the hold to `refunded`, which is not an open status.
 *
 * The lifecycle this reproduces (verified against the posting services):
 *
 *  | phase                        | buyer available | buyer held | counterparty available | counterparty held |
 *  |------------------------------|-----------------|------------|------------------------|-------------------|
 *  | wallet funding               | +amount         | 0          | -amount                | 0                 |
 *  | ride hold / shop escrow hold | -amount         | +amount    | 0                      | +amount           |
 *  | ride cancel                  | +refund         | -fare      | +fee                   | -fare             |
 *  | ride completed               | 0               | -fare      | 0 (debit leg)          | -fare             |
 *  | shop escrow released         | 0               | -amount    | 0                      | -amount           |
 *  | partial refund, hold open    | +refund         | -refund    | 0                      | -refund           |
 *  | full refund                  | +remaining      | -remaining | 0                      | -remaining        |
 *  | partner settlement/recovery  | no hold impact  | no hold impact | no hold impact    | no hold impact    |
 *
 * Comparing `availableKobo + heldKobo` against the full journal net — which the
 * earlier report did — reports every wallet holding an open escrow as broken.
 * That is exactly what produced the two "customer exceptions" in the previous
 * note. They were not exceptions: their `heldKobo` equalled their open escrows
 * to the kobo, and their `availableKobo` reconciled exactly.
 *
 * Any held balance with no attributable open record is reported rather than
 * ignored: a wallet holding an unexplained amount is a reconciliation exception.
 *
 * ## The equity book
 *
 * Money recognised from outside the customer pool (test funding, opening equity)
 * books its counterparty in `LedgerAccount`/`AccountPosting`, keyed to the
 * transaction by `transactionId` with no relation in the schema. Joining the two
 * books closes the journal difference exactly. See docs/naijapay-ledger-forensics.md.
 */

export type IssueSeverity = "broken" | "unexplained" | "info";

export type IssueClass =
  | "wallet_available_delta"
  | "wallet_held_delta"
  | "hold_attribution"
  | "journal_unbalanced"
  | "account_drift"
  | "documentation_posted_as_money"
  | "refund_pending_obligation"
  | "refund_uncertain_outcome"
  | "refund_confirmed_unsettled"
  | "refund_reservation_mismatch"
  | "refund_state_conflict"
  | "refund_stale_reservation"
  | "refund_legacy_unclassified";

export type ReconciliationIssue = {
  severity: IssueSeverity;
  kind: IssueClass;
  subject: string;
  /** Signed difference that gives rise to this issue. */
  deltaKobo: string;
  detail: string;
  evidence: string[];
  /** True only where the rows themselves establish test provenance. */
  fixtureProvenance: boolean;
  /** True where the two books together still sum to zero. */
  balancedAcrossBooks?: boolean;
  remediation: string;
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Diagnostic formatter only. The books are currently Nigeria-only: every open
 * escrow, ride hold and wallet is NGN with two minor-unit decimals. Do not use
 * this for a multi-currency report; see
 * docs/incidents/2026-11-12-escrow-reconstruction.md § "Africa-wide financial
 * scoping" for the required currency/entity split.
 */
const NGN = (kobo: bigint) =>
  "NGN " + (Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * `$queryRaw` returns a NUMERIC aggregate as a Decimal object, never a bigint.
 * Casting to text in SQL and converting here keeps every comparison on one type;
 * comparing a Decimal to BigInt(0) is silently false and hides defects.
 */
const toBigInt = (value: unknown): bigint => BigInt(String(value ?? 0));

/**
 * Escrow statuses that still represent money the buyer has not received back and
 * the seller cannot spend. `released` and `refunded` are terminal.
 */
export const OPEN_ESCROW_STATUSES = [
  "pending",
  "held",
  "release_eligible",
  "refund_requested",
  "disputed",
  "reserved"
] as const;

export type OpenHold = {
  kind: "ride" | "escrow";
  id: string;
  reference: string;
  amountKobo: bigint;
  buyerWalletId: string | null;
  counterpartyWalletId: string | null;
  detail: string;
};

export type UnattributedHold = OpenHold & { reason: string };

/**
 * An open escrow whose recorded buyer of record is not the wallet that funded
 * its hold journal. This is the legacy shape behind ND-20261109-285D47: the
 * refund path trusted `EscrowHold.buyerWalletId` and debited a customer pool
 * that never funded the escrow. Reconciliation attributes the exposure to the
 * wallet that actually funded it and reports the mismatch; it never silently
 * moves the difference to a different wallet.
 */
export type HoldFundingMismatch = {
  escrowId: string;
  orderId: string;
  orderNumber: string;
  recordedBuyerWalletId: string;
  fundingWalletId: string;
  amountKobo: bigint;
  detail: string;
};

export type OpenHoldLedger = {
  holds: OpenHold[];
  unattributed: UnattributedHold[];
  fundingMismatches: HoldFundingMismatch[];
  buyerHeld: Map<string, bigint>;
  counterpartyHeld: Map<string, bigint>;
};

const addTo = (map: Map<string, bigint>, walletId: string | null | undefined, amount: bigint) => {
  if (!walletId || amount === BigInt(0)) return;
  map.set(walletId, (map.get(walletId) ?? BigInt(0)) + amount);
};

/**
 * Read every open reservation from its owning record.
 *
 * Holds whose buyer wallet cannot be resolved (deleted wallet, missing rider
 * wallet) are returned as `unattributed` instead of being dropped, so the caller
 * can report REVIEW rather than CLEAN.
 */
export async function loadOpenHoldLedger(db: Db): Promise<OpenHoldLedger> {
  const [openRides, openEscrows, customerWallets] = await Promise.all([
    db.ride.findMany({
      where: { paymentMethod: "wallet", paymentStatus: "held" },
      select: { id: true, rideNumber: true, riderId: true, fareKobo: true }
    }),
    db.escrowHold.findMany({
      where: { status: { in: [...OPEN_ESCROW_STATUSES] } },
      select: {
        id: true,
        orderId: true,
        buyerWalletId: true,
        vendorWalletId: true,
        amountKobo: true,
        status: true,
        order: { select: { orderNumber: true, refundedKobo: true, totalKobo: true } }
      }
    }),
    db.wallet.findMany({
      where: { ownerType: "CUSTOMER", userId: { not: null } },
      select: { id: true, userId: true }
    })
  ]);

  // Only settled refunds have left the escrow. Reserved/submitted/unknown
  // claims are obligations, not movements, and must not shrink the exposure.
  // `Order.refundedKobo` is a claim cap, so the detail line separates live
  // pending claims from a cap whose claim row is missing (a lost reservation).
  const refundRowsByStatus = openEscrows.length
    ? await db.refund.groupBy({
        by: ["orderId", "status"],
        where: {
          orderId: { in: openEscrows.map((escrow) => escrow.orderId) },
          status: { in: ["PENDING", "COMPLETED"] }
        },
        _sum: { amountKobo: true }
      })
    : [];
  const settledRefundByOrder = new Map<string, bigint>();
  const pendingRefundByOrder = new Map<string, bigint>();
  for (const row of refundRowsByStatus) {
    const target = row.status === "COMPLETED" ? settledRefundByOrder : pendingRefundByOrder;
    target.set(row.orderId, row._sum.amountKobo ?? BigInt(0));
  }

  const customerWalletByUser = new Map(customerWallets.map((wallet) => [wallet.userId as string, wallet.id]));
  const systemWallet = await db.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });

  // The hold journal is the authoritative funding record. Legacy external
  // escrows recorded the customer in `buyerWalletId` while the hold journal
  // debited SYSTEM; attributing the exposure to the recorded buyer would hide
  // the real shortfall inside a much larger false difference.
  const holdTransactions = openEscrows.length
    ? await db.walletTransaction.findMany({
        where: { orderId: { in: openEscrows.map((escrow) => escrow.orderId) }, type: "hold" },
        select: { orderId: true, walletId: true, amountKobo: true },
        orderBy: { createdAt: "asc" }
      })
    : [];
  const holdByOrder = new Map<string, Array<{ walletId: string; amountKobo: bigint }>>();
  for (const transaction of holdTransactions) {
    if (!transaction.orderId) continue;
    const list = holdByOrder.get(transaction.orderId) ?? [];
    list.push({ walletId: transaction.walletId, amountKobo: transaction.amountKobo });
    holdByOrder.set(transaction.orderId, list);
  }

  const holds: OpenHold[] = [];
  const unattributed: UnattributedHold[] = [];
  const fundingMismatches: HoldFundingMismatch[] = [];
  const buyerHeld = new Map<string, bigint>();
  const counterpartyHeld = new Map<string, bigint>();

  for (const ride of openRides) {
    const buyerWalletId = customerWalletByUser.get(ride.riderId) ?? null;
    const hold: OpenHold = {
      kind: "ride",
      id: ride.id,
      reference: `RIDE-${ride.id}-HOLD`,
      amountKobo: ride.fareKobo,
      buyerWalletId,
      counterpartyWalletId: systemWallet?.id ?? null,
      detail: `${ride.rideNumber} fare hold`
    };
    if (!buyerWalletId) {
      unattributed.push({ ...hold, reason: "rider has no CUSTOMER wallet" });
      continue;
    }
    if (!systemWallet) {
      unattributed.push({ ...hold, reason: "no SYSTEM wallet for the counterparty" });
      continue;
    }
    holds.push(hold);
    addTo(buyerHeld, buyerWalletId, ride.fareKobo);
    addTo(counterpartyHeld, systemWallet.id, ride.fareKobo);
  }

  for (const escrow of openEscrows) {
    const settled = settledRefundByOrder.get(escrow.orderId) ?? BigInt(0);
    const pending = pendingRefundByOrder.get(escrow.orderId) ?? BigInt(0);
    const claimed = escrow.order?.refundedKobo ?? BigInt(0);
    const exposure = escrow.amountKobo > settled ? escrow.amountKobo - settled : BigInt(0);
    const unclaimedReservation = claimed > settled + pending ? claimed - settled - pending : BigInt(0);
    const fundingRows = holdByOrder.get(escrow.orderId) ?? [];
    const funding = fundingRows.length === 1 ? fundingRows[0] : null;
    const baseDetail =
      `${escrow.order?.orderNumber ?? escrow.orderId} escrow ${escrow.status}, ` +
      `${escrow.amountKobo.toString()} held less ${settled.toString()} settled refund(s)` +
      (pending > BigInt(0) ? `, ${pending.toString()} reserved by a pending claim` : "") +
      (unclaimedReservation > BigInt(0)
        ? `, ${unclaimedReservation.toString()} claimed with no live refund row`
        : "");

    if (fundingRows.length > 1) {
      unattributed.push({
        kind: "escrow",
        id: escrow.id,
        reference: `ESCROW-HOLD-${escrow.orderId}`,
        amountKobo: exposure,
        buyerWalletId: escrow.buyerWalletId,
        counterpartyWalletId: escrow.vendorWalletId,
        detail: baseDetail,
        reason: "more than one hold journal"
      });
      continue;
    }
    if (funding && funding.amountKobo !== escrow.amountKobo) {
      unattributed.push({
        kind: "escrow",
        id: escrow.id,
        reference: `ESCROW-HOLD-${escrow.orderId}`,
        amountKobo: exposure,
        buyerWalletId: escrow.buyerWalletId,
        counterpartyWalletId: escrow.vendorWalletId,
        detail: baseDetail,
        reason: "hold journal amount differs from the escrow amount"
      });
      continue;
    }

    const buyerWalletId = funding ? funding.walletId : escrow.buyerWalletId;
    if (funding && funding.walletId !== escrow.buyerWalletId) {
      fundingMismatches.push({
        escrowId: escrow.id,
        orderId: escrow.orderId,
        orderNumber: escrow.order?.orderNumber ?? escrow.orderId,
        recordedBuyerWalletId: escrow.buyerWalletId,
        fundingWalletId: funding.walletId,
        amountKobo: exposure,
        detail:
          `${baseDetail}; recorded buyer of record ${escrow.buyerWalletId} but the hold journal ` +
          `debited ${funding.walletId}`
      });
    }
    const detailSuffix =
      funding && funding.walletId !== escrow.buyerWalletId
        ? `, exposure attributed to funding wallet ${funding.walletId}`
        : "";
    holds.push({
      kind: "escrow",
      id: escrow.id,
      reference: `ESCROW-HOLD-${escrow.orderId}`,
      amountKobo: exposure,
      buyerWalletId,
      counterpartyWalletId: escrow.vendorWalletId,
      detail: `${baseDetail}${detailSuffix}`
    });
    addTo(buyerHeld, buyerWalletId, exposure);
    addTo(counterpartyHeld, escrow.vendorWalletId, exposure);
  }

  return { holds, unattributed, fundingMismatches, buyerHeld, counterpartyHeld };
}

export function expectedPosition(ledgerNet: bigint, holds: OpenHoldLedger, walletId: string) {
  const buyer = holds.buyerHeld.get(walletId) ?? BigInt(0);
  const counterparty = holds.counterpartyHeld.get(walletId) ?? BigInt(0);
  return {
    availableKobo: ledgerNet - counterparty,
    heldKobo: buyer + counterparty,
    openBuyerHeldKobo: buyer,
    openCounterpartyHeldKobo: counterparty
  };
}

export type WalletProjection = {
  walletId: string;
  ledgerNetKobo: bigint;
  expectedAvailableKobo: bigint;
  expectedHeldKobo: bigint;
  availableDifferenceKobo: bigint;
  heldDifferenceKobo: bigint;
  openBuyerHeldKobo: bigint;
  openCounterpartyHeldKobo: bigint;
};

export function compareWalletProjection(input: {
  walletId: string;
  availableKobo: bigint;
  heldKobo: bigint;
  ledgerNetKobo: bigint;
  holds: OpenHoldLedger;
}): WalletProjection {
  const expected = expectedPosition(input.ledgerNetKobo, input.holds, input.walletId);
  return {
    walletId: input.walletId,
    ledgerNetKobo: input.ledgerNetKobo,
    expectedAvailableKobo: expected.availableKobo,
    expectedHeldKobo: expected.heldKobo,
    availableDifferenceKobo: input.availableKobo - expected.availableKobo,
    heldDifferenceKobo: input.heldKobo - expected.heldKobo,
    openBuyerHeldKobo: expected.openBuyerHeldKobo,
    openCounterpartyHeldKobo: expected.openCounterpartyHeldKobo
  };
}

/**
 * Whole-book totals. This is valid while every wallet is NGN: a single
 * currency's debits and credits must balance. It is NOT a multi-currency
 * check — across currencies a deficit in one would mask a surplus in another.
 * A multi-currency implementation must group by currency (and legal entity) and
 * require each group to balance independently.
 */
export async function journalTotals() {
  const rows = await prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amountKobo: true }, _count: { _all: true } });
  const credit = rows.find((r) => r.direction === "CREDIT")?._sum.amountKobo ?? BigInt(0);
  const debit = rows.find((r) => r.direction === "DEBIT")?._sum.amountKobo ?? BigInt(0);
  return {
    creditKobo: credit.toString(),
    debitKobo: debit.toString(),
    differenceKobo: (credit - debit).toString(),
    entryCount: rows.reduce((sum, r) => sum + r._count._all, 0)
  };
}

/**
 * Classify every refund attempt that could still affect the books.
 *
 * A pending refund is not automatically a discrepancy, and it is definitely not
 * automatically clean:
 *
 *  - reserved (or a provider-acknowledged submitted) is a correctly accounted
 *    obligation: the amount is capped on the order, nothing has moved, and a
 *    release must wait. It still means the books are not CLEAN.
 *  - submitted without acknowledgement, and explicit unknown, are uncertain
 *    provider outcomes. The provider may or may not have processed the refund;
 *    only a provider reconciliation or an operator decision may resolve them.
 *  - confirmed but still PENDING locally, or a failed lifecycle under a pending
 *    row, or a COMPLETED/FAILED row contradicted by its lifecycle, is a genuine
 *    discrepancy.
 *
 * A reservation that has sat untouched beyond the configured window is called
 * out as stale so an abandoned attempt cannot look like normal work in flight.
 */
export type RefundReconciliationClass =
  | "pending_obligation"
  | "stale_reservation"
  | "uncertain_outcome"
  | "confirmed_not_settled"
  | "failed_but_reserved"
  | "legacy_unclassified"
  | "state_conflict";

export type RefundReconciliationRow = {
  refundId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  amountKobo: bigint;
  refundStatus: string;
  lifecycleState: RefundLifecycleState | null;
  acknowledged: boolean;
  providerReference: string | null;
  classification: RefundReconciliationClass;
  severity: IssueSeverity;
  ageSeconds: number;
  detail: string;
};

export type RefundReservationMismatch = {
  orderId: string;
  orderNumber: string;
  reservedKobo: bigint;
  expectedKobo: bigint;
  completedKobo: bigint;
  totalKobo: bigint;
};

export type RefundReconciliation = {
  rows: RefundReconciliationRow[];
  pendingObligationCount: number;
  uncertainCount: number;
  discrepancyCount: number;
  staleReservationCount: number;
  legacyCount: number;
  reservationMismatches: RefundReservationMismatch[];
  status: "CLEAN" | "PENDING" | "REVIEW";
};

export async function loadRefundReconciliation(db: Db, now = new Date()): Promise<RefundReconciliation> {
  const staleMs = Number(process.env.REFUND_RESERVATION_STALE_MS ?? 15 * 60 * 1000) || 15 * 60 * 1000;

  const lifecycleEntityRows = await db.systemEvent.findMany({
    where: { type: "refund.lifecycle", entity: "Refund", entityId: { not: null } },
    select: { entityId: true }
  });
  const lifecycleIds = [
    ...new Set(
      lifecycleEntityRows
        .map((row) => row.entityId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  ];

  const refundInclude = {
    order: { select: { orderNumber: true, refundedKobo: true, totalKobo: true } },
    payment: { select: { provider: true } }
  } as const;

  const pendingRefunds = await db.refund.findMany({
    where: { status: "PENDING" },
    include: refundInclude
  });
  const pendingIds = new Set(pendingRefunds.map((refund) => refund.id));
  const extraIds = lifecycleIds.filter((id) => !pendingIds.has(id));
  const extraRefunds = extraIds.length
    ? await db.refund.findMany({ where: { id: { in: extraIds } }, include: refundInclude })
    : [];
  const refunds = [...pendingRefunds, ...extraRefunds];
  const lifecycles = await loadRefundLifecycles(
    db,
    refunds.map((refund) => refund.id)
  );

  const rows: RefundReconciliationRow[] = [];
  for (const refund of refunds) {
    const lifecycle = lifecycles.get(refund.id) ?? null;
    const ageSeconds = Math.max(0, Math.round((now.getTime() - refund.createdAt.getTime()) / 1000));
    let classification: RefundReconciliationClass;
    let severity: IssueSeverity;
    let detail: string;

    if (refund.status === "COMPLETED") {
      if (!lifecycle || lifecycle.state === "confirmed") continue;
      classification = "state_conflict";
      severity = "broken";
      detail = `Refund ${refund.id} is COMPLETED but the recorded lifecycle state is ${lifecycle.state}.`;
    } else if (refund.status === "FAILED") {
      if (!lifecycle || lifecycle.state === "failed") continue;
      classification = "state_conflict";
      severity = "broken";
      detail = `Refund ${refund.id} is FAILED but the recorded lifecycle state is ${lifecycle.state}.`;
    } else if (!lifecycle || !lifecycle.state) {
      classification = "legacy_unclassified";
      severity = "unexplained";
      detail =
        `Refund ${refund.id} is pending with no lifecycle record. Its provider state cannot be established ` +
        "from the books; do not resubmit it.";
    } else if (lifecycle.state === "confirmed") {
      classification = "confirmed_not_settled";
      severity = "broken";
      detail =
        `Refund ${refund.id} was confirmed by the provider but its local settlement is still missing. ` +
        "The money is out of step until it is settled.";
    } else if (lifecycle.state === "failed") {
      classification = "failed_but_reserved";
      severity = "broken";
      detail = `Refund ${refund.id} is still PENDING while its lifecycle says failed. Its reservation must be released.`;
    } else if (lifecycle.state === "unknown") {
      classification = "uncertain_outcome";
      severity = "unexplained";
      detail =
        `Refund ${refund.id} has an unknown provider outcome. The provider may have processed it; ` +
        "reconcile with the provider before any retry.";
    } else if (lifecycle.state === "submitted") {
      if (!lifecycle.acknowledged) {
        classification = "uncertain_outcome";
        severity = "unexplained";
        detail =
          `Refund ${refund.id} was submitted but the provider never acknowledged the request. ` +
          "The outcome is unknown; do not resubmit it.";
      } else {
        classification = "pending_obligation";
        severity = "info";
        detail =
          `Refund ${refund.id} is acknowledged by the provider as pending. ` +
          "The amount is correctly reserved and must not be released yet.";
      }
    } else if (ageSeconds * 1000 > staleMs) {
      classification = "stale_reservation";
      severity = "unexplained";
      detail =
        `Refund ${refund.id} has been reserved for ${ageSeconds}s without a provider submission. ` +
        "It is safe to resume, but the abandoned attempt needs review.";
    } else {
      classification = "pending_obligation";
      severity = "info";
      detail =
        `Refund ${refund.id} is reserved and not yet submitted. ` +
        "The amount is correctly capped and no money has moved.";
    }

    rows.push({
      refundId: refund.id,
      orderId: refund.orderId,
      orderNumber: refund.order?.orderNumber ?? refund.orderId,
      provider: refund.payment.provider,
      amountKobo: refund.amountKobo,
      refundStatus: refund.status,
      lifecycleState: lifecycle?.state ?? null,
      acknowledged: lifecycle?.acknowledged ?? false,
      providerReference: lifecycle?.providerReference ?? refund.providerReference ?? null,
      classification,
      severity,
      ageSeconds,
      detail
    });
  }

  // The order-level reservation (`refundedKobo`) must equal every claim that
  // has not failed: pending claims are capped but not settled, completed claims
  // have settled. A mismatch means a claim was reverted without its row, or a
  // settlement posted without its claim.
  const orders = await db.order.findMany({
    where: { OR: [{ refundedKobo: { gt: 0 } }, { refunds: { some: {} } }] },
    select: {
      id: true,
      orderNumber: true,
      refundedKobo: true,
      totalKobo: true,
      refunds: { select: { amountKobo: true, status: true } }
    }
  });
  const reservationMismatches: RefundReservationMismatch[] = [];
  for (const order of orders) {
    let expectedKobo = BigInt(0);
    let completedKobo = BigInt(0);
    for (const refund of order.refunds) {
      if (refund.status !== "FAILED") expectedKobo += refund.amountKobo;
      if (refund.status === "COMPLETED") completedKobo += refund.amountKobo;
    }
    if (
      expectedKobo !== order.refundedKobo ||
      completedKobo > order.totalKobo ||
      order.refundedKobo > order.totalKobo
    ) {
      reservationMismatches.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reservedKobo: order.refundedKobo,
        expectedKobo,
        completedKobo,
        totalKobo: order.totalKobo
      });
    }
  }

  const pendingObligationCount = rows.filter((row) => row.classification === "pending_obligation").length;
  const uncertainCount = rows.filter((row) => row.classification === "uncertain_outcome").length;
  const staleReservationCount = rows.filter((row) => row.classification === "stale_reservation").length;
  const legacyCount = rows.filter((row) => row.classification === "legacy_unclassified").length;
  const discrepancyCount =
    rows.filter(
      (row) =>
        row.classification === "confirmed_not_settled" ||
        row.classification === "failed_but_reserved" ||
        row.classification === "state_conflict"
    ).length + reservationMismatches.length;

  const status: RefundReconciliation["status"] =
    discrepancyCount > 0 || uncertainCount > 0 || staleReservationCount > 0 || legacyCount > 0
      ? "REVIEW"
      : pendingObligationCount > 0
        ? "PENDING"
        : "CLEAN";

  return {
    rows,
    pendingObligationCount,
    uncertainCount,
    discrepancyCount,
    staleReservationCount,
    legacyCount,
    reservationMismatches,
    status
  };
}

export async function reconcile(): Promise<{
  totals: Awaited<ReturnType<typeof journalTotals>>;
  issues: ReconciliationIssue[];
  refunds: RefundReconciliation;
  status: "CLEAN" | "PENDING" | "REVIEW";
}> {
  const issues: ReconciliationIssue[] = [];

  // ---- journal integrity: entries that do not sum to zero ------------------
  const unbalanced = await prisma.$queryRaw<Array<{ id: string; reference: string; net: string; entries: number }>>`
    SELECT t.id, t.reference,
      SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END)::text AS net,
      COUNT(l.id)::int AS entries
    FROM "WalletTransaction" t
    JOIN "LedgerEntry" l ON l."transactionId" = t.id
    GROUP BY t.id, t.reference, t."createdAt"
    HAVING SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0
    ORDER BY t."createdAt"`;

  const postings = await prisma.accountPosting.findMany({ include: { account: { select: { code: true } } } });
  const postingsByTransaction = new Map<string, typeof postings>();
  for (const posting of postings) {
    const list = postingsByTransaction.get(posting.transactionId) ?? [];
    list.push(posting);
    postingsByTransaction.set(posting.transactionId, list);
  }

  for (const raw of unbalanced) {
    const walletNet = toBigInt(raw.net);
    const entries = await prisma.ledgerEntry.findMany({
      where: { transactionId: raw.id },
      include: { wallet: { select: { ownerType: true, user: { select: { email: true } }, vendor: { select: { name: true } } } } }
    });
    const linked = postingsByTransaction.get(raw.id) ?? [];
    const equityNet = linked.reduce((sum, p) => sum + (p.direction === "CREDIT" ? p.amountKobo : -p.amountKobo), BigInt(0));
    const combined = walletNet + equityNet;
    const documentation = entries.some((e) => /not applied/i.test(e.memo));

    issues.push({
      severity: combined === BigInt(0) ? "info" : "broken",
      kind: combined === BigInt(0) ? "documentation_posted_as_money" : "journal_unbalanced",
      subject: raw.reference,
      deltaKobo: walletNet.toString(),
      detail:
        combined === BigInt(0)
          ? `The wallet journal line does not balance (${NGN(walletNet)}), but the equity book carries the equal and opposite ${NGN(equityNet)} on the same transaction, so both books together sum to zero.`
          : `The wallet journal does not balance (${NGN(walletNet)}); the equity book adds ${NGN(equityNet)}, leaving ${NGN(combined)} unaccounted in both books.`,
      evidence: [
        `${raw.entries} wallet entries, net ${NGN(walletNet)}`,
        `${linked.length} equity postings, net ${NGN(equityNet)}`,
        ...entries.map((e) => `${e.direction} ${NGN(e.amountKobo)} ${e.wallet.user?.email ?? e.wallet.vendor?.name ?? e.wallet.ownerType} — ${e.memo}`),
        ...linked.map((p) => `${p.account.code} ${p.direction} ${NGN(p.amountKobo)}`)
      ],
      fixtureProvenance: documentation || linked.some((p) => /fixture/i.test(p.account.code)),
      balancedAcrossBooks: combined === BigInt(0),
      remediation:
        combined === BigInt(0)
          ? "No money is missing. Replace the journal line with documentation so single-book reports are not misleading."
          : "An operator must establish the counterparty from original evidence; never invent an amount to close the gap."
    });
  }

  // ---- equity accounts must agree with their own postings ------------------
  for (const account of await prisma.ledgerAccount.findMany({ include: { postings: true } })) {
    const derived = account.postings.reduce((sum, p) => sum + (p.direction === "CREDIT" ? p.amountKobo : -p.amountKobo), BigInt(0));
    if (derived === account.balanceKobo) continue;
    issues.push({
      severity: "broken",
      kind: "account_drift",
      subject: account.code,
      deltaKobo: (account.balanceKobo - derived).toString(),
      detail: `Cached balance ${NGN(account.balanceKobo)} differs from the sum of its postings (${NGN(derived)}).`,
      evidence: account.postings.map((p) => `${p.direction} ${NGN(p.amountKobo)} — ${p.memo}`),
      fixtureProvenance: /fixture/i.test(account.code),
      remediation: "Postings are the source of truth; the cached projection may only be rebuilt from them."
    });
  }

  // ---- the invariant, per wallet -------------------------------------------
  const [journals, wallets, holds] = await Promise.all([
    prisma.ledgerEntry.findMany({
      select: { walletId: true, direction: true, amountKobo: true, transaction: { select: { reference: true, createdAt: true } } }
    }),
    prisma.wallet.findMany({
      select: {
        id: true,
        ownerType: true,
        availableKobo: true,
        heldKobo: true,
        user: { select: { email: true } },
        vendor: { select: { name: true } }
      }
    }),
    loadOpenHoldLedger(prisma)
  ]);

  const journalNet = new Map<string, bigint>();
  for (const entry of journals) {
    const signed = entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo;
    journalNet.set(entry.walletId, (journalNet.get(entry.walletId) ?? BigInt(0)) + signed);
  }

  // A hold with no resolvable buyer/counterparty is money the books cannot
  // attribute. It is reported explicitly instead of silently reducing expected held.
  for (const orphan of holds.unattributed) {
    const recent = journals
      .filter((entry) => entry.transaction.reference === orphan.reference)
      .map((entry) => `${entry.transaction.createdAt.toISOString()} ${entry.transaction.reference}`);
    issues.push({
      severity: "unexplained",
      kind: "hold_attribution",
      subject: orphan.id,
      deltaKobo: orphan.amountKobo.toString(),
      detail: `Open ${orphan.kind} ${orphan.reference} holds ${NGN(orphan.amountKobo)} but its ${orphan.reason}.`,
      evidence: [orphan.detail, ...recent],
      fixtureProvenance: false,
      remediation:
        "Restore or identify the owning wallet before release. Never move the held amount to an invented counterparty."
    });
  }

  // A legacy escrow whose recorded buyer is not its funding wallet is reported
  // explicitly. The exposure above is attributed to the wallet that actually
  // funded the hold, so the report shows the real shortfall instead of a larger
  // false difference on the recorded buyer.
  for (const mismatch of holds.fundingMismatches) {
    issues.push({
      severity: "unexplained",
      kind: "hold_attribution",
      subject: mismatch.escrowId,
      deltaKobo: mismatch.amountKobo.toString(),
      detail: `Open escrow ${mismatch.orderNumber} records buyer ${mismatch.recordedBuyerWalletId} but its hold journal funded ${mismatch.fundingWalletId}. Exposure is attributed to the funding wallet.`,
      evidence: [mismatch.detail],
      fixtureProvenance: false,
      remediation:
        "Correct the escrow buyer of record under operator approval. Until then a refund must be refused when the funding wallet and buyer of record differ; reconciliation attributes the hold to the actual funder."
    });
  }

  for (const wallet of wallets) {
    const ledgerNet = journalNet.get(wallet.id) ?? BigInt(0);
    const label = `${wallet.user?.email ?? wallet.vendor?.name ?? wallet.ownerType} (${wallet.id.slice(-8)})`;
    const testIdentity = wallet.user?.email?.endsWith(".local") === true || wallet.user?.email?.endsWith(".demo") === true;
    const recent = journals
      .filter((e) => e.walletId === wallet.id)
      .sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime())
      .slice(0, 6)
      .map((e) => `${e.transaction.createdAt.toISOString()} ${e.transaction.reference}`);
    const projection = compareWalletProjection({
      walletId: wallet.id,
      availableKobo: wallet.availableKobo,
      heldKobo: wallet.heldKobo,
      ledgerNetKobo: ledgerNet,
      holds
    });

    if (projection.availableDifferenceKobo !== BigInt(0)) {
      issues.push({
        severity: "broken",
        kind: "wallet_available_delta",
        subject: wallet.id,
        deltaKobo: projection.availableDifferenceKobo.toString(),
        detail: `availableKobo ${NGN(wallet.availableKobo)} differs from the expected ${NGN(projection.expectedAvailableKobo)} (ledger net ${NGN(ledgerNet)} less ${NGN(projection.openCounterpartyHeldKobo)} counterparty hold credit) by ${NGN(projection.availableDifferenceKobo)} (wallet ${label}).`,
        evidence: recent,
        fixtureProvenance: testIdentity,
        remediation: "Identify the posting that changed the stored balance without a matching journal entry, or vice versa. Requires an operator decision."
      });
    }

    if (projection.heldDifferenceKobo !== BigInt(0)) {
      issues.push({
        severity: "unexplained",
        kind: "wallet_held_delta",
        subject: wallet.id,
        deltaKobo: projection.heldDifferenceKobo.toString(),
        detail: `heldKobo ${NGN(wallet.heldKobo)} differs from the open reservations (${NGN(projection.expectedHeldKobo)}) by ${NGN(projection.heldDifferenceKobo)} (wallet ${label}).`,
        evidence: recent,
        fixtureProvenance: testIdentity,
        remediation:
          "Escrow holds and releases must move heldKobo and the journal together. A positive difference means held money has no open business record; reconcile per order/ride."
      });
    }
  }

  // ---- refund attempts and their reservations ------------------------------
  const refunds = await loadRefundReconciliation(prisma);
  const refundKind: Record<RefundReconciliationClass, IssueClass> = {
    pending_obligation: "refund_pending_obligation",
    stale_reservation: "refund_stale_reservation",
    uncertain_outcome: "refund_uncertain_outcome",
    confirmed_not_settled: "refund_confirmed_unsettled",
    failed_but_reserved: "refund_state_conflict",
    legacy_unclassified: "refund_legacy_unclassified",
    state_conflict: "refund_state_conflict"
  };
  const refundRemediation: Record<RefundReconciliationClass, string> = {
    pending_obligation:
      "No action is required while the provider processes the refund. Do not release this escrow until it settles.",
    stale_reservation:
      "Resume the stored idempotency key to submit the untouched reservation, or release it after verifying the provider was never called.",
    uncertain_outcome:
      "Verify the attempt in the provider dashboard. Record the provider's outcome explicitly; never resubmit an ambiguous refund.",
    confirmed_not_settled:
      "Settle the confirmed refund from local evidence. Never call the provider again for the same attempt.",
    failed_but_reserved:
      "The lifecycle says the refund failed but the claim is still pending. Release the reservation through the recovery path after establishing why.",
    legacy_unclassified:
      "This attempt predates lifecycle tracking. Establish its provider state outside this service before touching the reservation.",
    state_conflict:
      "The refund row and its lifecycle disagree. An operator must establish which record is wrong before any money moves."
  };
  for (const row of refunds.rows) {
    issues.push({
      severity: row.severity,
      kind: refundKind[row.classification],
      subject: row.refundId,
      deltaKobo: row.amountKobo.toString(),
      detail: `${row.detail} Order ${row.orderNumber}, provider ${row.provider}.`,
      evidence: [
        `refund status ${row.refundStatus}`,
        `lifecycle ${row.lifecycleState ?? "none"} acknowledged=${row.acknowledged}`,
        `provider reference ${row.providerReference ?? "none"}`,
        `age ${row.ageSeconds}s`
      ],
      fixtureProvenance: false,
      remediation: refundRemediation[row.classification]
    });
  }
  for (const mismatch of refunds.reservationMismatches) {
    issues.push({
      severity: "broken",
      kind: "refund_reservation_mismatch",
      subject: mismatch.orderId,
      deltaKobo: (mismatch.reservedKobo - mismatch.expectedKobo).toString(),
      detail:
        `Order ${mismatch.orderNumber} reserves ${NGN(mismatch.reservedKobo)} against refunds but its non-failed ` +
        `claims total ${NGN(mismatch.expectedKobo)} (completed ${NGN(mismatch.completedKobo)}, order total ${NGN(mismatch.totalKobo)}).`,
      evidence: ["Refund rows are the source of truth for the reservation; order.refundedKobo is a projection of them."],
      fixtureProvenance: false,
      remediation: "Do not adjust the order to match. Establish which refund row is wrong before moving money."
    });
  }

  const status: "CLEAN" | "PENDING" | "REVIEW" =
    issues.some((issue) => issue.severity === "broken" || issue.severity === "unexplained")
      ? "REVIEW"
      : refunds.status === "PENDING"
        ? "PENDING"
        : "CLEAN";

  return { totals: await journalTotals(), issues, refunds, status };
}

/**
 * There is no automatic correction, deliberately.
 *
 * The previous implementation was rejected during review for three independent
 * reasons, each of which would have written a false record:
 *
 *  1. It moved money wallet<->SYSTEM even where the equity book already carried
 *     the offset, double-counting a discrepancy that did not exist.
 *  2. It claimed a balanced posting would "restore total debits equal to total
 *     credits". It cannot: equal additions on both sides leave the difference
 *     unchanged. `differenceKobo` is invariant under any balanced posting.
 *  3. It collapsed a multi-entry correction into a single net and posted that
 *     against one wallet, discarding which account was actually wrong.
 *
 * Deciding which record is wrong, and who bears the difference, is an operator
 * judgement. It is not a safe default.
 */
export async function correctException(): Promise<never> {
  throw new ApiError(
    409,
    "manual_review_required",
    "Ledger corrections are not automatic. Statements document a decision; they never re-post money."
  );
}
