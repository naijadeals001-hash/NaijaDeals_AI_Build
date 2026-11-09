/** Order status labels shared by server pages and client components. */
export const FRESH_LABELS: Record<string, string> = {
  payment_pending: "Awaiting payment",
  placed: "Order placed",
  accepted: "Accepted by farm",
  packing: "Being packed",
  ready_for_pickup: "Ready for pickup",
  courier_assigned: "Courier assigned",
  picked_up: "Picked up",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled"
};
