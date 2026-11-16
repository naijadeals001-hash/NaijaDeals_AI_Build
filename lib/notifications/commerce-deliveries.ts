import type { ClaimedIntent } from "./intent.service";
import { deliverIntentNotification } from "./intent.service";
import { formatKobo } from "./templates";

/**
 * Delivery handlers for commerce lifecycle intents (orders, refunds, payouts).
 *
 * The intent processor calls this only after its own support/order handlers
 * decline the event. Returning false means "not handled here"; the processor
 * then reports the event as unsupported and dead-letters it.
 *
 * Every value below comes from the committed intent payload. Nothing here reads
 * a wallet, recomputes a fee or contacts a payment provider: the business
 * transaction already recorded the money, and this module only renders it.
 * `deliverIntentNotification` derives its notification dedupe key from the
 * intent's own dedupe key, so a retry after a worker crash cannot send twice.
 */

/** Payload schema this build understands. Unknown versions are not handled. */
const SUPPORTED_EVENTS = new Set([
  "order.status_changed",
  "order.delivered",
  "refund.completed",
  "payout.completed"
]);

const PAYLOAD_VERSION = 1;

function requireText(intent: ClaimedIntent, field: string): string {
  const raw = intent.payload[field];
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!text) {
    // A supported event with an incomplete payload is a delivery failure, not
    // an unknown event: surface it so the intent expires with a visible error
    // instead of being silently reported as unsupported.
    throw new Error(`invalid_intent_payload:${intent.eventType}:${field}`);
  }
  return text;
}

/** Parses the exact minor-unit string the transaction wrote. Never arithmetic. */
function requireKoboString(intent: ClaimedIntent, field: string): bigint {
  const text = requireText(intent, field);
  if (!/^\d+$/.test(text)) {
    throw new Error(`invalid_intent_payload:${intent.eventType}:${field}`);
  }
  return BigInt(text);
}


/** Internal destinations only: an intent must never become an open redirect. */
function internalHref(intent: ClaimedIntent, fallback: string): string {
  const raw = intent.payload.href;
  if (raw === undefined || raw === null) return fallback;
  const href = String(raw).trim();
  if (!href.startsWith("/") || href.startsWith("//")) {
    throw new Error(`invalid_intent_payload:${intent.eventType}:href`);
  }
  return href;
}

export async function deliverCommerceEvent(intent: ClaimedIntent): Promise<boolean> {
  if (!SUPPORTED_EVENTS.has(intent.eventType)) return false;

  // A future payload shape belongs to the build that wrote it. Reporting it as
  // unsupported is terminal; rendering it with guessed fields is not safe.
  if (Number(intent.payload.version) !== PAYLOAD_VERSION) return false;

  switch (intent.eventType) {
    case "order.status_changed": {
      const orderNumber = requireText(intent, "orderNumber");
      const status = requireText(intent, "status");
      await deliverIntentNotification(intent, {
        templateKey: "order.status_changed",
        eventType: "order.status_changed",
        data: {
          orderNumber,
          status: status.replace(/_/g, " "),
          href: internalHref(intent, `/orders/${intent.entityId}`)
        }
      });
      return true;
    }
    case "order.delivered": {
      const orderNumber = requireText(intent, "orderNumber");
      const status = typeof intent.payload.status === "string" ? intent.payload.status : "";
      await deliverIntentNotification(intent, {
        templateKey: "order.delivered",
        eventType: "order.delivered",
        data: {
          orderNumber,
          status: status.replace(/_/g, " "),
          href: internalHref(intent, `/orders/${intent.entityId}`)
        }
      });
      return true;
    }
    case "refund.completed": {
      const orderNumber = requireText(intent, "orderNumber");
      const amountKobo = requireKoboString(intent, "amountKobo");
      await deliverIntentNotification(intent, {
        templateKey: "refund.completed",
        eventType: "refund.completed",
        data: {
          orderNumber,
          amount: formatKobo(amountKobo),
          href: internalHref(intent, `/orders/${intent.entityId}`)
        }
      });
      return true;
    }
    case "payout.completed": {
      const amountKobo = requireKoboString(intent, "amountKobo");
      const reference = requireText(intent, "reference");
      await deliverIntentNotification(intent, {
        templateKey: "payout.completed",
        eventType: "payout.completed",
        data: {
          amount: formatKobo(amountKobo),
          reference,
          href: internalHref(intent, "/seller")
        }
      });
      return true;
    }
    default:
      return false;
  }
}
