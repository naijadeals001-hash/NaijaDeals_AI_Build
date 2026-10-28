import { LedgerDirection, type EscrowStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { assertEscrowTransition } from "./state-machines";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { postBalancedTransaction } from "./wallet.service";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createEscrowHold(input: {
  tx: Db;
  actorId: string;
  orderId: string;
  buyerWalletId: string;
  vendorWalletId: string;
  amountKobo: bigint;
  reason: string;
}) {
  const escrow = await input.tx.escrowHold.create({
    data: {
      orderId: input.orderId,
      buyerWalletId: input.buyerWalletId,
      vendorWalletId: input.vendorWalletId,
      amountKobo: input.amountKobo,
      status: "held",
      reason: input.reason,
      events: { create: { from: "pending", to: "held", note: input.reason } }
    },
    include: { events: true }
  });

  await input.tx.wallet.update({
    where: { id: input.buyerWalletId },
    data: {
      availableKobo: { decrement: input.amountKobo },
      heldKobo: { increment: input.amountKobo }
    }
  });

  await postBalancedTransaction({
    tx: input.tx,
    actorId: input.actorId,
    orderId: input.orderId,
    walletId: input.buyerWalletId,
    type: "hold",
    amountKobo: input.amountKobo,
    reference: `ESCROW-HOLD-${input.orderId}`,
    description: `Escrow hold for order ${input.orderId}`,
    entries: [
      { walletId: input.buyerWalletId, direction: LedgerDirection.DEBIT, amountKobo: input.amountKobo, memo: "Buyer funds moved into escrow hold" },
      { walletId: input.vendorWalletId, direction: LedgerDirection.CREDIT, amountKobo: input.amountKobo, memo: "Vendor payable escrow pending release" }
    ]
  });

  await recordSystemEvent({
    tx: input.tx,
    type: "escrow.hold_created",
    actorId: input.actorId,
    entity: "EscrowHold",
    entityId: escrow.id,
    payload: { orderId: input.orderId, amountKobo: input.amountKobo.toString() }
  });
  await recordAudit({
    tx: input.tx,
    actorId: input.actorId,
    action: "escrow.hold_created",
    entity: "EscrowHold",
    entityId: escrow.id,
    metadata: { orderId: input.orderId, amountKobo: input.amountKobo.toString() }
  });

  return escrow;
}

export async function updateEscrowStatus(input: {
  tx: Db;
  actorId?: string | null;
  escrowId: string;
  status: EscrowStatus;
  note?: string;
}) {
  const current = await input.tx.escrowHold.findUniqueOrThrow({ where: { id: input.escrowId } });
  assertEscrowTransition(current.status, input.status);
  const escrow = await input.tx.escrowHold.update({
    where: { id: input.escrowId },
    data: {
      status: input.status,
      events: { create: { from: current.status, to: input.status, note: input.note } }
    }
  });
  await recordSystemEvent({
    tx: input.tx,
    type: "escrow.status_changed",
    actorId: input.actorId,
    entity: "EscrowHold",
    entityId: escrow.id,
    payload: { from: current.status, to: input.status }
  });
  await recordAudit({
    tx: input.tx,
    actorId: input.actorId,
    action: "escrow.status_changed",
    entity: "EscrowHold",
    entityId: escrow.id,
    metadata: { from: current.status, to: input.status }
  });
  return escrow;
}
