import type { EscrowHold, ServiceResult } from "@/lib/services/types";

export async function createEscrowHold(orderId: string, amountKobo: number): ServiceResult<EscrowHold> {
  // TODO(backend): Hold funds through wallet ledger/payment provider and store release conditions.
  return { id: "esc_demo_2843", orderId, amountKobo, status: "held" };
}

export async function releaseEscrow(holdId: string): ServiceResult<EscrowHold> {
  // TODO(backend): Verify QR/proof events, dispute state, and vendor payout eligibility before release.
  return { id: holdId, orderId: "ord_demo_2843", amountKobo: 4250000, status: "released" };
}

export async function refundEscrow(holdId: string): ServiceResult<EscrowHold> {
  // TODO(backend): Apply dispute/refund rules and write both customer refund and merchant audit entries.
  return { id: holdId, orderId: "ord_demo_2843", amountKobo: 4250000, status: "refunded" };
}
