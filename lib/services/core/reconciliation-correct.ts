import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

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
 *    the buyer, the vendor wallet is the counterparty. A partial refund against
 *    an open hold reduces the money actually held, so the exposure is
 *    `amountKobo - Order.refundedKobo` (clamped at zero). A full refund moves
 *    the hold to `refunded`, which is not an open status.
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
  | "documentation_posted_as_money";

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

export type OpenHoldLedger = {
  holds: OpenHold[];
  unattributed: UnattributedHold[];
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
        order: { select: { orderNumber: true, refundedKobo: true } }
      }
    }),
    db.wallet.findMany({
      where: { ownerType: "CUSTOMER", userId: { not: null } },
      select: { id: true, userId: true }
    })
  ]);

  const customerWalletByUser = new Map(customerWallets.map((wallet) => [wallet.userId as string, wallet.id]));
  const systemWallet = await db.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });

  const holds: OpenHold[] = [];
  const unattributed: UnattributedHold[] = [];
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
    const refunded = escrow.order?.refundedKobo ?? BigInt(0);
    const exposure = escrow.amountKobo > refunded ? escrow.amountKobo - refunded : BigInt(0);
    const hold: OpenHold = {
      kind: "escrow",
      id: escrow.id,
      reference: `ESCROW-HOLD-${escrow.orderId}`,
      amountKobo: exposure,
      buyerWalletId: escrow.buyerWalletId,
      counterpartyWalletId: escrow.vendorWalletId,
      detail: `${escrow.order?.orderNumber ?? escrow.orderId} escrow ${escrow.status}, ${escrow.amountKobo.toString()} held less ${refunded.toString()} refunded`
    };
    holds.push(hold);
    addTo(buyerHeld, escrow.buyerWalletId, exposure);
    addTo(counterpartyHeld, escrow.vendorWalletId, exposure);
  }

  return { holds, unattributed, buyerHeld, counterpartyHeld };
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

export async function reconcile(): Promise<{ totals: Awaited<ReturnType<typeof journalTotals>>; issues: ReconciliationIssue[] }> {
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

  return { totals: await journalTotals(), issues };
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
