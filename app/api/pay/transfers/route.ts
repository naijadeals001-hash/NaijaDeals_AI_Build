import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { sendP2PTransferFromApp } from "@/lib/services/core/transfer.service";

export const dynamic = "force-dynamic";

/**
 * Peer-to-peer NaijaPay transfers.
 *
 * Activated only when ENABLE_P2P_TRANSFERS=true AND financial-safety tests
 * (scripts/pay-transfer-tests.ts) pass against the target environment.
 * Until then every request receives an honest unavailable response and no
 * ledger rows are created.
 */
function transfersEnabled() {
  return process.env.ENABLE_P2P_TRANSFERS === "true";
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ enabled: transfersEnabled() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!transfersEnabled()) {
      return NextResponse.json(
        { error: "Transfers are not active yet. Send money stays disabled until reconciliation, idempotency and concurrency gates pass in this environment.", code: "transfers_disabled" },
        { status: 503 }
      );
    }
    const body = await request.json().catch(() => null);
    const amountKobo = Number(body?.amountKobo);
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
      return NextResponse.json({ error: "Provide amountKobo as a positive integer.", code: "invalid_amount" }, { status: 400 });
    }
    const result = await sendP2PTransferFromApp({
      senderUserId: user.id,
      recipientEmail: String(body?.recipientEmail ?? ""),
      amountKobo: BigInt(amountKobo),
      idempotencyKey: String(body?.idempotencyKey ?? "")
    });
    await recordAudit({
      actorId: user.id,
      action: "pay.p2p_transfer",
      entity: "WalletTransaction",
      entityId: result.transactionId,
      metadata: { reference: result.reference, duplicate: result.duplicate }
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
