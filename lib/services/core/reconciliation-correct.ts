import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * Reconciliation for the NaijaPay books.
 *
 * ## The invariant
 *
 * A wallet holds two balances that mean different things, and each reconciles
 * against its own slice of the journal:
 *
 *  - `availableKobo` — reconciles against the FULL journal net for the wallet.
 *    Held money still belongs to the wallet, so it is not removed from the
 *    wallet's position; it is only removed from what the wallet may spend.
 *  - `heldKobo` — reconciles against the magnitude of the wallet's net across
 *    escrow movements. A buyer is debited into escrow (negative), and the
 *    magnitude of that debit is what it has on hold.
 *
 *        availableKobo == journal net (all movements)
 *        heldKobo      == |journal net over escrow movements|
 *
 * Comparing `availableKobo + heldKobo` against the full journal net — which the
 * earlier report did — reports every wallet holding an open escrow as broken.
 * That is exactly what produced the two "customer exceptions" in the previous
 * note. They were not exceptions: their `heldKobo` equalled their open escrows
 * to the kobo, and their `availableKobo` reconciled exactly.
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

const NGN = (kobo: bigint) =>
  "NGN " + (Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * `$queryRaw` returns a NUMERIC aggregate as a Decimal object, never a bigint.
 * Casting to text in SQL and converting here keeps every comparison on one type;
 * comparing a Decimal to BigInt(0) is silently false and hides defects.
 */
const toBigInt = (value: unknown): bigint => BigInt(String(value ?? 0));

const isEscrowMovement = (reference: string) => /ESCROW-HOLD|RELEASE-/i.test(reference);

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
  const journals = await prisma.ledgerEntry.findMany({
    select: { walletId: true, direction: true, amountKobo: true, transaction: { select: { reference: true, createdAt: true } } }
  });
  const journalNet = new Map<string, bigint>();
  const escrowNetByWallet = new Map<string, bigint>();
  for (const entry of journals) {
    const signed = entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo;
    journalNet.set(entry.walletId, (journalNet.get(entry.walletId) ?? BigInt(0)) + signed);
    if (isEscrowMovement(entry.transaction.reference)) {
      escrowNetByWallet.set(entry.walletId, (escrowNetByWallet.get(entry.walletId) ?? BigInt(0)) + signed);
    }
  }

  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      ownerType: true,
      availableKobo: true,
      heldKobo: true,
      user: { select: { email: true } },
      vendor: { select: { name: true } }
    }
  });

  for (const wallet of wallets) {
    const expectedAvailable = journalNet.get(wallet.id) ?? BigInt(0);
    const escrowNet = escrowNetByWallet.get(wallet.id) ?? BigInt(0);
    const label = `${wallet.user?.email ?? wallet.vendor?.name ?? wallet.ownerType} (${wallet.id.slice(-8)})`;
    const testIdentity = wallet.user?.email?.endsWith(".local") === true || wallet.user?.email?.endsWith(".demo") === true;
    const recent = journals
      .filter((e) => e.walletId === wallet.id)
      .sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime())
      .slice(0, 6)
      .map((e) => `${e.transaction.createdAt.toISOString()} ${e.transaction.reference}`);

    const availableDelta = wallet.availableKobo - expectedAvailable;
    if (availableDelta !== BigInt(0)) {
      issues.push({
        severity: "broken",
        kind: "wallet_available_delta",
        subject: wallet.id,
        deltaKobo: availableDelta.toString(),
        detail: `availableKobo ${NGN(wallet.availableKobo)} differs from the journal net ${NGN(expectedAvailable)} by ${NGN(availableDelta)} (wallet ${label}).`,
        evidence: recent,
        fixtureProvenance: testIdentity,
        remediation: "Identify the posting that changed the stored balance without a matching journal entry, or vice versa. Requires an operator decision."
      });
    }

    // A buyer is debited into escrow, so its escrow net is negative and heldKobo
    // is that net's magnitude; a seller is credited, so its escrow net is the
    // payable itself and it holds no escrow of its own. Compare magnitudes.
    const escrowMagnitude = escrowNet < BigInt(0) ? -escrowNet : escrowNet;
    const heldDelta = wallet.heldKobo - escrowMagnitude;
    if (heldDelta !== BigInt(0)) {
      issues.push({
        severity: "unexplained",
        kind: "wallet_held_delta",
        subject: wallet.id,
        deltaKobo: heldDelta.toString(),
        detail: `heldKobo ${NGN(wallet.heldKobo)} differs from the escrow journal position ${NGN(escrowMagnitude)} by ${NGN(heldDelta)} (wallet ${label}).`,
        evidence: recent,
        fixtureProvenance: testIdentity,
        remediation: "Escrow holds and releases must move heldKobo and the journal together. Reconcile per order."
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
