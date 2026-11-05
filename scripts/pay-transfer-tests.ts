/**
 * NaijaPay P2P transfer financial-safety tests.
 *
 * Runs the transfer service directly against an ISOLATED test schema
 * (naijapay_transfer_test) on the local development database. Never touches
 * shared or production data. Covers: success, insufficient funds, idempotent
 * retries, concurrent overspend protection, balanced ledger postings,
 * self-transfer and amount validation.
 *
 * Usage: npx tsx scripts/pay-transfer-tests.ts
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { sendP2PTransfer } from "../lib/services/core/transfer.service";
import { assertLedgerBalanced } from "../lib/services/core/wallet.service";

const schema = "naijapay_transfer_test";
const base = process.env.DATABASE_URL ?? "";
const url = base + (base.includes("?") ? "&" : "?") + "schema=" + schema;
const db = new PrismaClient({ datasources: { db: { url } } });

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(name + (detail ? ` (${detail})` : ""));
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function walletOf(userId: string) {
  return db.wallet.findFirstOrThrow({ where: { userId } });
}

(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const passwordHash = await hashPassword("TransferTest123!");

  // Fresh fixture users + wallets each run. Wallet.userId is SetNull on user
  // deletion, so orphaned wallets, transactions and ledger entries from an
  // earlier run must be removed explicitly — otherwise the service's global
  // reference idempotency correctly short-circuits this run's transfers.
  const staleUsers = await db.user.findMany({ where: { email: { in: ["send-a@test.local", "send-b@test.local"] } }, select: { id: true } });
  const staleWalletIds = (await db.wallet.findMany({
    where: { OR: [{ userId: { in: staleUsers.map((u) => u.id) } }, { userId: null }] },
    select: { id: true }
  })).map((w) => w.id);
  if (staleWalletIds.length > 0) {
    await db.ledgerEntry.deleteMany({ where: { walletId: { in: staleWalletIds } } });
    await db.walletTransaction.deleteMany({ where: { walletId: { in: staleWalletIds } } });
    await db.wallet.deleteMany({ where: { id: { in: staleWalletIds } } });
  }
  await db.user.deleteMany({ where: { email: { in: ["send-a@test.local", "send-b@test.local"] } } });
  const [a, b] = await Promise.all([
    db.user.create({ data: { email: "send-a@test.local", name: "Sender A", phone: "08031000001", passwordHash } }),
    db.user.create({ data: { email: "send-b@test.local", name: "Receiver B", phone: "08031000002", passwordHash } })
  ]);
  await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: a.id, availableKobo: 100_000n, heldKobo: 0n } });
  await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: b.id, availableKobo: 0n, heldKobo: 0n } });

  console.log("1) successful transfer moves money atomically");
  const sent = await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "SEND-B@test.local", amountKobo: 30_000n, idempotencyKey: "testkey0001" });
  let wa = await walletOf(a.id);
  let wb = await walletOf(b.id);
  check("sender debited", wa.availableKobo === 70_000n, `got ${wa.availableKobo}`);
  check("receiver credited", wb.availableKobo === 30_000n, `got ${wb.availableKobo}`);
  check("not flagged duplicate", sent.duplicate === false);

  console.log("2) ledger stays balanced");
  check("journal balances", await assertLedgerBalanced(sent.transactionId));
  const entries = await db.ledgerEntry.findMany({ where: { transactionId: sent.transactionId } });
  check("two ledger lines", entries.length === 2, `got ${entries.length}`);
  const debit = entries.find((e) => e.direction === "DEBIT");
  const credit = entries.find((e) => e.direction === "CREDIT");
  check("debit on sender wallet", debit?.walletId === wa.id);
  check("credit on receiver wallet", credit?.walletId === wb.id);
  const allTx = await db.walletTransaction.findMany({ where: { reference: { startsWith: "P2P-" } }, include: { ledger: true } });
  check("every P2P journal balances", (await Promise.all(allTx.map((t) => assertLedgerBalanced(t.id)))).every(Boolean));

  console.log("3) idempotent retry does not double-send");
  const retry = await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "send-b@test.local", amountKobo: 30_000n, idempotencyKey: "testkey0001" });
  wa = await walletOf(a.id);
  wb = await walletOf(b.id);
  check("retry flagged duplicate", retry.duplicate === true);
  check("balances unchanged after retry", wa.availableKobo === 70_000n && wb.availableKobo === 30_000n, `a=${wa.availableKobo} b=${wb.availableKobo}`);
  const count = await db.walletTransaction.count({ where: { reference: "P2P-testkey0001" } });
  check("single ledger transaction", count === 1, `got ${count}`);

  console.log("4) insufficient funds rejected without side effects");
  try {
    await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "send-b@test.local", amountKobo: 999_999n, idempotencyKey: "testkey0002" });
    check("insufficient funds throws", false);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    check("insufficient funds throws", message.includes("too low"), message);
  }
  wa = await walletOf(a.id);
  check("sender balance untouched", wa.availableKobo === 70_000n, `got ${wa.availableKobo}`);

  console.log("5) concurrency: parallel sends cannot overspend");
  // Balance is exactly 70_000; four parallel sends of 25_000 must allow only two.
  const races = await Promise.allSettled(
    [1, 2, 3, 4].map((i) =>
      sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "send-b@test.local", amountKobo: 25_000n, idempotencyKey: `racekey000${i}` })
    )
  );
  const succeeded = races.filter((r) => r.status === "fulfilled").length;
  const rejected = races.filter((r) => r.status === "rejected").length;
  wa = await walletOf(a.id);
  wb = await walletOf(b.id);
  check("exactly two sends succeed", succeeded === 2, `succeeded=${succeeded}`);
  check("two sends rejected", rejected === 2, `rejected=${rejected}`);
  check("sender never negative", wa.availableKobo === 20_000n, `got ${wa.availableKobo}`);
  check("receiver got exactly 50_000", wb.availableKobo === 80_000n, `got ${wb.availableKobo}`);

  console.log("6) validation guards");
  try {
    await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "send-a@test.local", amountKobo: 100n, idempotencyKey: "selftest01" });
    check("self-transfer blocked", false);
  } catch (err) {
    check("self-transfer blocked", err instanceof Error && err.message.includes("yourself"));
  }
  try {
    await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "send-b@test.local", amountKobo: 1n, idempotencyKey: "mintest0001" });
    check("below-minimum blocked", false);
  } catch (err) {
    check("below-minimum blocked", err instanceof Error && err.message.includes("Minimum"));
  }
  try {
    await sendP2PTransfer(db, { senderUserId: a.id, recipientEmail: "nobody@test.local", amountKobo: 100n, idempotencyKey: "missing001" });
    check("unknown recipient blocked", false);
  } catch (err) {
    check("unknown recipient blocked", err instanceof Error && err.message.includes("No NaijaPay wallet"));
  }
  try {
    await sendP2PTransfer(db, { senderUserId: "nonexistent-user", recipientEmail: "send-b@test.local", amountKobo: 100n, idempotencyKey: "baduser0001" });
    check("foreign sender wallet blocked", false);
  } catch (err) {
    check("foreign sender wallet blocked", err instanceof Error);
  }

  console.log("7) totals reconcile across the run");
  const senderEntries = await db.ledgerEntry.findMany({ where: { walletId: (await walletOf(a.id)).id } });
  const senderDebits = senderEntries.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
  const receiverEntries = await db.ledgerEntry.findMany({ where: { walletId: (await walletOf(b.id)).id } });
  const receiverCredits = receiverEntries.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
  check("sender ledger debits equal wallet movement", senderDebits === 80_000n, `got ${senderDebits}`);
  check("receiver ledger credits equal wallet movement", receiverCredits === 80_000n, `got ${receiverCredits}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
