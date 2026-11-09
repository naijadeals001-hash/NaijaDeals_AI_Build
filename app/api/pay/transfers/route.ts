import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import {
  sendP2PTransferFromApp,
  P2P_TRANSFER_LIMIT_KOBO,
  P2P_TRANSFER_MIN_KOBO
} from "@/lib/services/core/transfer.service";

export const dynamic = "force-dynamic";

/**
 * Peer-to-peer NaijaPay transfers.
 *
 * Activated only when ENABLE_P2P_TRANSFERS=true. That flag is a development
 * switch, not a production control: lib/payments/boundary.ts separately refuses
 * live money movement on a TEST-classified database whatever the flag says.
 *
 * The browser is never trusted for money. The sender is taken from the session,
 * the amount must be a positive integer inside the published limits, and the
 * recipient is re-resolved on the server at the moment of posting so a client
 * cannot pay a different account than the one it reviewed.
 */
function transfersEnabled() {
  return process.env.ENABLE_P2P_TRANSFERS === "true";
}

/** The masking used for recipient lookup so a screen cannot be used to enumerate emails. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({
      enabled: transfersEnabled(),
      limits: { minKobo: P2P_TRANSFER_MIN_KOBO.toString(), maxKobo: P2P_TRANSFER_LIMIT_KOBO.toString() }
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Recipient lookup for the confirmation step.
 *
 * Accepts a NaijaPay identifier (email). Returns only what the payer needs to
 * confirm they have the right person: a display name and a masked address. It
 * never returns the recipient's wallet id, balance or transaction data.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    if (!transfersEnabled()) {
      return NextResponse.json(
        {
          error: "Transfers are not active yet. Send money stays disabled until reconciliation, idempotency and concurrency gates pass in this environment.",
          code: "transfers_disabled"
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    if (body?.action === "lookup") {
      const identifier = String(body?.identifier ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier)) {
        return NextResponse.json({ error: "Enter the recipient's NaijaPay email address.", code: "invalid_identifier" }, { status: 400 });
      }
      const recipient = await prisma.user.findUnique({
        where: { email: identifier },
        select: { id: true, name: true, email: true, wallets: { select: { id: true } } }
      });
      if (!recipient || recipient.wallets.length === 0) {
        return NextResponse.json({ error: "No NaijaPay wallet exists for that address.", code: "recipient_not_found" }, { status: 404 });
      }
      if (recipient.id === user.id) {
        return NextResponse.json({ error: "That is your own address. Choose someone else.", code: "self_transfer" }, { status: 400 });
      }
      return NextResponse.json({
        recipient: { name: recipient.name, identifier: recipient.email, maskedIdentifier: maskEmail(recipient.email) }
      });
    }

    const amountKobo = Number(body?.amountKobo);
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
      return NextResponse.json({ error: "Provide amountKobo as a positive integer.", code: "invalid_amount" }, { status: 400 });
    }
    if (amountKobo < Number(P2P_TRANSFER_MIN_KOBO) || amountKobo > Number(P2P_TRANSFER_LIMIT_KOBO)) {
      return NextResponse.json(
        {
          error: `Transfers must be between ₦${Number(P2P_TRANSFER_MIN_KOBO) / 100} and ₦${(Number(P2P_TRANSFER_LIMIT_KOBO) / 100).toLocaleString("en-NG")}.`,
          code: "amount_out_of_range"
        },
        { status: 400 }
      );
    }

    const recipientEmail = String(body?.recipientEmail ?? "").trim().toLowerCase();
    const idempotencyKey = String(body?.idempotencyKey ?? "").trim();
    if (!recipientEmail) {
      return NextResponse.json({ error: "A recipient is required.", code: "recipient_required" }, { status: 400 });
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: "A retry key is required so a repeated request cannot send twice.", code: "idempotency_key_required" }, { status: 400 });
    }

    const result = await sendP2PTransferFromApp({
      senderUserId: user.id,
      recipientEmail,
      amountKobo: BigInt(amountKobo),
      idempotencyKey,
      note: typeof body?.note === "string" ? body.note.slice(0, 140) : undefined
    });

    await recordAudit({
      actorId: user.id,
      action: "pay.p2p_transfer",
      entity: "WalletTransaction",
      entityId: result.transactionId,
      metadata: { reference: result.reference, duplicate: result.duplicate, amountKobo: String(amountKobo) }
    });

    return NextResponse.json(
      { ...result, status: "completed", amountKobo: String(amountKobo) },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
