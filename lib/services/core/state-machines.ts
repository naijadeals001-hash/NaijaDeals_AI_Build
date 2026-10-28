import type { DeliveryStatus, EscrowStatus, OrderStatus } from "@prisma/client";
import { ApiError } from "@/lib/auth/guard";

export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  created: ["payment_pending", "cancelled"],
  payment_pending: ["escrow_held", "cancelled"],
  escrow_held: ["vendor_notified", "disputed", "refunded"],
  vendor_notified: ["accepted", "cancelled", "disputed", "refunded"],
  accepted: ["preparing", "cancelled", "disputed", "refunded"],
  preparing: ["ready_for_pickup", "disputed", "refunded"],
  ready_for_pickup: ["courier_assigned", "disputed", "refunded"],
  courier_assigned: ["picked_up", "disputed", "refunded"],
  picked_up: ["in_transit", "disputed", "refunded"],
  in_transit: ["delivered", "disputed", "refunded"],
  delivered: ["completed", "disputed", "refunded"],
  completed: ["refunded"],
  cancelled: ["refunded"],
  disputed: ["refunded", "completed"],
  refunded: []
};

export const escrowTransitions: Record<EscrowStatus, EscrowStatus[]> = {
  pending: ["held", "refunded"],
  held: ["release_eligible", "refund_requested", "reserved", "disputed"],
  release_eligible: ["released", "disputed"],
  released: [],
  refund_requested: ["refunded", "disputed"],
  refunded: [],
  reserved: ["release_eligible", "refund_requested", "disputed"],
  disputed: ["released", "refunded", "reserved"]
};

export const deliveryTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending_assignment: ["assigned", "failed"],
  assigned: ["pickup_started", "failed"],
  pickup_started: ["picked_up", "failed"],
  picked_up: ["in_transit", "failed", "returned"],
  in_transit: ["delivery_attempted", "delivered", "failed", "returned"],
  delivery_attempted: ["delivered", "failed", "returned", "assigned"],
  delivered: [],
  failed: ["assigned", "returned"],
  returned: []
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return;
  if (!orderTransitions[from]?.includes(to)) {
    throw new ApiError(409, "invalid_transition", `Cannot move order from ${from} to ${to}.`);
  }
}

export function assertEscrowTransition(from: EscrowStatus, to: EscrowStatus) {
  if (from === to) return;
  if (!escrowTransitions[from]?.includes(to)) {
    throw new ApiError(409, "invalid_transition", `Cannot move escrow from ${from} to ${to}.`);
  }
}

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus) {
  if (from === to) return;
  if (!deliveryTransitions[from]?.includes(to)) {
    throw new ApiError(409, "invalid_transition", `Cannot move delivery from ${from} to ${to}.`);
  }
}
