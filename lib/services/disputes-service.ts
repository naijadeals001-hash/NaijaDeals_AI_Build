import type { DisputeCase, ServiceResult } from "@/lib/services/types";

export async function openDispute(orderId: string, reason: string): ServiceResult<DisputeCase> {
  // TODO(backend): Attach evidence, pause escrow release, notify merchant, and start SLA timer.
  return { id: "dsp_demo_441", orderId, reason, status: "open" };
}

export async function resolveDispute(disputeId: string, outcome: "refund" | "release" | "partial_refund"): ServiceResult<DisputeCase> {
  // TODO(backend): Apply reviewer decision, trigger escrow action, and write support/audit notes.
  void outcome;
  return { id: disputeId, orderId: "ord_demo_2843", reason: "Damaged item", status: "resolved" };
}
