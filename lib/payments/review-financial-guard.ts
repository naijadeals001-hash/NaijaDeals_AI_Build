import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * Server-side financial boundary for the REVIEW catalogue environment.
 *
 * The classification is read from the database itself, never from a public
 * environment flag, and refused when it cannot be established. This runs at
 * two choke points: every ledger posting and every outbound provider request,
 * plus the payment/refund/payout service entry points.
 *
 * Fail-closed rules:
 *
 *  - only an explicit `TEST` or `LIVE` classification permits financial work;
 *  - `REVIEW` and `UNKNOWN` are refused with a 403;
 *  - a missing row, more than one classification row (ambiguous), an empty
 *    value, an unrecognised value or a read failure is refused with a 503.
 *    A future or corrupted classification must never silently enable money;
 *  - the row is re-read on every check. A process that started while the
 *    database was TEST must observe a later switch to REVIEW instead of
 *    trusting a cached value.
 *
 * "Financial operations" here means anything that can move or reserve money:
 * provider requests, payment initialization/confirmation, refunds (internal and
 * external), payouts, ledger postings and wallet balance projections. Reading
 * the classification or writing an audit event is not a financial operation.
 */
type ClassificationRow = { classification: string };
type ReadClassification = () => Promise<ClassificationRow[]>;

const PERMITTED = new Set(["TEST", "LIVE"]);

async function readRows(): Promise<ClassificationRow[]> {
  return prisma.databaseClassification.findMany({ select: { classification: true } });
}

async function classification(read: ReadClassification): Promise<string> {
  let rows: ClassificationRow[];
  try {
    rows = await read();
  } catch {
    throw new ApiError(503, "financial_environment_unavailable", "Financial environment could not be established.");
  }
  // The canonical identity is the single row seeded by the classification
  // migration. More than one row is ambiguous and must not be resolved by
  // whatever order the database returned.
  if (rows.length !== 1) {
    throw new ApiError(
      503,
      "financial_environment_unavailable",
      "Financial environment could not be established: the database classification is missing or ambiguous."
    );
  }
  const value = rows[0]?.classification;
  if (!value) {
    throw new ApiError(503, "financial_environment_unavailable", "Financial environment could not be established.");
  }
  return value;
}

/**
 * @param operation human-readable operation name used in the refusal message
 * @param read optional reader seam for boundary tests; production always reads
 *             the database through Prisma
 */
export async function assertFinancialOperationsAllowed(
  operation: string,
  read: ReadClassification = readRows
): Promise<void> {
  const value = await classification(read);
  if (PERMITTED.has(value)) return;
  if (value === "REVIEW" || value === "UNKNOWN") {
    throw new ApiError(
      403,
      "review_financial_operations_disabled",
      `${operation} is disabled in the REVIEW catalogue environment.`
    );
  }
  throw new ApiError(
    503,
    "financial_environment_unavailable",
    `Financial environment classification ${JSON.stringify(value)} is not recognised; ${operation} is disabled.`
  );
}
