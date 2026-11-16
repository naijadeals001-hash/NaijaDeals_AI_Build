import { formatKobo } from "@/lib/notifications/templates";
import { notifySafely, type NotifyInput } from "@/lib/services/core/notification-delivery.service";

/**
 * Domain events → notifications.
 *
 * Each helper is called after the business transaction has committed and sends
 * through `notifySafely`, which never throws into the caller. The dedupe key is
 * derived from the entity and the payload, so a replayed webhook or a retried
 * request produces one message.
 *
 * In-app rows are always written; email is added where the recipient is a
 * customer and the message carries money or a status they must act on.
 */

type OrderFacts = { id: string; orderNumber: string; totalKobo: bigint; customerId: string | null };
type RideFacts = { id: string; rideNumber: string; riderId: string; driverName?: string | null };
type ShipmentFacts = { id: string; reference: string; customerId: string };

function channels(money: boolean): NotifyInput["channel"][] {
  return money ? ["IN_APP", "EMAIL"] : ["IN_APP"];
}

async function fanOut(base: Omit<NotifyInput, "channel">, list: NotifyInput["channel"][]) {
  for (const channel of list) {
    await notifySafely({ ...base, channel });
  }
}

export async function notifyOrderPaid(order: OrderFacts): Promise<void> {
  await fanOut(
    {
      userId: order.customerId,
      templateKey: "order.paid",
      eventType: "order.paid",
      entityType: "Order",
      entityId: order.id,
      data: {
        orderNumber: order.orderNumber,
        total: formatKobo(order.totalKobo),
        href: `/orders/${order.id}`
      }
    },
    channels(true)
  );
}

export async function notifyEscrowReleased(order: OrderFacts, amountKobo: bigint): Promise<void> {
  await fanOut(
    {
      userId: order.customerId,
      templateKey: "payment.escrow_released",
      eventType: "payment.escrow_released",
      entityType: "Order",
      entityId: order.id,
      data: {
        orderNumber: order.orderNumber,
        amount: formatKobo(amountKobo),
        href: `/orders/${order.id}`
      }
    },
    channels(true)
  );
}

export async function notifyTopUpCredited(userId: string, amountKobo: bigint, topUpId: string): Promise<void> {
  await fanOut(
    {
      userId,
      templateKey: "payment.topup_credited",
      eventType: "payment.topup_credited",
      entityType: "WalletTopUp",
      entityId: topUpId,
      data: { amount: formatKobo(amountKobo), href: "/wallet" }
    },
    channels(true)
  );
}

export async function notifyRideAssigned(ride: RideFacts): Promise<void> {
  await fanOut(
    {
      userId: ride.riderId,
      templateKey: "dispatch.ride_assigned",
      eventType: "dispatch.ride_assigned",
      entityType: "Ride",
      entityId: ride.id,
      data: {
        rideNumber: ride.rideNumber,
        driver: ride.driverName ?? "Your driver",
        href: `/naijadrive/rides/${ride.id}`
      }
    },
    channels(false)
  );
}

export async function notifyRideExpired(ride: RideFacts): Promise<void> {
  await fanOut(
    {
      userId: ride.riderId,
      templateKey: "dispatch.ride_expired",
      eventType: "dispatch.ride_expired",
      entityType: "Ride",
      entityId: ride.id,
      data: { rideNumber: ride.rideNumber, href: `/naijadrive/rides/${ride.id}` }
    },
    channels(false)
  );
}

export async function notifyShipmentStatus(shipment: ShipmentFacts, status: string): Promise<void> {
  await fanOut(
    {
      userId: shipment.customerId,
      templateKey: "shipment.status_changed",
      eventType: "shipment.status_changed",
      entityType: "LogisticsShipment",
      entityId: shipment.id,
      data: {
        shipmentNumber: shipment.reference,
        status: status.replace(/_/g, " "),
        href: `/naijasend/shipments/${shipment.id}`
      }
    },
    channels(true)
  );
}

export async function notifyBookingConfirmed(
  guestId: string,
  reservation: { id: string; reference: string; checkIn: Date }
): Promise<void> {
  await fanOut(
    {
      userId: guestId,
      templateKey: "booking.confirmed",
      eventType: "booking.confirmed",
      entityType: "StayReservation",
      entityId: reservation.id,
      data: {
        reference: reservation.reference,
        when: reservation.checkIn.toLocaleDateString("en-NG", { dateStyle: "medium" }),
        href: `/naijastay/reservations/${reservation.id}`
      }
    },
    channels(true)
  );
}

export async function notifyProposalAccepted(professionalUserId: string, job: { id: string; title: string }): Promise<void> {
  await fanOut(
    {
      userId: professionalUserId,
      templateKey: "gig.proposal_accepted",
      eventType: "gig.proposal_accepted",
      entityType: "CustomerJob",
      entityId: job.id,
      data: { jobTitle: job.title, href: `/naijagigs/jobs/${job.id}` }
    },
    channels(false)
  );
}
