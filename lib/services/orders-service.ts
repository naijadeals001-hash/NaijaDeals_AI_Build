import type { OrderRecord, ServiceResult } from "@/lib/services/types";

export async function createOrder(userId: string, totalKobo: number): ServiceResult<OrderRecord> {
  // TODO(backend): Create order rows, reserve inventory/capacity, calculate fees, and start escrow/payment intent.
  return {
    id: "ord_demo_2843",
    userId,
    vendorId: "v_bal_001",
    status: "draft",
    totalKobo,
    escrowHoldId: "esc_demo_2843"
  };
}

export async function getOrder(orderId: string): ServiceResult<OrderRecord> {
  // TODO(backend): Fetch order with items, fulfillment mission, payment state, dispute state, and audit trail.
  return {
    id: orderId,
    userId: "usr_demo_001",
    vendorId: "v_bal_001",
    status: "in_transit",
    totalKobo: 5080000,
    escrowHoldId: "esc_demo_2843"
  };
}
