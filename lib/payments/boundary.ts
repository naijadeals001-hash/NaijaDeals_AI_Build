import { ApiError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

type Db = typeof prisma;
export type DatabaseClass = "TEST" | "LIVE" | "UNKNOWN";

export async function getDatabaseClassification(client: Db = prisma): Promise<DatabaseClass> {
  const row = await client.databaseClassification.findUnique({ where: { id: "default" } });
  return row?.classification === "TEST" || row?.classification === "LIVE" ? row.classification : "UNKNOWN";
}

function liveEnvironmentFlagsPresent() {
  return process.env.NODE_ENV === "production"
    && process.env.FINANCIAL_ENV === "live"
    && process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS === "true";
}

/** Live money movement is impossible on TEST/UNKNOWN databases, regardless of env flags. */
export async function assertLiveFinancialOperations(operation: string, client: Db = prisma) {
  const classification = await getDatabaseClassification(client);
  if (classification !== "LIVE") {
    throw new ApiError(403, "test_funds_boundary", `${operation} is blocked: database is classified ${classification}. Live operations require a LIVE database.`);
  }
  if (!liveEnvironmentFlagsPresent()) {
    throw new ApiError(403, "test_funds_boundary", `${operation} is blocked: live environment flags are incomplete.`);
  }
}

function providerTestCredential(provider: "paystack" | "flutterwave") {
  const key = provider === "paystack" ? process.env.PAYSTACK_SECRET_KEY : process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) return false;
  return provider === "paystack"
    ? key.startsWith("sk_test_")
    : key.startsWith("FLWSECK_TEST") || key.startsWith("FLWSECK_TEST-");
}

/** Sandbox provider calls are allowed on TEST only with test-shaped credentials. */
export async function assertProviderOperation(operation: string, provider: "paystack" | "flutterwave", client: Db = prisma) {
  const classification = await getDatabaseClassification(client);
  if (classification === "TEST") {
    if (!providerTestCredential(provider)) {
      throw new ApiError(403, "test_funds_boundary", `${operation} is blocked: TEST database requires sandbox credentials for ${provider}.`);
    }
    return;
  }
  if (classification !== "LIVE") {
    throw new ApiError(403, "test_funds_boundary", `${operation} is blocked: database classification is UNKNOWN.`);
  }
  await assertLiveFinancialOperations(operation, client);
  if (providerTestCredential(provider)) {
    throw new ApiError(403, "test_funds_boundary", `${operation} is blocked: test credentials cannot be used against a LIVE database.`);
  }
}
