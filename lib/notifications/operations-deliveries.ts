import type { ClaimedIntent } from "./intent.service";
import { deliverIntentNotification } from "./intent.service";

/**
 * Delivery handlers for operations intents: onboarding reminders, the daily
 * report and backup alerts.
 *
 * Every value is read from the committed intent payload. Nothing here reads a
 * wallet, recomputes money or contacts a backup provider; the scan or the
 * backup job already recorded the fact, and this module only renders it.
 *
 * A supported event with an incomplete payload throws, so the intent expires
 * with a visible error instead of being reported as unsupported. A future
 * payload shape (version other than 1) is declined, exactly like the commerce
 * handlers: the build that wrote it owns its rendering.
 */

const SUPPORTED_EVENTS = new Set([
  "onboarding.reminder",
  "ops.daily_report",
  "ops.backup_succeeded",
  "ops.backup_failed",
  "ops.backup_stale"
]);

const PAYLOAD_VERSION = 1;
const ONBOARDING_KINDS = new Set(["seller", "restaurant", "driver"]);
const BACKUP_TARGETS = new Set(["staging-db", "n8n", "files"]);

function requireText(intent: ClaimedIntent, field: string): string {
  const raw = intent.payload[field];
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!text) throw new Error(`invalid_intent_payload:${intent.eventType}:${field}`);
  return text;
}

/** A textual field that may legitimately be empty (an absent detail line). */
function requireOptionalText(intent: ClaimedIntent, field: string, max = 500): string {
  const raw = intent.payload[field];
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error(`invalid_intent_payload:${intent.eventType}:${field}`);
  const text = raw.trim();
  if (text.length > max) throw new Error(`invalid_intent_payload:${intent.eventType}:${field}`);
  return text;
}

function formatInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Internal destinations only: an intent must never become an open redirect. */
function requireInternalHref(intent: ClaimedIntent): string {
  const href = requireText(intent, "href");
  if (!href.startsWith("/") || href.startsWith("//")) {
    throw new Error(`invalid_intent_payload:${intent.eventType}:href`);
  }
  return href;
}

export async function deliverOperationsEvent(intent: ClaimedIntent): Promise<boolean> {
  if (!SUPPORTED_EVENTS.has(intent.eventType)) return false;
  if (Number(intent.payload.version) !== PAYLOAD_VERSION) return false;

  switch (intent.eventType) {
    case "onboarding.reminder": {
      const kind = requireText(intent, "kind");
      if (!ONBOARDING_KINDS.has(kind)) throw new Error(`invalid_intent_payload:${intent.eventType}:kind`);
      const status = requireText(intent, "status");
      const href = requireInternalHref(intent);
      // The raw row status is bookkeeping; the applicant message describes the
      // actual next step rather than echoing "submitted" back at them.
      const statusLabel = kind === "driver" ? "awaiting approval" : "awaiting review";
      await deliverIntentNotification(intent, {
        templateKey: "onboarding.reminder",
        eventType: "onboarding.reminder",
        data: { kind, status: statusLabel, href }
      });
      return true;
    }
    case "ops.daily_report": {
      const date = requireText(intent, "date");
      const summary = requireText(intent, "summary");
      await deliverIntentNotification(intent, {
        templateKey: "ops.daily_report",
        eventType: "ops.daily_report",
        data: { date, summary }
      });
      return true;
    }
    case "ops.backup_succeeded":
    case "ops.backup_failed": {
      const target = requireText(intent, "target");
      if (!BACKUP_TARGETS.has(target)) throw new Error(`invalid_intent_payload:${intent.eventType}:target`);
      const runId = requireText(intent, "runId");
      const finishedAt = requireText(intent, "finishedAt");
      if (Number.isNaN(new Date(finishedAt).getTime())) {
        throw new Error(`invalid_intent_payload:${intent.eventType}:finishedAt`);
      }
      const message = requireOptionalText(intent, "message") || "No additional details were provided.";
      await deliverIntentNotification(intent, {
        templateKey: intent.eventType,
        eventType: intent.eventType,
        data: { target, runId, finishedAt: formatInstant(finishedAt), message }
      });
      return true;
    }
    case "ops.backup_stale": {
      const date = requireText(intent, "date");
      const raw = intent.payload.lastSuccessAt;
      let lastSuccessAt = "none recorded";
      if (typeof raw === "string" && raw.trim()) {
        if (Number.isNaN(new Date(raw).getTime())) {
          throw new Error(`invalid_intent_payload:${intent.eventType}:lastSuccessAt`);
        }
        lastSuccessAt = formatInstant(raw);
      } else if (raw !== null && raw !== undefined) {
        throw new Error(`invalid_intent_payload:${intent.eventType}:lastSuccessAt`);
      }
      await deliverIntentNotification(intent, {
        templateKey: "ops.backup_stale",
        eventType: "ops.backup_stale",
        data: { date, lastSuccessAt }
      });
      return true;
    }
    default:
      return false;
  }
}
