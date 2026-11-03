import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { applyLedgerAdjustment, reconcileAdjustmentJournals } from "../lib/services/core/ledger-adjustment.service";

const schema = "phase07_apply_test";
const base = process.env.DATABASE_URL ?? "";
const separator = base.includes("?") ? "&" : "?";
const url = base + separator + "schema=" + schema;
const db = new PrismaClient({ datasources: { db: { url } } });
const KEY = "PHASE07-ISOLATED-TEST";
const KEY2 = "PHASE07-ISOLATED-RETRY";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : "")); if (!ok) failed++; };

async function seedAdjustment(key: string, systemId: string, amount: bigint) {
  return db.ledgerAdjustment.create({
    data: {
      adjustmentKey: key,
      status: "PREPARED",
      preparedBy: "isolated-test",
      journal: { lines: [
        { walletId: systemId, entry: "CREDIT", amountKobo: amount.toString(), memo: "Opening equity recognition" },
        { account: "FIXTURE_EQUITY", entry: "DEBIT", amountKobo: amount.toString(), memo: "Fixture funding contra" }
      ], balanced: true },
      references: { test: true }
    }
  });
}

(async () => {
  try {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.ledgerAccount.create({ data: { code: "FIXTURE_EQUITY", name: "Fixture opening equity", kind: "EQUITY" } });
  const system = await db.wallet.create({ data: { ownerType: "SYSTEM", availableKobo: 0n, heldKobo: 0n } });
  const customer = await db.wallet.create({ data: { ownerType: "CUSTOMER", availableKobo: 2500000n, heldKobo: 0n } });
  const fixture = await db.walletTransaction.create({
    data: { walletId: customer.id, type: "credit", amountKobo: 2500000n, reference: "SEED-WALLET-FIXTURE-TEST", description: "Fixture funding", ledger: { create: [
      { walletId: customer.id, direction: "CREDIT", amountKobo: 2500000n, memo: "Fixture balance credited to customer" },
      { walletId: system.id, direction: "DEBIT", amountKobo: 2500000n, memo: "Fixture funding source" }
    ] } }
  });
  const adjustment = await seedAdjustment(KEY, system.id, 2500000n);

  const applied = await applyLedgerAdjustment(KEY, "isolated-test", db as never);
  check("adjustment applies", applied.status === "applied", JSON.stringify(applied));
  const systemAfter = await db.wallet.findUniqueOrThrow({ where: { id: system.id } });
  const customerAfter = await db.wallet.findUniqueOrThrow({ where: { id: customer.id } });
  const equity = await db.ledgerAccount.findUniqueOrThrow({ where: { code: "FIXTURE_EQUITY" } });
  const postings = await db.accountPosting.count({ where: { adjustmentId: adjustment.id } });
  const journals = await reconcileAdjustmentJournals(db as never);
  check("journal balances across LedgerEntry and AccountPosting", journals.issues.length === 0, JSON.stringify(journals.rows));
  check("SYSTEM ledger reconciles with stored", systemAfter.availableKobo === 0n, systemAfter.availableKobo.toString());
  check("customer balance untouched", customerAfter.availableKobo === 2500000n, customerAfter.availableKobo.toString());
  check("contra account holds -2.5m", equity.balanceKobo === -2500000n, equity.balanceKobo.toString());
  check("one contra posting", postings === 1, String(postings));

  const retry = await applyLedgerAdjustment(KEY, "isolated-test", db as never);
  const postingsAfterRetry = await db.accountPosting.count({ where: { adjustmentId: adjustment.id } });
  check("retry is idempotent", retry.status === "already_applied" && postingsAfterRetry === 1, JSON.stringify(retry));

  const concurrent = await Promise.all([applyLedgerAdjustment(KEY, "a", db as never), applyLedgerAdjustment(KEY, "b", db as never)]);
  check("concurrent application cannot duplicate", concurrent.every((r) => ["already_applied", "applied"].includes(r.status)), JSON.stringify(concurrent));

  const system2 = await db.wallet.create({ data: { ownerType: "SYSTEM", availableKobo: 0n, heldKobo: 0n } });
  await db.walletTransaction.create({ data: { walletId: system2.id, type: "debit", amountKobo: 2500000n, reference: "FIXTURE2-SOURCE", description: "second fixture source", ledger: { create: [{ walletId: system2.id, direction: "DEBIT", amountKobo: 2500000n, memo: "Fixture funding source 2" }] } } });
  const retryAdjustment = await seedAdjustment(KEY2, system2.id, 2500000n);
  await db.walletTransaction.create({ data: { walletId: system2.id, type: "credit", amountKobo: 1n, reference: "ADJ-" + KEY2, description: "blocker" } });
  let rollbackError = "";
  try { await applyLedgerAdjustment(KEY2, "isolated-test", db as never); } catch (error) { rollbackError = error instanceof Error ? error.message : "error"; }
  const afterFailure = await db.ledgerAdjustment.findUniqueOrThrow({ where: { id: retryAdjustment.id } });
  check("failed apply rolls back to PREPARED", rollbackError !== "" && afterFailure.status === "PREPARED", JSON.stringify({ rollbackError, status: afterFailure.status }));
  check("failed apply leaves no posting", (await db.accountPosting.count({ where: { adjustmentId: retryAdjustment.id } })) === 0);
  await db.walletTransaction.deleteMany({ where: { reference: "ADJ-" + KEY2 } });
  const recovered = await applyLedgerAdjustment(KEY2, "isolated-test", db as never);
  check("retry after rollback succeeds", recovered.status === "applied", JSON.stringify(recovered));

  const wallets = await db.wallet.findMany();
  const ledger = await db.ledgerEntry.findMany();
  const differences = wallets.filter((w) => {
    const net = ledger.filter((e) => e.walletId === w.id).reduce((sum, e) => sum + (e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo), 0n);
    return w.availableKobo + w.heldKobo !== net;
  });
  check("all wallets reconcile after correction", differences.length === 0, JSON.stringify(differences.map((w) => w.id)));
  console.log(JSON.stringify({
    wholeSystem: {
      originalTransaction: { id: fixture.id, reference: fixture.reference, debit: "2500000", credit: "2500000" },
      customer: { stored: customerAfter.availableKobo.toString(), ledger: "2500000" },
      system: { stored: systemAfter.availableKobo.toString(), ledgerBefore: "-2500000", adjustment: "2500000", ledgerAfter: "0" },
      fixtureEquity: { balance: equity.balanceKobo.toString(), postings }
    }
  }, null, 2));
} finally {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
  await db.$disconnect();
  }
})().then(() => {
  console.log("\nIsolated application: " + (failed === 0 ? "PASS" : failed + " failure(s)"));
  if (failed > 0) process.exit(1);
}).catch((error) => { console.error(error); process.exit(1); });
