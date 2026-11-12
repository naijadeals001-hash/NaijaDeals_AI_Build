import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * Server-side financial boundary for the REVIEW catalogue environment.
 *
 * The classification is read from the database itself, never from a public
 * environment flag, and refused when it cannot be established. This runs at
 * two choke points: every ledger posting and every outbound provider request.
 */
let cached: Promise<string> | null = null;

async function classification(): Promise<string> {
  if (!cached) {
    cached = prisma.databaseClassification
      .findMany({ select: { classification: true } })
      .then((rows) => {
        const value = rows[0]?.classification;
        if (!value) throw new ApiError(503, "financial_environment_unavailable", "Financial environment could not be established.");
        return value;
      })
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

export async function assertFinancialOperationsAllowed(operation: string): Promise<void> {
  const value = await classification();
  if (value === "REVIEW" || value === "UNKNOWN") {
    throw new ApiError(
      403,
      "review_financial_operations_disabled",
      `${operation} is disabled in the REVIEW catalogue environment.`
    );
  }
}
