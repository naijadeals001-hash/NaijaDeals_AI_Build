import type { NotificationCategory, NotificationChannel } from "@prisma/client";

/**
 * Code-defined notification templates.
 *
 * Templates live in git so wording changes are reviewed like any other code
 * change. `NotificationTemplate` rows can override a definition at runtime; a
 * missing row is the normal state, not an error.
 *
 * Every template declares the variables it needs. Rendering fails loudly when a
 * variable is absent rather than sending a message with a blank where a price or
 * an order number should be.
 */

export type TemplateDefinition = {
  key: string;
  category: NotificationCategory;
  required: string[];
  inApp: { title: string; body: string };
  email: { subject: string; body: string };
  sms: { body: string };
  push: { title: string; body: string };
};

const money = (value: string) => `₦${value}`;

export const TEMPLATES: Record<string, TemplateDefinition> = {
  "order.paid": {
    key: "order.paid",
    category: "ORDERS",
    required: ["orderNumber", "total"],
    inApp: {
      title: "Order {{orderNumber}} confirmed",
      body: "We received your payment of {{total}}. Your seller has been notified and escrow is holding the funds until delivery."
    },
    email: {
      subject: "Order {{orderNumber}} is confirmed",
      body: "Hello,\n\nYour order {{orderNumber}} has been paid ({{total}}) and is now with the seller. The money is held in escrow until you confirm delivery.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: order {{orderNumber}} confirmed. {{total}} held in escrow." },
    push: { title: "Order confirmed", body: "{{orderNumber}} · {{total}} held in escrow" }
  },
  "order.status_changed": {
    key: "order.status_changed",
    category: "ORDERS",
    required: ["orderNumber", "status"],
    inApp: {
      title: "Order {{orderNumber}} is now {{status}}",
      body: "The status of order {{orderNumber}} changed to {{status}}."
    },
    email: {
      subject: "Order {{orderNumber}}: {{status}}",
      body: "Hello,\n\nOrder {{orderNumber}} moved to: {{status}}.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: order {{orderNumber}} is now {{status}}." },
    push: { title: "Order update", body: "{{orderNumber}} · {{status}}" }
  },
  "order.delivered": {
    key: "order.delivered",
    category: "ORDERS",
    required: ["orderNumber"],
    inApp: {
      title: "Order {{orderNumber}} delivered",
      body: "Delivery is confirmed. Escrow will release to the seller, and you can still open a dispute from the order page."
    },
    email: {
      subject: "Order {{orderNumber}} delivered",
      body: "Hello,\n\nOrder {{orderNumber}} is marked delivered. If something is wrong, open a dispute from your order page before the escrow window closes.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: order {{orderNumber}} delivered." },
    push: { title: "Delivered", body: "{{orderNumber}} — confirm or dispute" }
  },
  "payment.topup_credited": {
    key: "payment.topup_credited",
    category: "PAYMENTS",
    required: ["amount"],
    inApp: {
      title: "Wallet credited",
      body: "{{amount}} was added to your NaijaPay wallet."
    },
    email: {
      subject: "Your NaijaPay wallet was credited",
      body: "Hello,\n\n{{amount}} was added to your NaijaPay wallet. If you did not request this, contact support.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: {{amount}} credited to your NaijaPay wallet." },
    push: { title: "Wallet credited", body: "+{{amount}}" }
  },
  "payment.escrow_released": {
    key: "payment.escrow_released",
    category: "PAYMENTS",
    required: ["orderNumber", "amount"],
    inApp: {
      title: "Escrow released for {{orderNumber}}",
      body: "{{amount}} moved from escrow to the seller's wallet."
    },
    email: {
      subject: "Escrow released for {{orderNumber}}",
      body: "Hello,\n\n{{amount}} has been released from escrow for order {{orderNumber}}.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: {{amount}} released from escrow for {{orderNumber}}." },
    push: { title: "Escrow released", body: "{{orderNumber}} · {{amount}}" }
  },
  "dispatch.ride_assigned": {
    key: "dispatch.ride_assigned",
    category: "DISPATCH",
    required: ["rideNumber", "driver"],
    inApp: {
      title: "Driver assigned to {{rideNumber}}",
      body: "{{driver}} accepted your ride. The assignment expires if the trip does not start in time."
    },
    email: {
      subject: "Driver assigned to ride {{rideNumber}}",
      body: "Hello,\n\n{{driver}} accepted ride {{rideNumber}}. Open the ride page for the live status.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: {{driver}} accepted ride {{rideNumber}}." },
    push: { title: "Driver assigned", body: "{{driver}} · {{rideNumber}}" }
  },
  "dispatch.ride_expired": {
    key: "dispatch.ride_expired",
    category: "DISPATCH",
    required: ["rideNumber"],
    inApp: {
      title: "Ride {{rideNumber}} returned to the queue",
      body: "The driver did not start in time, so the assignment expired and the ride is open to other drivers again."
    },
    email: {
      subject: "Ride {{rideNumber}} is back in the queue",
      body: "Hello,\n\nRide {{rideNumber}} was not started in time, so it returned to the dispatch queue.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: ride {{rideNumber}} returned to the queue." },
    push: { title: "Ride re-queued", body: "{{rideNumber}}" }
  },
  "shipment.status_changed": {
    key: "shipment.status_changed",
    category: "SHIPMENTS",
    required: ["shipmentNumber", "status"],
    inApp: {
      title: "Shipment {{shipmentNumber}}: {{status}}",
      body: "Your shipment moved to {{status}}."
    },
    email: {
      subject: "Shipment {{shipmentNumber}}: {{status}}",
      body: "Hello,\n\nShipment {{shipmentNumber}} is now {{status}}. Track it from your NaijaSend page.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: shipment {{shipmentNumber}} is now {{status}}." },
    push: { title: "Shipment update", body: "{{shipmentNumber}} · {{status}}" }
  },
  "booking.confirmed": {
    key: "booking.confirmed",
    category: "BOOKINGS",
    required: ["reference", "when"],
    inApp: {
      title: "Booking {{reference}} confirmed",
      body: "Your reservation is confirmed for {{when}}."
    },
    email: {
      subject: "Booking {{reference}} confirmed",
      body: "Hello,\n\nYour booking {{reference}} is confirmed for {{when}}.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: booking {{reference}} confirmed for {{when}}." },
    push: { title: "Booking confirmed", body: "{{reference}} · {{when}}" }
  },
  "booking.cancelled": {
    key: "booking.cancelled",
    category: "BOOKINGS",
    required: ["reference"],
    inApp: {
      title: "Booking {{reference}} cancelled",
      body: "The reservation was cancelled. Any refund is shown on the booking page."
    },
    email: {
      subject: "Booking {{reference}} cancelled",
      body: "Hello,\n\nBooking {{reference}} was cancelled.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: booking {{reference}} cancelled." },
    push: { title: "Booking cancelled", body: "{{reference}}" }
  },
  "gig.proposal_accepted": {
    key: "gig.proposal_accepted",
    category: "BOOKINGS",
    required: ["jobTitle"],
    inApp: {
      title: "Proposal accepted for {{jobTitle}}",
      body: "The customer accepted your proposal. Open the job to agree the milestone schedule."
    },
    email: {
      subject: "Your proposal for {{jobTitle}} was accepted",
      body: "Hello,\n\nYour proposal for {{jobTitle}} was accepted.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: proposal accepted for {{jobTitle}}." },
    push: { title: "Proposal accepted", body: "{{jobTitle}}" }
  },
  "account.verified": {
    key: "account.verified",
    category: "ACCOUNT",
    required: [],
    inApp: {
      title: "Account verified",
      body: "Your identity check is complete. Payouts and higher limits are now available."
    },
    email: {
      subject: "Your NaijaDeals account is verified",
      body: "Hello,\n\nYour account is now verified.\n\nNaijaDeals"
    },
    sms: { body: "NaijaDeals: your account is verified." },
    push: { title: "Account verified", body: "You can now receive payouts" }
  }
};

export class TemplateDataMissing extends Error {
  constructor(readonly templateKey: string, readonly missing: string[]) {
    super(`template_missing_variables:${templateKey}:${missing.join(",")}`);
  }
}

function fill(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const value = data[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

export type RenderedTemplate = { title: string; body: string; subject?: string };

/**
 * Renders one channel of a template. `override` is a database row when an
 * operator changed the wording; its body is used verbatim.
 */
export function renderTemplate(
  key: string,
  channel: NotificationChannel,
  data: Record<string, unknown>,
  override?: { subject?: string | null; body: string } | null
): RenderedTemplate {
  const definition = TEMPLATES[key];
  if (!definition) throw new Error(`unknown_template:${key}`);

  const missing = definition.required.filter((name) => {
    const value = data[name];
    return value === undefined || value === null || String(value).trim() === "";
  });
  if (missing.length) throw new TemplateDataMissing(key, missing);

  if (override) {
    return {
      title: fill(override.subject ?? definition.inApp.title, data),
      body: fill(override.body, data),
      subject: override.subject ? fill(override.subject, data) : undefined
    };
  }

  switch (channel) {
    case "EMAIL":
      return {
        title: fill(definition.email.subject, data),
        subject: fill(definition.email.subject, data),
        body: fill(definition.email.body, data)
      };
    case "SMS":
      return { title: fill(definition.sms.body, data), body: fill(definition.sms.body, data) };
    case "PUSH":
      return { title: fill(definition.push.title, data), body: fill(definition.push.body, data) };
    case "IN_APP":
    default:
      return { title: fill(definition.inApp.title, data), body: fill(definition.inApp.body, data) };
  }
}

export function templateCategory(key: string): NotificationCategory {
  return TEMPLATES[key]?.category ?? "SYSTEM";
}

/** Formats an integer kobo amount for a message. Never used for arithmetic. */
export function formatKobo(amountKobo: bigint | number): string {
  const value = typeof amountKobo === "bigint" ? amountKobo : BigInt(Math.trunc(amountKobo));
  return money((value / 100n).toLocaleString("en-NG"));
}
