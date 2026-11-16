/**
 * Funds the approved tester02 staging account for wallet checkout acceptance.
 *
 * Payment verification level: LOCAL TEST TOP-UP -> WALLET CHECKOUT.
 *   - The only provider used is the existing local `test` top-up provider,
 *     which is allowed on a TEST-classified database when
 *     ENABLE_TEST_PAYMENTS=true. The flag is set in THIS process only, after
 *     the verified staging database is loaded; the running application's
 *     environment is not read or changed.
 *   - No Paystack/Flutterwave call, card detail, bank transfer, real charge or
 *     payout is involved.
 *
 * Safety and idempotency:
 *   - loads C:/NaijaDeals-Staging/env/staging.env before importing Prisma;
 *   - requires current_database() === naijadeals_staging and the canonical
 *     DatabaseClassification row to be TEST (shared test-db guard);
 *   - resolves tester02 and tester03 from the protected activation file without
 *     printing emails or passwords;
 *   - funds tester02 only, with one deterministic top-up key/reference, through
 *     createTopUp + creditTopUp (the balanced ledger path). Wallet balances are
 *     never edited directly;
 *   - re-running is idempotent: the second create returns the same row, the
 *     second credit returns `already_credited`, and balances do not move;
 *   - proves the journal has one DEBIT and one CREDIT leg of the exact amount,
 *     that tester02 gained and the platform funding wallet lost the same
 *     amount, and that the sum of all wallet positions is unchanged;
 *   - leaves tester03 unfunded for the genuine insufficient-balance case and
 *     reports (never creates) its wallet state.
 *
 * Usage (from the repository root):
 *   npx tsx scripts/staging/fund-shop-testers.ts
 *
 * The coordinator owns execution. No secret or connection string is printed.
 */
import { existsSync, readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { sanitizeDatabaseError, verifyTestDatabase } from "../lib/test-db-guard";

const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const ACTIVATION_FILE = "C:/NaijaDeals-Staging/secrets/tester-activation.json";
const EXPECTED_DATABASE = "naijadeals_staging";
const TOP_UP_AMOUNT_KOBO = 10_000_000n; // ₦100,000 of test money on the TEST database
const TOP_UP_CURRENCY = "NGN";

/** Deterministic funding version; changing it is an explicit new test-funding action. */
function readTopupVersion(): string {
  const value = (process.env.STAGING_SHOP_TOPUP_VERSION || "v1").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(value)) {
    throw new Error("STAGING_SHOP_TOPUP_VERSION must be 1-24 lowercase letters, digits or hyphens");
  }
  return value;
}

const REQUIRED_TABLES = [
  "Order",
  "Payment",
  "Refund",
  "Wallet",
  "WalletTopUp",
  "WalletTransaction",
  "LedgerEntry",
  "EscrowHold",
  "User",
  "Session",
  "Notification",
  "AuditLog",
  "SystemEvent"
];

type ActivationAccount = {
  email?: string;
  displayName?: string;
  roles?: string[];
  purpose?: string | string[];
  ownerTester?: string;
  password?: string;
};

type ResolvedTester = ActivationAccount & { email: string };
type Totals = { availableKobo: bigint; heldKobo: bigint; totalKobo: bigint; wallets: number };
type TotalsByCurrency = Record<string, Totals>;

function readStagingDatabaseUrl(): string {
  if (!existsSync(ENV_FILE)) throw new Error(`staging environment file is missing: ${ENV_FILE}`);
  const text = readFileSync(ENV_FILE, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    if (line.slice(0, index).trim() === "DATABASE_URL") {
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) throw new Error("staging DATABASE_URL is configured but empty");
      return value;
    }
  }
  throw new Error("staging DATABASE_URL is not configured");
}

function loadActivationAccounts(): ActivationAccount[] {
  if (!existsSync(ACTIVATION_FILE)) throw new Error("the protected tester activation file is missing");
  let parsed: { accounts?: unknown };
  try {
    parsed = JSON.parse(readFileSync(ACTIVATION_FILE, "utf8")) as { accounts?: unknown };
  } catch {
    // JSON.parse errors can quote the malformed input, which may include a
    // credential. Replace the message rather than printing it.
    throw new Error("the protected tester activation file is not valid JSON; repair it locally");
  }
  if (!Array.isArray(parsed.accounts)) throw new Error("the tester activation file has no accounts array");
  return parsed.accounts as ActivationAccount[];
}

/**
 * Resolve one approved primary tester by its documented label. Matching is
 * case-insensitive across the non-secret label fields only; the selected email
 * and password are never printed.
 */
function findPrimaryTester(accounts: ActivationAccount[], label: string): ResolvedTester {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = normalise(label);
  const primary = accounts.filter((account) => !account.ownerTester);
  const labelMatch = (account: ActivationAccount) =>
    normalise([account.displayName, account.email].filter(Boolean).join(" ")).includes(needle);
  const labelled = primary.filter(labelMatch);
  const matches =
    labelled.length === 1
      ? labelled
      : primary.filter((account) => {
          const purpose = Array.isArray(account.purpose) ? account.purpose.join(" ") : account.purpose ?? "";
          return normalise(purpose).includes(needle);
        });
  if (matches.length !== 1) {
    throw new Error(`the activation file does not resolve exactly one approved ${label} account`);
  }
  const account = matches[0];
  if (!account.email) throw new Error(`the approved ${label} account has no email in the activation file`);
  return { ...account, email: account.email };
}

/**
 * Sum wallet positions per currency. Different currencies are never added
 * together; the conservation proof below uses the NGN bucket only.
 */
async function walletTotalsByCurrency(prisma: PrismaClient): Promise<TotalsByCurrency> {
  const wallets = await prisma.wallet.findMany({ select: { currency: true, availableKobo: true, heldKobo: true } });
  const totals: TotalsByCurrency = {};
  for (const wallet of wallets) {
    const bucket = totals[wallet.currency] ?? { availableKobo: 0n, heldKobo: 0n, totalKobo: 0n, wallets: 0 };
    bucket.availableKobo += wallet.availableKobo;
    bucket.heldKobo += wallet.heldKobo;
    bucket.totalKobo += wallet.availableKobo + wallet.heldKobo;
    bucket.wallets += 1;
    totals[wallet.currency] = bucket;
  }
  return totals;
}

async function main() {
  const topupVersion = readTopupVersion();
  const idempotencyKey = `staging-shop-tester02-topup-${topupVersion}`;
  const providerReference = `TEST-STAGING-SHOP-TESTER02-${topupVersion.toUpperCase()}`;
  const transactionReference = `TOPUP-${providerReference}`;
  const url = readStagingDatabaseUrl();
  const target = await verifyTestDatabase({ url, requiredTables: REQUIRED_TABLES });
  if (target.databaseName !== EXPECTED_DATABASE) {
    throw new Error(`refusing: connected database is ${target.databaseName}; this workflow requires ${EXPECTED_DATABASE}`);
  }

  // Only the verified database URL enters this process. The application's own
  // environment is untouched; this flag exists only in the current process.
  process.env.DATABASE_URL = target.url;
  process.env.ENABLE_TEST_PAYMENTS = "true";

  const accounts = loadActivationAccounts();
  const tester02 = findPrimaryTester(accounts, "tester02");
  const tester03 = findPrimaryTester(accounts, "tester03");
  if (tester02.email?.toLowerCase() === tester03.email?.toLowerCase()) {
    throw new Error("tester02 and tester03 resolved to the same account; refusing to continue");
  }

  const { prisma } = await import("../../lib/prisma");
  try {
    const classifications = await prisma.databaseClassification.findMany({
      select: { id: true, classification: true }
    });
    if (
      classifications.length !== 1 ||
      classifications[0]?.id !== "default" ||
      classifications[0]?.classification !== "TEST"
    ) {
      throw new Error(
        `refusing: ${target.databaseName} must have exactly one canonical DatabaseClassification row id="default" with classification TEST`
      );
    }
    const { ensureWallet } = await import("../../lib/payments/service");
    const { createTopUp, creditTopUp, testProviderAllowed } = await import("../../lib/services/core/topup.service");

    if (!testProviderAllowed()) throw new Error("the in-process local test top-up flag is not active");

    const tester02User = await prisma.user.findUnique({
      where: { email: (tester02.email as string).toLowerCase() },
      select: { id: true, email: true }
    });
    if (!tester02User) throw new Error("the approved tester02 account does not exist in the staging database");
    const tester03User = await prisma.user.findUnique({
      where: { email: (tester03.email as string).toLowerCase() },
      select: { id: true, email: true }
    });
    if (!tester03User) {
      throw new Error("the approved tester03 account does not exist; the insufficient-balance case cannot run");
    }

    const tester02Wallet = await ensureWallet(prisma, { userId: tester02User.id, ownerType: "CUSTOMER" });
    if (tester02Wallet.currency !== TOP_UP_CURRENCY) {
      throw new Error(`tester02 wallet currency is ${tester02Wallet.currency}; expected ${TOP_UP_CURRENCY}`);
    }

    // The staging database may not yet have its platform counter-wallet. Creating
    // it at zero is fixture setup; the top-up itself still posts both balanced
    // ledger legs and moves both stored balances.
    await ensureWallet(prisma, { ownerType: "SYSTEM" });
    const platformBefore = await prisma.wallet.findFirst({
      where: { ownerType: "SYSTEM" },
      select: { id: true, availableKobo: true, heldKobo: true, currency: true }
    });
    if (!platformBefore) throw new Error("the platform funding wallet is missing; the ledger cannot be balanced");
    if (platformBefore.currency !== TOP_UP_CURRENCY) {
      throw new Error(`the platform funding wallet is ${platformBefore.currency}; expected ${TOP_UP_CURRENCY}`);
    }

    const existingTopUp = await prisma.walletTopUp.findUnique({
      where: { providerReference: providerReference },
      select: {
        id: true,
        walletId: true,
        amountKobo: true,
        currency: true,
        status: true,
        provider: true,
        idempotencyKey: true
      }
    });
    if (existingTopUp) {
      if (existingTopUp.walletId !== tester02Wallet.id) {
        throw new Error("the deterministic top-up reference belongs to a different wallet; refusing to reuse it");
      }
      if (
        existingTopUp.idempotencyKey !== idempotencyKey ||
        existingTopUp.amountKobo !== TOP_UP_AMOUNT_KOBO ||
        existingTopUp.currency !== TOP_UP_CURRENCY ||
        existingTopUp.provider !== "test"
      ) {
        throw new Error("the deterministic top-up reference exists with different key/amount/currency/provider; refusing to reuse it");
      }
    }

    const testerBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: tester02Wallet.id },
      select: { id: true, availableKobo: true, heldKobo: true }
    });
    const totalsBefore = await walletTotalsByCurrency(prisma);
    const beforeNgn = totalsBefore[TOP_UP_CURRENCY];
    if (!beforeNgn) throw new Error("no NGN wallet positions exist; refusing to prove conservation on an empty bucket");

    const created = await createTopUp(prisma, {
      walletId: tester02Wallet.id,
      amountKobo: TOP_UP_AMOUNT_KOBO,
      provider: "test",
      providerReference: providerReference,
      idempotencyKey: idempotencyKey,
      currency: TOP_UP_CURRENCY
    });
    if (created.topUp.walletId !== tester02Wallet.id) {
      throw new Error("createTopUp resolved a top-up for a different wallet; refusing to credit");
    }
    if (created.topUp.provider !== "test") {
      throw new Error(`the deterministic top-up is provider ${created.topUp.provider}; expected the local test provider`);
    }

    const credited = await creditTopUp(prisma, {
      providerReference: providerReference,
      verifiedAmountKobo: TOP_UP_AMOUNT_KOBO,
      verifiedCurrency: TOP_UP_CURRENCY,
      raw: {
        simulated: true,
        note: "Staging acceptance funding through the local test top-up provider. Not a real payment."
      }
    });
    const creditedStatus = String(credited.status);
    const creditedNow = creditedStatus === "credited";
    if (creditedStatus !== "credited" && creditedStatus !== "already_credited") {
      throw new Error(`unexpected local test top-up result: ${creditedStatus}`);
    }

    const testerAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: tester02Wallet.id },
      select: { id: true, availableKobo: true, heldKobo: true }
    });
    const platformAfter = await prisma.wallet.findFirstOrThrow({
      where: { ownerType: "SYSTEM" },
      select: { id: true, availableKobo: true, heldKobo: true }
    });
    const totalsAfter = await walletTotalsByCurrency(prisma);
    const afterNgn = totalsAfter[TOP_UP_CURRENCY];
    if (!afterNgn) throw new Error("the NGN wallet bucket disappeared during the top-up");

    const expectedTester = creditedNow
      ? testerBefore.availableKobo + TOP_UP_AMOUNT_KOBO
      : testerBefore.availableKobo;
    const expectedPlatform = creditedNow
      ? platformBefore.availableKobo - TOP_UP_AMOUNT_KOBO
      : platformBefore.availableKobo;
    if (testerAfter.availableKobo !== expectedTester) {
      throw new Error(
        `tester02 available balance moved to ${testerAfter.availableKobo}; expected ${expectedTester} (creditedNow=${creditedNow})`
      );
    }
    if (platformAfter.availableKobo !== expectedPlatform) {
      throw new Error(
        `platform funding wallet moved to ${platformAfter.availableKobo}; expected ${expectedPlatform} (creditedNow=${creditedNow})`
      );
    }
    if (afterNgn.totalKobo !== beforeNgn.totalKobo) {
      throw new Error(
        `sum of NGN wallet positions changed from ${beforeNgn.totalKobo} to ${afterNgn.totalKobo}; a top-up must only move funds between wallets`
      );
    }
    if (testerAfter.heldKobo !== testerBefore.heldKobo) {
      throw new Error("a top-up must not change held funds");
    }

    const transaction = await prisma.walletTransaction.findUnique({
      where: { reference: transactionReference },
      include: { ledger: true }
    });
    if (!transaction) throw new Error("the balanced top-up transaction was not found");
    const topUpAfter = await prisma.walletTopUp.findUniqueOrThrow({
      where: { providerReference: providerReference },
      select: { status: true, creditedAt: true }
    });
    if (topUpAfter.status !== "COMPLETED" || !topUpAfter.creditedAt) {
      throw new Error(`the top-up did not reach COMPLETED/creditedAt (status=${topUpAfter.status})`);
    }
    if (transaction.walletId !== tester02Wallet.id) {
      throw new Error("the top-up transaction belongs to a different wallet");
    }
    if (transaction.type !== "credit" || transaction.amountKobo !== TOP_UP_AMOUNT_KOBO) {
      throw new Error(
        `unexpected top-up transaction type/amount: ${transaction.type}/${transaction.amountKobo.toString()}`
      );
    }
    const debits = transaction.ledger.filter((entry) => entry.direction === "DEBIT");
    const credits = transaction.ledger.filter((entry) => entry.direction === "CREDIT");
    const debitTotal = debits.reduce((total, entry) => total + entry.amountKobo, 0n);
    const creditTotal = credits.reduce((total, entry) => total + entry.amountKobo, 0n);
    if (debitTotal !== creditTotal || debitTotal !== TOP_UP_AMOUNT_KOBO) {
      throw new Error(
        `top-up journal is not balanced for the exact amount: debit=${debitTotal.toString()} credit=${creditTotal.toString()}`
      );
    }
    if (debits.length !== 1 || credits.length !== 1) {
      throw new Error(`top-up journal must have one debit and one credit leg; saw ${debits.length}/${credits.length}`);
    }
    if (debits[0].walletId !== platformBefore.id || credits[0].walletId !== tester02Wallet.id) {
      throw new Error("top-up journal wallet ownership does not match the platform/tester02 expectation");
    }

    // Idempotency proof: resubmitting the same key and the same provider
    // reference must return the same row and must not move any balance.
    const replayCreate = await createTopUp(prisma, {
      walletId: tester02Wallet.id,
      amountKobo: TOP_UP_AMOUNT_KOBO,
      provider: "test",
      providerReference: providerReference,
      idempotencyKey: idempotencyKey,
      currency: TOP_UP_CURRENCY
    });
    if (!replayCreate.duplicate || replayCreate.topUp.id !== created.topUp.id) {
      throw new Error("re-submitting the same idempotency key did not return the original top-up");
    }
    const replayCredit = await creditTopUp(prisma, {
      providerReference: providerReference,
      verifiedAmountKobo: TOP_UP_AMOUNT_KOBO,
      verifiedCurrency: TOP_UP_CURRENCY
    });
    if (replayCredit.status !== "already_credited") {
      throw new Error(`re-crediting the same top-up returned ${replayCredit.status}; expected already_credited`);
    }
    const testerAfterProbe = await prisma.wallet.findUniqueOrThrow({
      where: { id: tester02Wallet.id },
      select: { availableKobo: true, heldKobo: true }
    });
    const totalsAfterProbe = await walletTotalsByCurrency(prisma);
    const afterProbeNgn = totalsAfterProbe[TOP_UP_CURRENCY];
    if (
      testerAfterProbe.availableKobo !== testerAfter.availableKobo ||
      testerAfterProbe.heldKobo !== testerAfter.heldKobo ||
      !afterProbeNgn ||
      afterProbeNgn.totalKobo !== afterNgn.totalKobo
    ) {
      throw new Error("the idempotency probe moved a wallet balance");
    }

    // tester03 is deliberately NOT funded and no wallet is created for it.
    const tester03Wallet = await prisma.wallet.findFirst({
      where: { userId: tester03User.id, ownerType: "CUSTOMER" },
      select: { id: true, availableKobo: true, heldKobo: true, currency: true }
    });
    const tester03TestTopUps = tester03Wallet
      ? await prisma.walletTopUp.count({ where: { walletId: tester03Wallet.id, provider: "test" } })
      : 0;

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: target.databaseName,
          classification: "TEST",
          marker: target.marker,
          verificationLevel: "local-test-topup-then-wallet-checkout",
          fundingVersion: topupVersion,
          externalProviderCall: false,
          funds: {
            tester: "tester02",
            amountKobo: TOP_UP_AMOUNT_KOBO.toString(),
            currency: TOP_UP_CURRENCY,
            provider: "test"
          },
          outcomes: {
            topUpCreatedNow: !created.duplicate,
            creditedNow,
            alreadyCredited: credited.status === "already_credited",
            duplicateCreateReturnedOriginal: replayCreate.duplicate,
            duplicateCreditStatus: replayCredit.status
          },
          balances: {
            tester02BeforeKobo: testerBefore.availableKobo.toString(),
            tester02AfterKobo: testerAfter.availableKobo.toString(),
            tester02HeldKobo: testerAfter.heldKobo.toString(),
            platformBeforeKobo: platformBefore.availableKobo.toString(),
            platformAfterKobo: platformAfter.availableKobo.toString(),
            ngnWalletPositionsBeforeKobo: beforeNgn.totalKobo.toString(),
            ngnWalletPositionsAfterKobo: afterNgn.totalKobo.toString(),
            ngnWalletsCounted: afterNgn.wallets,
            currenciesObserved: Object.keys(totalsAfter).sort()
          },
          ledger: {
            transactionReference: transactionReference,
            transactionType: transaction.type,
            amountKobo: transaction.amountKobo.toString(),
            topUpStatus: topUpAfter.status,
            debitLegs: debits.length,
            creditLegs: credits.length,
            debitTotalKobo: debitTotal.toString(),
            creditTotalKobo: creditTotal.toString(),
            balanced: debitTotal === creditTotal
          },
          idempotencyProbe: {
            balanceUnchanged: true,
            duplicateCreate: replayCreate.duplicate,
            duplicateCreditStatus: replayCredit.status
          },
          tester03: {
            present: true,
            fundedByThisScript: false,
            walletExists: Boolean(tester03Wallet),
            availableKobo: tester03Wallet?.availableKobo.toString() ?? "0",
            heldKobo: tester03Wallet?.heldKobo.toString() ?? "0",
            testTopUps: tester03TestTopUps,
            note: "Left unfunded so the insufficient-balance payment refusal is a genuine case. The journey marks it BLOCKED if this balance already covers its cart."
          }
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`STAGING_SHOP_FUNDING_FAILED: ${sanitizeDatabaseError(error)}`);
  process.exitCode = 1;
});
